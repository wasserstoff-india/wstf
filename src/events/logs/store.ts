/**
 * Event Log Store - Indexed storage for event logs
 *
 * Indexes:
 * - byTx: txId -> EventLog[]
 * - byKey: eventKey:blockHeight:txIndex:logIndex -> EventLog
 * - byAddr: emitter:blockHeight:idx -> EventLog
 * - byTopic0: topic0:blockHeight:idx -> EventLog (optional)
 */

import {
  EventLog,
  EventFilter,
  Hex32,
  EventKey,
  Topic,
  MAX_EVENTS_PER_TX,
  matchesFilter,
} from './types';

// ============================================
// Store Interface
// ============================================

/**
 * Event log store interface
 */
export interface EventLogStore {
  /** Add event logs for a transaction */
  addEvents(events: EventLog[]): void;

  /** Get all events for a transaction */
  getByTx(txId: Hex32): EventLog[];

  /** Get a specific event by tx and index */
  getByTxAndIndex(txId: Hex32, index: number): EventLog | undefined;

  /** Query events with filter */
  query(filter: EventFilter): EventLog[];

  /** Get events by emitter address */
  getByAddress(address: string, limit?: number): EventLog[];

  /** Get events by event key */
  getByKey(key: EventKey, limit?: number): EventLog[];

  /** Get events by topic */
  getByTopic(topicIndex: number, topic: Topic, limit?: number): EventLog[];

  /** Get total event count */
  getCount(): number;

  /** Get events in block */
  getByBlock(blockHeight: bigint): EventLog[];

  /** Remove events for block (for reorg) */
  removeByBlock(blockHeight: bigint): number;

  /** Clear all events */
  clear(): void;
}

// ============================================
// In-Memory Implementation
// ============================================

/**
 * In-memory event log store
 */
export class InMemoryEventLogStore implements EventLogStore {
  /** Primary storage: txId -> logs */
  private byTx = new Map<string, EventLog[]>();

  /** Index: eventKey -> logs */
  private byKey = new Map<string, EventLog[]>();

  /** Index: emitter -> logs */
  private byAddr = new Map<string, EventLog[]>();

  /** Index: blockHeight -> logs */
  private byBlock = new Map<string, EventLog[]>();

  /** Index: topic0 -> logs (most commonly queried) */
  private byTopic0 = new Map<string, EventLog[]>();

  /** Total count */
  private count = 0;

  /**
   * Add event logs for a transaction
   */
  addEvents(events: EventLog[]): void {
    if (events.length === 0) return;

    // Validate event count
    if (events.length > MAX_EVENTS_PER_TX) {
      throw new Error(`Too many events: ${events.length} > ${MAX_EVENTS_PER_TX}`);
    }

    const txId = events[0].txId;

    // Add to primary storage
    const existing = this.byTx.get(txId) || [];
    this.byTx.set(txId, [...existing, ...events]);

    // Index each event
    for (const event of events) {
      this.count++;

      // Index by key
      const keyLogs = this.byKey.get(event.key) || [];
      keyLogs.push(event);
      this.byKey.set(event.key, keyLogs);

      // Index by address
      const addrLogs = this.byAddr.get(event.emitter) || [];
      addrLogs.push(event);
      this.byAddr.set(event.emitter, addrLogs);

      // Index by block
      const blockKey = event.blockHeight.toString();
      const blockLogs = this.byBlock.get(blockKey) || [];
      blockLogs.push(event);
      this.byBlock.set(blockKey, blockLogs);

      // Index by topic0
      if (event.topics.length > 0) {
        const topic0Logs = this.byTopic0.get(event.topics[0]) || [];
        topic0Logs.push(event);
        this.byTopic0.set(event.topics[0], topic0Logs);
      }
    }
  }

  /**
   * Get all events for a transaction
   */
  getByTx(txId: Hex32): EventLog[] {
    return this.byTx.get(txId) || [];
  }

  /**
   * Get a specific event by tx and index
   */
  getByTxAndIndex(txId: Hex32, index: number): EventLog | undefined {
    const logs = this.byTx.get(txId) || [];
    return logs.find(l => l.index === index);
  }

