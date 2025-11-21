/**
 * Confirmation tracker - tracks transaction progress through tiers
 */
import { EventEmitter } from 'events';
import {
  ConfirmationTier,
  ConfirmationConfig,
  DEFAULT_CONFIRMATION_CONFIG,
  getKDepth,
} from './types';

/**
 * Tracked transaction state
 */
export interface TrackedTx {
  txId: string;
  from: string;
  nonce: bigint;

  /** Current confirmation tier */
  tier: ConfirmationTier;

  /** Trust score (from application layer) */
  trustScore: number;

  /** Required tier for this tx to be considered "done" */
  requiredTier: ConfirmationTier;

  /** Timestamps for each tier reached */
  timestamps: {
    preflight?: number;
    admitted?: number;
    included?: number;
    kDepth?: number;
    crossChain?: number;
  };

  /** Block info (if included) */
  block?: {
    hash: string;
    height: bigint;
  };

  /** K-depth tracking */
  kDepthTarget?: number;
  currentDepth?: number;

  /** Cross-chain journal info */
  journal?: {
    txHash: string;
    chain: string;
    timestamp: number;
  };
}

/**
 * Confirmation events
 */
export interface ConfirmationEvents {
  'tier:preflight': (tx: TrackedTx) => void;
  'tier:admitted': (tx: TrackedTx) => void;
  'tier:included': (tx: TrackedTx) => void;
  'tier:kDepth': (tx: TrackedTx) => void;
  'tier:crossChain': (tx: TrackedTx) => void;
  'tier:reorg': (tx: TrackedTx, fromTier: ConfirmationTier) => void;
  'complete': (tx: TrackedTx) => void;
}

/**
 * Confirmation tracker service
 */
export class ConfirmationTracker extends EventEmitter {
  private tracked = new Map<string, TrackedTx>();
  private byBlock = new Map<string, Set<string>>(); // blockHash -> txIds
  private config: ConfirmationConfig;

  constructor(config: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG) {
    super();
    this.config = config;
  }

  /**
   * Start tracking a transaction at preflight stage
   */
  trackPreflight(
    txId: string,
    from: string,
    nonce: bigint,
    trustScore: number,
    requiredTier: ConfirmationTier
  ): TrackedTx {
    const tx: TrackedTx = {
      txId,
      from,
      nonce,
      tier: ConfirmationTier.PREFLIGHT,
      trustScore,
      requiredTier,
      timestamps: {
        preflight: Date.now(),
      },
    };

    this.tracked.set(txId, tx);
    this.emit('tier:preflight', tx);

    if (requiredTier === ConfirmationTier.PREFLIGHT) {
      this.emit('complete', tx);
    }

    return tx;
  }

  /**
   * Mark transaction as admitted to mempool
   */
  markAdmitted(txId: string): TrackedTx | undefined {
    const tx = this.tracked.get(txId);
    if (!tx) return undefined;

    tx.tier = ConfirmationTier.ADMITTED;
    tx.timestamps.admitted = Date.now();

    this.emit('tier:admitted', tx);

    if (tx.requiredTier <= ConfirmationTier.ADMITTED) {
      this.emit('complete', tx);
    }

    return tx;
  }

  /**
   * Mark transaction as included in a block
   */
  markIncluded(txId: string, blockHash: string, blockHeight: bigint): TrackedTx | undefined {
    const tx = this.tracked.get(txId);
    if (!tx) return undefined;

    tx.tier = ConfirmationTier.INCLUDED;
    tx.timestamps.included = Date.now();
    tx.block = { hash: blockHash, height: blockHeight };
    tx.kDepthTarget = getKDepth(tx.trustScore, this.config);
    tx.currentDepth = 0;

    // Index by block for reorg handling
    let blockTxs = this.byBlock.get(blockHash);
    if (!blockTxs) {
      blockTxs = new Set();
      this.byBlock.set(blockHash, blockTxs);
    }
    blockTxs.add(txId);

    this.emit('tier:included', tx);

    if (tx.requiredTier <= ConfirmationTier.INCLUDED) {
      this.emit('complete', tx);
    }

    return tx;
  }

