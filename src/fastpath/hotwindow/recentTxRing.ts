/**
 * Recent Transaction Ring Buffer
 *
 * A fixed-size ring buffer for storing recent committed transactions
 * with multiple indexes for fast lookups.
 */
import {
  TxMeta,
  HotWindowConfig,
  DEFAULT_HOT_WINDOW_CONFIG,
  HotWindowQuery,
  HotWindowStats,
} from './types';

/**
 * Bounded queue for index entries
 */
class BoundedQueue<T> {
  private items: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.maxSize) {
      this.items.shift();
    }
  }

  getAll(): T[] {
    return [...this.items];
  }

  remove(predicate: (item: T) => boolean): void {
    this.items = this.items.filter(item => !predicate(item));
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

/**
 * Recent Transaction Ring Buffer
 */
export class RecentTxRing {
  private entries: (TxMeta | null)[];
  private head: number = 0;
  private count: number = 0;
  private config: HotWindowConfig;

  // Indexes
  private byTxId = new Map<string, number>(); // txId -> ring index
  private bySender = new Map<string, BoundedQueue<number>>(); // sender -> ring indices
  private byStateId = new Map<string, BoundedQueue<number>>(); // stateId -> ring indices
  private byIid = new Map<string, BoundedQueue<number>>(); // iid -> ring indices

  constructor(config: Partial<HotWindowConfig> = {}) {
    this.config = { ...DEFAULT_HOT_WINDOW_CONFIG, ...config };
    this.entries = new Array(this.config.size).fill(null);
  }

  /**
   * Add a transaction to the ring
   */
  push(meta: TxMeta): void {
    // Calculate insertion index
    const index = (this.head + this.count) % this.config.size;

    // If overwriting, remove old entry from indexes
    const old = this.entries[index];
    if (old) {
      this.removeFromIndexes(old, index);
    }

    // Insert new entry
    this.entries[index] = meta;

    // Update indexes
    this.byTxId.set(meta.txId, index);

    // Sender index
    let senderQueue = this.bySender.get(meta.from);
    if (!senderQueue) {
      senderQueue = new BoundedQueue(this.config.perSenderDepth);
      this.bySender.set(meta.from, senderQueue);
    }
    senderQueue.push(index);

    // State index
    for (const stateId of meta.touchedStates) {
      let stateQueue = this.byStateId.get(stateId);
      if (!stateQueue) {
        stateQueue = new BoundedQueue(this.config.perStateDepth);
        this.byStateId.set(stateId, stateQueue);
      }
      stateQueue.push(index);
    }

    // IID index
    for (const iid of meta.iidList) {
      let iidQueue = this.byIid.get(iid);
      if (!iidQueue) {
        iidQueue = new BoundedQueue(this.config.perIidDepth);
        this.byIid.set(iid, iidQueue);
      }
      iidQueue.push(index);
    }

    // Update count
    if (this.count < this.config.size) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.config.size;
    }
  }

  /**
   * Remove entry from all indexes
   */
  private removeFromIndexes(meta: TxMeta, index: number): void {
    this.byTxId.delete(meta.txId);

    const senderQueue = this.bySender.get(meta.from);
    if (senderQueue) {
      senderQueue.remove(i => i === index);
      if (senderQueue.size() === 0) {
        this.bySender.delete(meta.from);
      }
    }

    for (const stateId of meta.touchedStates) {
      const stateQueue = this.byStateId.get(stateId);
      if (stateQueue) {
        stateQueue.remove(i => i === index);
        if (stateQueue.size() === 0) {
          this.byStateId.delete(stateId);
        }
      }
    }

    for (const iid of meta.iidList) {
      const iidQueue = this.byIid.get(iid);
      if (iidQueue) {
        iidQueue.remove(i => i === index);
        if (iidQueue.size() === 0) {
          this.byIid.delete(iid);
        }
      }
    }
  }

  /**
   * Get transaction by ID
   */
  getByTxId(txId: string): TxMeta | undefined {
    const index = this.byTxId.get(txId);
    if (index === undefined) return undefined;
    return this.entries[index] || undefined;
  }

  /**
   * Check if transaction exists
   */
  has(txId: string): boolean {
    return this.byTxId.has(txId);
  }

  /**
   * Get transactions by sender
   */
  getBySender(addr: string, query: HotWindowQuery = {}): TxMeta[] {
    const queue = this.bySender.get(addr);
    if (!queue) return [];

    const indices = queue.getAll();
    let results: TxMeta[] = [];

    for (const index of indices) {
      const meta = this.entries[index];
      if (!meta) continue;

      // Filter by nonce
      if (query.fromNonce !== undefined && meta.nonce < query.fromNonce) {
        continue;
      }

      // Filter by height
      if (query.sinceHeight !== undefined && meta.height < query.sinceHeight) {
        continue;
      }

      results.push(meta);
    }

    // Sort by nonce ascending
    results.sort((a, b) => Number(a.nonce - b.nonce));

    // Apply limit
    if (query.limit && results.length > query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get transactions touching specific states
   */
  getByStates(stateIds: string[], query: HotWindowQuery = {}): TxMeta[] {
    const seen = new Set<string>();
    const results: TxMeta[] = [];

    for (const stateId of stateIds) {
      const queue = this.byStateId.get(stateId);
      if (!queue) continue;

      for (const index of queue.getAll()) {
        const meta = this.entries[index];
        if (!meta || seen.has(meta.txId)) continue;

        // Filter by height
        if (query.sinceHeight !== undefined && meta.height < query.sinceHeight) {
          continue;
        }

        seen.add(meta.txId);
        results.push(meta);

        // Check limit
        if (query.limit && results.length >= query.limit) {
          return results;
        }
      }
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    return results;
  }

  /**
   * Get transactions using specific instruction IDs
   */
  getByIids(iids: string[], query: HotWindowQuery = {}): TxMeta[] {
    const seen = new Set<string>();
    const results: TxMeta[] = [];

    for (const iid of iids) {
      const queue = this.byIid.get(iid);
      if (!queue) continue;

      for (const index of queue.getAll()) {
        const meta = this.entries[index];
        if (!meta || seen.has(meta.txId)) continue;

        // Filter by height
        if (query.sinceHeight !== undefined && meta.height < query.sinceHeight) {
          continue;
        }

        seen.add(meta.txId);
        results.push(meta);

        // Check limit
        if (query.limit && results.length >= query.limit) {
          return results;
        }
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    return results;
  }

  /**
   * Get recent transactions
   */
  getRecent(query: HotWindowQuery = {}): TxMeta[] {
    const results: TxMeta[] = [];
    const limit = query.limit || 100;

    // Iterate from newest to oldest
    for (let i = 0; i < this.count && results.length < limit; i++) {
      const index = (this.head + this.count - 1 - i + this.config.size) % this.config.size;
      const meta = this.entries[index];
      if (!meta) continue;

      // Filter by height
      if (query.sinceHeight !== undefined && meta.height < query.sinceHeight) {
        continue;
      }

      results.push(meta);
    }

    return results;
  }

  /**
   * Rebuild from blocks (used on startup)
   */
  rebuildFromBlocks(blocks: Iterable<{ hash: string; height: bigint; timestamp: number; txs: TxMeta[] }>): void {
    this.clear();

    const allTxs: TxMeta[] = [];

    for (const block of blocks) {
      for (const tx of block.txs) {
        allTxs.push({
          ...tx,
          blockHash: block.hash,
          height: block.height,
          timestamp: block.timestamp,
        });
      }
    }

    // Sort by height ascending, then by position in block
    allTxs.sort((a, b) => Number(a.height - b.height));

    // Push all (ring will handle overflow)
    for (const tx of allTxs) {
      this.push(tx);
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.fill(null);
    this.head = 0;
    this.count = 0;
    this.byTxId.clear();
    this.bySender.clear();
    this.byStateId.clear();
    this.byIid.clear();
  }

  /**
   * Get statistics
   */
  getStats(): HotWindowStats {
    let oldestTs = Infinity;
    let newestTs = 0;

    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.config.size;
      const meta = this.entries[index];
      if (meta) {
        if (meta.timestamp < oldestTs) oldestTs = meta.timestamp;
        if (meta.timestamp > newestTs) newestTs = meta.timestamp;
      }
    }

    // Estimate memory: ~200 bytes per entry + index overhead
    const entrySize = 200;
    const indexOverhead = (this.byTxId.size * 50) +
      (this.bySender.size * 100) +
      (this.byStateId.size * 100) +
      (this.byIid.size * 100);

    return {
      size: this.count,
      memoryBytes: (this.count * entrySize) + indexOverhead,
      senderCount: this.bySender.size,
      stateCount: this.byStateId.size,
      iidCount: this.byIid.size,
      oldestTimestamp: oldestTs === Infinity ? 0 : oldestTs,
      newestTimestamp: newestTs,
    };
  }

  /**
   * Get current size
   */
  size(): number {
    return this.count;
  }
}
