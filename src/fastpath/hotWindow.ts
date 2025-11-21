/**
 * Hot Window
 *
 * Ring buffer implementation for tracking recent transactions.
 * Provides efficient lookup by txId, sender, and state.
 */

/**
 * Entry in the hot window
 */
export interface HotWindowEntry {
  txId: string;
  from: string;
  nonce: bigint;
  stateIds: string[];
  receivedAt: number;
}

/**
 * Hot window stats
 */
export interface HotWindowStats {
  count: number;
  capacity: number;
  oldestTimestamp?: number;
  newestTimestamp?: number;
}

/**
 * Hot Window - Ring buffer for recent transactions
 */
export class HotWindow {
  private buffer: (HotWindowEntry | undefined)[];
  private head = 0;
  private count = 0;

  // Secondary indexes
  private byTxId = new Map<string, number>();
  private bySender = new Map<string, Set<string>>();
  private byState = new Map<string, Set<string>>();

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  /**
   * Add entry to the hot window
   */
  add(entry: HotWindowEntry): void {
    // Check if we need to evict
    if (this.count >= this.capacity) {
      this.evictOldest();
    }

    // Add to buffer
    const index = (this.head + this.count) % this.capacity;
    this.buffer[index] = entry;
    this.count++;

    // Update indexes
    this.byTxId.set(entry.txId, index);

    // Sender index
    if (!this.bySender.has(entry.from)) {
      this.bySender.set(entry.from, new Set());
    }
    this.bySender.get(entry.from)!.add(entry.txId);

    // State index
    for (const stateId of entry.stateIds) {
      if (!this.byState.has(stateId)) {
        this.byState.set(stateId, new Set());
      }
      this.byState.get(stateId)!.add(entry.txId);
    }
  }

  /**
   * Get entry by txId
   */
  getByTxId(txId: string): HotWindowEntry | undefined {
    const index = this.byTxId.get(txId);
    if (index === undefined) return undefined;
    return this.buffer[index];
  }

  /**
   * Get entries by sender
   */
  getBySender(sender: string): HotWindowEntry[] {
    const txIds = this.bySender.get(sender);
    if (!txIds) return [];

    const entries: HotWindowEntry[] = [];
    for (const txId of txIds) {
      const entry = this.getByTxId(txId);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  /**
   * Get entries by state
   */
  getByState(stateId: string): HotWindowEntry[] {
    const txIds = this.byState.get(stateId);
    if (!txIds) return [];

    const entries: HotWindowEntry[] = [];
    for (const txId of txIds) {
      const entry = this.getByTxId(txId);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  /**
   * Get stats
   */
  getStats(): HotWindowStats {
    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;

    if (this.count > 0) {
      const oldest = this.buffer[this.head];
      const newestIndex = (this.head + this.count - 1) % this.capacity;
      const newest = this.buffer[newestIndex];

      oldestTimestamp = oldest?.receivedAt;
      newestTimestamp = newest?.receivedAt;
    }

    return {
      count: this.count,
      capacity: this.capacity,
      oldestTimestamp,
      newestTimestamp,
    };
  }

  /**
   * Evict the oldest entry
   */
  private evictOldest(): void {
    const entry = this.buffer[this.head];
    if (!entry) return;

    // Remove from indexes
    this.byTxId.delete(entry.txId);

    const senderSet = this.bySender.get(entry.from);
    if (senderSet) {
      senderSet.delete(entry.txId);
      if (senderSet.size === 0) {
        this.bySender.delete(entry.from);
      }
    }

    for (const stateId of entry.stateIds) {
      const stateSet = this.byState.get(stateId);
      if (stateSet) {
        stateSet.delete(entry.txId);
        if (stateSet.size === 0) {
          this.byState.delete(stateId);
        }
      }
    }

    // Clear slot and advance head
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
  }
}