  /**
   * Update depth for all transactions in a block (called on new block)
   */
  updateDepth(currentHeight: bigint): void {
    for (const tx of this.tracked.values()) {
      if (tx.tier === ConfirmationTier.INCLUDED && tx.block && tx.kDepthTarget !== undefined) {
        const depth = Number(currentHeight - tx.block.height);
        tx.currentDepth = depth;

        if (depth >= tx.kDepthTarget && tx.tier < ConfirmationTier.K_DEPTH) {
          tx.tier = ConfirmationTier.K_DEPTH;
          tx.timestamps.kDepth = Date.now();

          this.emit('tier:kDepth', tx);

          if (tx.requiredTier <= ConfirmationTier.K_DEPTH) {
            this.emit('complete', tx);
          }
        }
      }
    }
  }

  /**
   * Mark transaction as journaled to cross-chain
   */
  markCrossChain(txId: string, journalTxHash: string, chain: string): TrackedTx | undefined {
    const tx = this.tracked.get(txId);
    if (!tx) return undefined;

    tx.tier = ConfirmationTier.CROSS_CHAIN;
    tx.timestamps.crossChain = Date.now();
    tx.journal = {
      txHash: journalTxHash,
      chain,
      timestamp: Date.now(),
    };

    this.emit('tier:crossChain', tx);
    this.emit('complete', tx);

    return tx;
  }

  /**
   * Handle reorg - reset transactions from orphaned blocks
   */
  handleReorg(orphanedBlockHashes: string[]): TrackedTx[] {
    const affected: TrackedTx[] = [];

    for (const blockHash of orphanedBlockHashes) {
      const txIds = this.byBlock.get(blockHash);
      if (!txIds) continue;

      for (const txId of txIds) {
        const tx = this.tracked.get(txId);
        if (!tx) continue;

        const fromTier = tx.tier;

        // Reset to ADMITTED (still in mempool, needs re-inclusion)
        tx.tier = ConfirmationTier.ADMITTED;
        tx.block = undefined;
        tx.kDepthTarget = undefined;
        tx.currentDepth = undefined;
        tx.timestamps.included = undefined;
        tx.timestamps.kDepth = undefined;
        tx.timestamps.crossChain = undefined;
        tx.journal = undefined;

        affected.push(tx);
        this.emit('tier:reorg', tx, fromTier);
      }

      this.byBlock.delete(blockHash);
    }

    return affected;
  }

  /**
   * Get tracked transaction
   */
  get(txId: string): TrackedTx | undefined {
    return this.tracked.get(txId);
  }

  /**
   * Get all transactions at a specific tier
   */
  getByTier(tier: ConfirmationTier): TrackedTx[] {
    return Array.from(this.tracked.values()).filter(tx => tx.tier === tier);
  }

  /**
   * Get transactions by sender
   */
  getBySender(from: string): TrackedTx[] {
    return Array.from(this.tracked.values()).filter(tx => tx.from === from);
  }

  /**
   * Remove completed transaction from tracking (cleanup)
   */
  remove(txId: string): boolean {
    const tx = this.tracked.get(txId);
    if (!tx) return false;

    if (tx.block) {
      const blockTxs = this.byBlock.get(tx.block.hash);
      if (blockTxs) {
        blockTxs.delete(txId);
        if (blockTxs.size === 0) {
          this.byBlock.delete(tx.block.hash);
        }
      }
    }

    return this.tracked.delete(txId);
  }

  /**
   * Get stats
   */
  getStats(): {
    total: number;
    byTier: Record<ConfirmationTier, number>;
  } {
    const byTier: Record<ConfirmationTier, number> = {
      [ConfirmationTier.PREFLIGHT]: 0,
      [ConfirmationTier.ADMITTED]: 0,
      [ConfirmationTier.INCLUDED]: 0,
      [ConfirmationTier.K_DEPTH]: 0,
      [ConfirmationTier.CROSS_CHAIN]: 0,
    };

    for (const tx of this.tracked.values()) {
      byTier[tx.tier]++;
    }

    return {
      total: this.tracked.size,
      byTier,
    };
  }

  /**
   * Cleanup old completed transactions
   */
  cleanup(maxAgeMs: number = 300000): number {
    const now = Date.now();
    let removed = 0;

    for (const [txId, tx] of this.tracked.entries()) {
      const lastTimestamp = tx.timestamps.crossChain ||
        tx.timestamps.kDepth ||
        tx.timestamps.included ||
        tx.timestamps.admitted ||
        tx.timestamps.preflight ||
        0;

      if (now - lastTimestamp > maxAgeMs && tx.tier >= tx.requiredTier) {
        this.remove(txId);
        removed++;
      }
    }

    return removed;
  }
}