  /**
   * Query events with filter
   */
  query(filter: EventFilter): EventLog[] {
    const limit = filter.limit || 1000;
    let candidates: EventLog[];

    // Choose best index based on filter
    if (filter.eventKey) {
      candidates = this.byKey.get(filter.eventKey) || [];
    } else if (filter.address) {
      candidates = this.byAddr.get(filter.address) || [];
    } else if (filter.topics && filter.topics[0]) {
      candidates = this.byTopic0.get(filter.topics[0]) || [];
    } else if (filter.fromBlock !== undefined && filter.toBlock !== undefined) {
      // Scan block range
      candidates = [];
      for (let h = filter.fromBlock; h <= filter.toBlock; h++) {
        const blockLogs = this.byBlock.get(h.toString()) || [];
        candidates.push(...blockLogs);
      }
    } else {
      // Full scan (expensive)
      candidates = [];
      for (const logs of this.byTx.values()) {
        candidates.push(...logs);
      }
    }

    // Apply filter and limit
    const results: EventLog[] = [];
    for (const log of candidates) {
      if (matchesFilter(log, filter)) {
        results.push(log);
        if (results.length >= limit) break;
      }
    }

    // Sort by block height, tx index, log index
    results.sort((a, b) => {
      if (a.blockHeight !== b.blockHeight) {
        return a.blockHeight < b.blockHeight ? -1 : 1;
      }
      return a.index - b.index;
    });

    return results;
  }

  /**
   * Get events by emitter address
   */
  getByAddress(address: string, limit = 100): EventLog[] {
    const logs = this.byAddr.get(address) || [];
    return logs.slice(-limit);
  }

  /**
   * Get events by event key
   */
  getByKey(key: EventKey, limit = 100): EventLog[] {
    const logs = this.byKey.get(key) || [];
    return logs.slice(-limit);
  }

  /**
   * Get events by topic
   */
  getByTopic(topicIndex: number, topic: Topic, limit = 100): EventLog[] {
    if (topicIndex === 0) {
      const logs = this.byTopic0.get(topic) || [];
      return logs.slice(-limit);
    }

    // For other topic indices, full scan
    const results: EventLog[] = [];
    for (const logs of this.byTx.values()) {
      for (const log of logs) {
        if (log.topics[topicIndex] === topic) {
          results.push(log);
          if (results.length >= limit) return results;
        }
      }
    }
    return results;
  }

  /**
   * Get total event count
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Get events in block
   */
  getByBlock(blockHeight: bigint): EventLog[] {
    return this.byBlock.get(blockHeight.toString()) || [];
  }

  /**
   * Remove events for block (for reorg)
   */
  removeByBlock(blockHeight: bigint): number {
    const blockKey = blockHeight.toString();
    const blockLogs = this.byBlock.get(blockKey) || [];

    if (blockLogs.length === 0) return 0;

    // Remove from all indexes
    for (const log of blockLogs) {
      // Remove from byTx
      const txLogs = this.byTx.get(log.txId);
      if (txLogs) {
        const filtered = txLogs.filter(l => l.blockHeight !== blockHeight);
        if (filtered.length > 0) {
          this.byTx.set(log.txId, filtered);
        } else {
          this.byTx.delete(log.txId);
        }
      }

      // Remove from byKey
      const keyLogs = this.byKey.get(log.key);
      if (keyLogs) {
        const filtered = keyLogs.filter(l => l.blockHeight !== blockHeight);
        if (filtered.length > 0) {
          this.byKey.set(log.key, filtered);
        } else {
          this.byKey.delete(log.key);
        }
      }

      // Remove from byAddr
      const addrLogs = this.byAddr.get(log.emitter);
      if (addrLogs) {
        const filtered = addrLogs.filter(l => l.blockHeight !== blockHeight);
        if (filtered.length > 0) {
          this.byAddr.set(log.emitter, filtered);
        } else {
          this.byAddr.delete(log.emitter);
        }
      }

      // Remove from byTopic0
      if (log.topics.length > 0) {
        const topic0Logs = this.byTopic0.get(log.topics[0]);
        if (topic0Logs) {
          const filtered = topic0Logs.filter(l => l.blockHeight !== blockHeight);
          if (filtered.length > 0) {
            this.byTopic0.set(log.topics[0], filtered);
          } else {
            this.byTopic0.delete(log.topics[0]);
          }
        }
      }

      this.count--;
    }

    // Remove block entry
    this.byBlock.delete(blockKey);

    return blockLogs.length;
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.byTx.clear();
    this.byKey.clear();
    this.byAddr.clear();
    this.byBlock.clear();
    this.byTopic0.clear();
    this.count = 0;
  }

  // ============================================
  // Stats & Debugging
  // ============================================

  /**
   * Get store statistics
   */
  getStats(): {
    totalEvents: number;
    uniqueTxs: number;
    uniqueKeys: number;
    uniqueAddresses: number;
    uniqueBlocks: number;
  } {
    return {
      totalEvents: this.count,
      uniqueTxs: this.byTx.size,
      uniqueKeys: this.byKey.size,
      uniqueAddresses: this.byAddr.size,
      uniqueBlocks: this.byBlock.size,
    };
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create event log store
 */
export function createEventLogStore(): EventLogStore {
  return new InMemoryEventLogStore();
}
