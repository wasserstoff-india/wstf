/**
 * Mempool Reconciler
 *
 * Handles mempool state reconciliation after chain events:
 * - Block commit: remove included txs, update nonces
 * - Reorg: re-insert txs from orphaned blocks
 * - Sync with Pending Index for conflict tracking
 */
import { EventEmitter } from 'events';
import { MempoolStore, MempoolTransaction } from './store';
import { PendingIndex } from '../fastpath/pending/pendingIndex';
import { PendingTxRef } from '../fastpath/pending/types';

/**
 * Block commit info for reconciliation
 */
export interface BlockCommitInfo {
  hash: string;
  height: bigint;
  txIds: string[];
  /** Mapping of sender -> committed nonce */
  senderNonces: Map<string, bigint>;
  /** State changes in this block */
  stateChanges?: Map<string, string>;
}

/**
 * Reorg info for reconciliation
 */
export interface ReorgInfo {
  /** Orphaned blocks (newest first) */
  orphanedBlocks: BlockCommitInfo[];
  /** New blocks (oldest first) */
  newBlocks: BlockCommitInfo[];
  /** Common ancestor hash */
  forkPoint: string;
}

/**
 * Reconciliation result
 */
export interface ReconcileResult {
  /** Txs removed from mempool (included in block) */
  removed: string[];
  /** Txs re-inserted (from orphaned blocks) */
  reinserted: string[];
  /** Txs that failed re-insertion */
  failed: Array<{ txId: string; reason: string }>;
  /** Txs invalidated by reorg (conflicting state) */
  invalidated: string[];
}

/**
 * Reconciler events
 */
export interface ReconcilerEvents {
  'block:commit': (info: BlockCommitInfo) => void;
  'reorg:start': (info: ReorgInfo) => void;
  'reorg:complete': (result: ReconcileResult) => void;
  'tx:removed': (txId: string, reason: 'included' | 'invalidated') => void;
  'tx:reinserted': (txId: string) => void;
}

/**
 * Reconciler configuration
 */
export interface ReconcilerConfig {
  /** Max reorg depth to process */
  maxReorgDepth: number;
  /** Whether to re-insert orphaned txs */
  reinsertOrphanedTxs: boolean;
  /** Whether to sync with Pending Index */
  syncPendingIndex: boolean;
}

/**
 * Default reconciler config
 */
export const DEFAULT_RECONCILER_CONFIG: ReconcilerConfig = {
  maxReorgDepth: 100,
  reinsertOrphanedTxs: true,
  syncPendingIndex: true,
};

/**
 * Mempool Reconciler
 */
export class MempoolReconciler extends EventEmitter {
  private store: MempoolStore;
  private pendingIndex: PendingIndex | null;
  private config: ReconcilerConfig;

  // Track orphaned txs for potential re-insertion
  private orphanedTxs = new Map<string, MempoolTransaction>();

  constructor(
    store: MempoolStore,
    pendingIndex: PendingIndex | null = null,
    config: ReconcilerConfig = DEFAULT_RECONCILER_CONFIG
  ) {
    super();
    this.store = store;
    this.pendingIndex = pendingIndex;
    this.config = config;
  }

  /**
   * Handle block commit - remove included txs and update state
   */
  onBlockCommit(info: BlockCommitInfo): ReconcileResult {
    const removed: string[] = [];
    const invalidated: string[] = [];

    // Remove included txs from mempool
    for (const txId of info.txIds) {
      if (this.store.remove(txId)) {
        removed.push(txId);
        this.emit('tx:removed', txId, 'included');
      }
    }

    // Update Pending Index with committed nonces
    if (this.pendingIndex && this.config.syncPendingIndex) {
      for (const [sender, nonce] of info.senderNonces) {
        // Update base nonce (next expected = committed + 1)
        this.pendingIndex.setBaseNonce(sender, nonce + 1n);

        // Mark tx as committed
        this.pendingIndex.onCommit(sender, nonce);
      }
    }

    // Check for txs that are now invalid due to state changes
    if (info.stateChanges && this.pendingIndex && this.config.syncPendingIndex) {
      const allTxs = this.store.getAll();

      for (const mtx of allTxs) {
        const tx = mtx.tx;

        // Check if tx expected versions conflict with new state
        if (tx.expected && Array.isArray(tx.expected)) {
          for (const [stateId, expectedVersion] of tx.expected) {
            const newVersion = info.stateChanges.get(stateId);
            if (newVersion && newVersion !== expectedVersion) {
              // Tx is now invalid
              this.store.remove(mtx.id);
              invalidated.push(mtx.id);
              this.emit('tx:removed', mtx.id, 'invalidated');
              break;
            }
          }
        }
      }
    }

    this.emit('block:commit', info);

    return {
      removed,
      reinserted: [],
      failed: [],
      invalidated,
    };
  }

