/**
 * Transaction and State Indexer
 */
import { EventEmitter } from 'events';
import {
  IndexedTx,
  IndexedStateChange,
  TxSearchQuery,
  StateSearchQuery,
  SearchResult,
  IndexerConfig,
  DEFAULT_INDEXER_CONFIG,
  IndexerStats,
} from './types';

/**
 * Block to index
 */
export interface BlockToIndex {
  hash: string;
  height: bigint;
  timestamp: number;
  transactions: Array<{
    txId: string;
    from: string;
    nonce: bigint;
    statesTouched: string[];
    success: boolean;
    gasUsed?: bigint;
    rawTx?: string;
  }>;
  stateChanges: Array<{
    stateId: string;
    txId: string;
    prevValue: string | null;
    newValue: string | null;
    prevVersion: string | null;
    newVersion: string;
  }>;
}

/**
 * Indexer Service
 */
export class Indexer extends EventEmitter {
  private config: IndexerConfig;

  // Transaction indexes
  private txsByHash = new Map<string, IndexedTx>();
  private txsBySender = new Map<string, Set<string>>();
  private txsByState = new Map<string, Set<string>>();
  private txsByHeight = new Map<bigint, Set<string>>();

  // State change indexes
  private stateChanges: IndexedStateChange[] = [];
  private stateChangesByState = new Map<string, IndexedStateChange[]>();
  private stateChangesByTx = new Map<string, IndexedStateChange[]>();

  // Stats
  private heightFrom: bigint = 0n;
  private heightTo: bigint = 0n;

  constructor(config: Partial<IndexerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_INDEXER_CONFIG, ...config };
  }

  /**
   * Index a block
   */
  indexBlock(block: BlockToIndex): void {
    if (!this.config.enabled) return;

    // Update height range
    if (this.txsByHash.size === 0 || block.height < this.heightFrom) {
      this.heightFrom = block.height;
    }
    if (block.height > this.heightTo) {
      this.heightTo = block.height;
    }

    // Index transactions
    let txIndex = 0;
    for (const tx of block.transactions) {
      const indexedTx: IndexedTx = {
        txId: tx.txId,
        blockHash: block.hash,
        blockHeight: block.height,
        txIndex: txIndex++,
        from: tx.from,
        nonce: tx.nonce,
        timestamp: block.timestamp,
        statesTouched: tx.statesTouched,
        success: tx.success,
        gasUsed: tx.gasUsed,
        rawTx: this.config.indexRawTx ? tx.rawTx : undefined,
      };

      this.addTx(indexedTx);
    }

    // Index state changes
    for (const change of block.stateChanges) {
      const indexedChange: IndexedStateChange = {
        stateId: change.stateId,
        blockHash: block.hash,
        blockHeight: block.height,
        txId: change.txId,
        prevValue: change.prevValue,
        newValue: change.newValue,
        prevVersion: change.prevVersion,
        newVersion: change.newVersion,
        timestamp: block.timestamp,
      };

      this.addStateChange(indexedChange);
    }

    this.emit('block:indexed', { hash: block.hash, height: block.height, txCount: block.transactions.length });
  }

  /**
   * Add a transaction to indexes
   */
  private addTx(tx: IndexedTx): void {
    // Enforce limit
    while (this.txsByHash.size >= this.config.maxIndexedTxs) {
      this.evictOldestTx();
    }

    this.txsByHash.set(tx.txId, tx);

    // By sender
    const senderSet = this.txsBySender.get(tx.from) || new Set();
    senderSet.add(tx.txId);
    this.txsBySender.set(tx.from, senderSet);

    // By state
    for (const state of tx.statesTouched) {
      const stateSet = this.txsByState.get(state) || new Set();
      stateSet.add(tx.txId);
      this.txsByState.set(state, stateSet);
    }

    // By height
    const heightSet = this.txsByHeight.get(tx.blockHeight) || new Set();
    heightSet.add(tx.txId);
    this.txsByHeight.set(tx.blockHeight, heightSet);
  }

  /**
   * Add a state change to indexes
   */
  private addStateChange(change: IndexedStateChange): void {
    // Enforce limit
    while (this.stateChanges.length >= this.config.maxStateChanges) {
      this.evictOldestStateChange();
    }

    this.stateChanges.push(change);

    // By state
    const stateList = this.stateChangesByState.get(change.stateId) || [];
    stateList.push(change);
    this.stateChangesByState.set(change.stateId, stateList);

    // By tx
    const txList = this.stateChangesByTx.get(change.txId) || [];
    txList.push(change);
    this.stateChangesByTx.set(change.txId, txList);
  }

  /**
   * Evict oldest transaction
   */
  private evictOldestTx(): void {
    // Find the oldest by height
    if (this.heightFrom === 0n) return;

    const heightSet = this.txsByHeight.get(this.heightFrom);
    if (heightSet && heightSet.size > 0) {
      const txId = heightSet.values().next().value;
      if (txId) {
        this.removeTx(txId);
      }
    }

    // Update heightFrom
    while (this.heightFrom <= this.heightTo && (!this.txsByHeight.has(this.heightFrom) || this.txsByHeight.get(this.heightFrom)!.size === 0)) {
      this.txsByHeight.delete(this.heightFrom);
      this.heightFrom++;
    }
  }

  /**
   * Remove a transaction from indexes
   */
  private removeTx(txId: string): void {
    const tx = this.txsByHash.get(txId);
    if (!tx) return;

    this.txsByHash.delete(txId);

    // From sender index
    const senderSet = this.txsBySender.get(tx.from);
    if (senderSet) {
      senderSet.delete(txId);
      if (senderSet.size === 0) {
        this.txsBySender.delete(tx.from);
      }
    }

    // From state index
    for (const state of tx.statesTouched) {
      const stateSet = this.txsByState.get(state);
      if (stateSet) {
        stateSet.delete(txId);
        if (stateSet.size === 0) {
          this.txsByState.delete(state);
        }
      }
    }

    // From height index
    const heightSet = this.txsByHeight.get(tx.blockHeight);
    if (heightSet) {
      heightSet.delete(txId);
    }
  }

  /**
   * Evict oldest state change
   */
  private evictOldestStateChange(): void {
    if (this.stateChanges.length === 0) return;

    const oldest = this.stateChanges.shift()!;

    // Remove from state index
    const stateList = this.stateChangesByState.get(oldest.stateId);
    if (stateList && stateList.length > 0 && stateList[0] === oldest) {
      stateList.shift();
      if (stateList.length === 0) {
        this.stateChangesByState.delete(oldest.stateId);
      }
    }

    // Remove from tx index
    const txList = this.stateChangesByTx.get(oldest.txId);
    if (txList && txList.length > 0) {
      const idx = txList.indexOf(oldest);
      if (idx >= 0) {
        txList.splice(idx, 1);
        if (txList.length === 0) {
          this.stateChangesByTx.delete(oldest.txId);
        }
      }
    }
  }

  /**
   * Get transaction by ID
   */
  getTx(txId: string): IndexedTx | null {
    return this.txsByHash.get(txId) || null;
  }

  /**
   * Search transactions
   */
  searchTxs(query: TxSearchQuery): SearchResult<IndexedTx> {
    let results: IndexedTx[] = [];

    // Start with the most selective index
    if (query.from) {
      const txIds = this.txsBySender.get(query.from);
      if (txIds) {
        results = Array.from(txIds).map(id => this.txsByHash.get(id)!).filter(Boolean);
      }
    } else if (query.stateTouched) {
      const txIds = this.txsByState.get(query.stateTouched);
      if (txIds) {
        results = Array.from(txIds).map(id => this.txsByHash.get(id)!).filter(Boolean);
      }
    } else {
      // Full scan
      results = Array.from(this.txsByHash.values());
    }

    // Apply filters
    results = results.filter(tx => {
      if (query.from && tx.from !== query.from) return false;
      if (query.stateTouched && !tx.statesTouched.includes(query.stateTouched)) return false;
      if (query.heightFrom !== undefined && tx.blockHeight < query.heightFrom) return false;
      if (query.heightTo !== undefined && tx.blockHeight > query.heightTo) return false;
      if (query.timestampFrom !== undefined && tx.timestamp < query.timestampFrom) return false;
      if (query.timestampTo !== undefined && tx.timestamp > query.timestampTo) return false;
      if (query.success !== undefined && tx.success !== query.success) return false;
      return true;
    });

    // Sort
    const sortBy = query.sortBy || 'height';
    const sortOrder = query.sortOrder || 'desc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;

    results.sort((a, b) => {
      if (sortBy === 'height') {
        return Number(a.blockHeight - b.blockHeight) * sortMultiplier;
      } else {
        return (a.timestamp - b.timestamp) * sortMultiplier;
      }
    });

    // Paginate
    const total = results.length;
    const offset = query.offset || 0;
    const limit = query.limit || 100;

    results = results.slice(offset, offset + limit);

    return {
      items: results,
      total,
      offset,
      limit,
      hasMore: offset + results.length < total,
    };
  }

  /**
   * Get transactions by sender
   */
  getTxsBySender(from: string, limit: number = 100): IndexedTx[] {
    const txIds = this.txsBySender.get(from);
    if (!txIds) return [];

    return Array.from(txIds)
      .slice(0, limit)
      .map(id => this.txsByHash.get(id)!)
      .filter(Boolean)
      .sort((a, b) => Number(b.blockHeight - a.blockHeight));
  }

  /**
   * Get transactions touching a state
   */
  getTxsByState(stateId: string, limit: number = 100): IndexedTx[] {
    const txIds = this.txsByState.get(stateId);
    if (!txIds) return [];

    return Array.from(txIds)
      .slice(0, limit)
      .map(id => this.txsByHash.get(id)!)
      .filter(Boolean)
      .sort((a, b) => Number(b.blockHeight - a.blockHeight));
  }

  /**
   * Search state changes
   */
  searchStateChanges(query: StateSearchQuery): SearchResult<IndexedStateChange> {
    let results: IndexedStateChange[];

    if (query.stateId) {
      results = this.stateChangesByState.get(query.stateId) || [];
    } else if (query.txId) {
      results = this.stateChangesByTx.get(query.txId) || [];
    } else {
      results = [...this.stateChanges];
    }

    // Apply filters
    results = results.filter(change => {
      if (query.heightFrom !== undefined && change.blockHeight < query.heightFrom) return false;
      if (query.heightTo !== undefined && change.blockHeight > query.heightTo) return false;
      return true;
    });

    // Sort
    const sortOrder = query.sortOrder || 'desc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;
    results.sort((a, b) => Number(a.blockHeight - b.blockHeight) * sortMultiplier);

    // Paginate
    const total = results.length;
    const offset = query.offset || 0;
    const limit = query.limit || 100;

    results = results.slice(offset, offset + limit);

    return {
      items: results,
      total,
      offset,
      limit,
      hasMore: offset + results.length < total,
    };
  }

  /**
   * Get state history
   */
  getStateHistory(stateId: string, limit: number = 100): IndexedStateChange[] {
    const changes = this.stateChangesByState.get(stateId) || [];
    return [...changes]
      .sort((a, b) => Number(b.blockHeight - a.blockHeight))
      .slice(0, limit);
  }

  /**
   * Get state changes for a transaction
   */
  getStateChangesForTx(txId: string): IndexedStateChange[] {
    return this.stateChangesByTx.get(txId) || [];
  }

  /**
   * Get indexer statistics
   */
  getStats(): IndexerStats {
    let memoryBytes = 0;

    // Estimate memory for transactions
    for (const tx of this.txsByHash.values()) {
      memoryBytes += tx.txId.length * 2 + tx.blockHash.length * 2 + tx.from.length * 2 + 128;
      for (const state of tx.statesTouched) {
        memoryBytes += state.length * 2;
      }
      if (tx.rawTx) {
        memoryBytes += tx.rawTx.length * 2;
      }
    }

    // Estimate memory for state changes
    for (const change of this.stateChanges) {
      memoryBytes += change.stateId.length * 2 + change.blockHash.length * 2 + change.txId.length * 2 + 128;
      if (change.prevValue) memoryBytes += change.prevValue.length * 2;
      if (change.newValue) memoryBytes += change.newValue.length * 2;
    }

    return {
      totalTxs: this.txsByHash.size,
      totalStateChanges: this.stateChanges.length,
      heightFrom: this.heightFrom,
      heightTo: this.heightTo,
      uniqueSenders: this.txsBySender.size,
      uniqueStates: this.txsByState.size,
      memoryBytes,
    };
  }

  /**
   * Clear all indexes
   */
  clear(): void {
    this.txsByHash.clear();
    this.txsBySender.clear();
    this.txsByState.clear();
    this.txsByHeight.clear();
    this.stateChanges = [];
    this.stateChangesByState.clear();
    this.stateChangesByTx.clear();
    this.heightFrom = 0n;
    this.heightTo = 0n;
  }

  /**
   * Handle reorg - remove indexed data above fork point
   */
  handleReorg(forkHeight: bigint): number {
    let removed = 0;

    // Remove transactions above fork height
    for (const [txId, tx] of this.txsByHash) {
      if (tx.blockHeight > forkHeight) {
        this.removeTx(txId);
        removed++;
      }
    }

    // Remove state changes above fork height
    this.stateChanges = this.stateChanges.filter(change => change.blockHeight <= forkHeight);

    // Rebuild state change indexes
    this.stateChangesByState.clear();
    this.stateChangesByTx.clear();
    for (const change of this.stateChanges) {
      const stateList = this.stateChangesByState.get(change.stateId) || [];
      stateList.push(change);
      this.stateChangesByState.set(change.stateId, stateList);

      const txList = this.stateChangesByTx.get(change.txId) || [];
      txList.push(change);
      this.stateChangesByTx.set(change.txId, txList);
    }

    // Update height range
    this.heightTo = forkHeight;

    this.emit('reorg:handled', { forkHeight, removed });

    return removed;
  }
}