  /**
   * Handle reorg - reinsert orphaned txs
   */
  async onReorg(info: ReorgInfo): Promise<ReconcileResult> {
    // Check reorg depth
    if (info.orphanedBlocks.length > this.config.maxReorgDepth) {
      throw new Error(`Reorg depth ${info.orphanedBlocks.length} exceeds max ${this.config.maxReorgDepth}`);
    }

    this.emit('reorg:start', info);

    const removed: string[] = [];
    const reinserted: string[] = [];
    const failed: Array<{ txId: string; reason: string }> = [];
    const invalidated: string[] = [];

    // Collect txs from orphaned blocks for potential re-insertion
    const orphanedTxs = new Map<string, any>();
    const committedTxIds = new Set<string>();

    // First, collect all txs from orphaned blocks
    for (const block of info.orphanedBlocks) {
      for (const txId of block.txIds) {
        orphanedTxs.set(txId, null); // We'd need the actual tx here
      }
    }

    // Collect txs that are in the new blocks (don't re-insert these)
    for (const block of info.newBlocks) {
      for (const txId of block.txIds) {
        committedTxIds.add(txId);
      }
    }

    // Remove txs that are in new blocks from mempool
    for (const txId of committedTxIds) {
      if (this.store.remove(txId)) {
        removed.push(txId);
      }
    }

    // Update Pending Index with new nonces from new blocks
    if (this.pendingIndex && this.config.syncPendingIndex) {
      // Reset all sender nonces based on new chain
      for (const block of info.newBlocks) {
        for (const [sender, nonce] of block.senderNonces) {
          this.pendingIndex.setBaseNonce(sender, nonce + 1n);
        }
      }
    }

    // Re-insert orphaned txs that weren't included in new chain
    if (this.config.reinsertOrphanedTxs) {
      for (const [txId] of orphanedTxs) {
        if (committedTxIds.has(txId)) {
          continue; // Already in new chain
        }

        // Try to get tx from orphaned pool
        const mtx = this.orphanedTxs.get(txId);
        if (!mtx) {
          failed.push({ txId, reason: 'TX_NOT_FOUND' });
          continue;
        }

        // Try to re-add to mempool
        const result = this.store.add(mtx.tx);
        if (result.ok) {
          reinserted.push(txId);
          this.emit('tx:reinserted', txId);

          // Sync with Pending Index
          if (this.pendingIndex && this.config.syncPendingIndex) {
            this.syncTxToPendingIndex(mtx);
          }
        } else {
          failed.push({ txId, reason: result.code || 'ADD_FAILED' });
          invalidated.push(txId);
        }
      }
    }

    const result: ReconcileResult = {
      removed,
      reinserted,
      failed,
      invalidated,
    };

    this.emit('reorg:complete', result);
    return result;
  }

  /**
   * Sync a transaction to the Pending Index
   */
  private syncTxToPendingIndex(mtx: MempoolTransaction): void {
    if (!this.pendingIndex) return;

    const tx = mtx.tx;

    const pendingRef: PendingTxRef = {
      txId: mtx.id,
      from: mtx.from,
      nonce: BigInt(tx.nonce || 0),
      stateTouches: tx.states || [],
      expected: new Map(tx.expected || []),
      lockWrites: tx.lockWrites || false,
      arrivedAt: mtx.receivedAt,
    };

    this.pendingIndex.onAdmit(pendingRef);
  }

  /**
   * Full sync of mempool with Pending Index
   * Call this on startup or after major state changes
   */
  fullSync(): void {
    if (!this.pendingIndex || !this.config.syncPendingIndex) return;

    // Clear Pending Index
    this.pendingIndex.clear();

    // Add all mempool txs to Pending Index
    const allTxs = this.store.getAll();

    for (const mtx of allTxs) {
      this.syncTxToPendingIndex(mtx);
    }
  }

  /**
   * Store orphaned tx for potential re-insertion
   */
  storeOrphanedTx(mtx: MempoolTransaction): void {
    this.orphanedTxs.set(mtx.id, mtx);

    // Limit orphaned tx storage
    if (this.orphanedTxs.size > this.config.maxReorgDepth * 100) {
      // Remove oldest
      const first = this.orphanedTxs.keys().next().value;
      if (first) {
        this.orphanedTxs.delete(first);
      }
    }
  }

  /**
   * Clear orphaned tx storage
   */
  clearOrphanedTxs(): void {
    this.orphanedTxs.clear();
  }

  /**
   * Get stats
   */
  getStats(): {
    orphanedTxCount: number;
    mempoolStats: ReturnType<MempoolStore['getStats']>;
  } {
    return {
      orphanedTxCount: this.orphanedTxs.size,
      mempoolStats: this.store.getStats(),
    };
  }
}
