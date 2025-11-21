/**
 * Pending Index - Conflict detection for mempool transactions
 *
 * Tracks:
 * - Next expected nonce per sender
 * - In-flight transactions per sender
 * - State touches with expected versions
 * - Lock conflicts
 */
import {
  PendingTxRef,
  PendingCheckRequest,
  PendingCheckResponse,
  Conflict,
  PendingIndexConfig,
  DEFAULT_PENDING_INDEX_CONFIG,
  PendingIndexStats,
} from './types';

/**
 * State pending entry
 */
interface StatePending {
  txId: string;
  from: string;
  nonce: bigint;
  expectedVersion: string;
  lockWrites: boolean;
}

/**
 * Pending Index implementation
 */
export class PendingIndex {
  private config: PendingIndexConfig;

  // Sender tracking
  private senderNextNonce = new Map<string, bigint>();
  private senderInFlight = new Map<string, Map<bigint, PendingTxRef>>();

  // State tracking
  private byState = new Map<string, StatePending[]>();

  // All pending txs by ID
  private byTxId = new Map<string, PendingTxRef>();

  constructor(config: Partial<PendingIndexConfig> = {}) {
    this.config = { ...DEFAULT_PENDING_INDEX_CONFIG, ...config };
  }

  /**
   * Set the base nonce for a sender (from account state)
   */
  setBaseNonce(from: string, nonce: bigint): void {
    const inFlight = this.senderInFlight.get(from);
    const inFlightCount = inFlight ? inFlight.size : 0;
    this.senderNextNonce.set(from, nonce + BigInt(inFlightCount));
  }

  /**
   * Get the next expected nonce for a sender
   */
  getNextNonce(from: string): bigint {
    return this.senderNextNonce.get(from) || 0n;
  }

  /**
   * Check for conflicts before signing/broadcasting
   */
  check(req: PendingCheckRequest): PendingCheckResponse {
    const conflicts: Conflict[] = [];

    // Check nonce
    const expectedNonce = this.getNextNonce(req.from);
    if (this.config.strictNonce && req.nonce !== expectedNonce) {
      conflicts.push({
        type: 'nonce',
        from: req.from,
        expectedNonce,
        gotNonce: req.nonce,
      });
    } else if (req.nonce < expectedNonce) {
      // Nonce already used
      conflicts.push({
        type: 'nonce',
        from: req.from,
        expectedNonce,
        gotNonce: req.nonce,
      });
    }

    // Check if nonce already in-flight
    const inFlight = this.senderInFlight.get(req.from);
    if (inFlight && inFlight.has(req.nonce)) {
      conflicts.push({
        type: 'nonce',
        from: req.from,
        expectedNonce,
        gotNonce: req.nonce,
      });
    }

    // Check state conflicts
    for (const [stateId, expectedVersion] of req.expected) {
      const statePending = this.byState.get(stateId);
      if (!statePending) continue;

      for (const pending of statePending) {
        // Same version = potential conflict
        if (pending.expectedVersion === expectedVersion) {
          // If either tx wants a lock, it's a conflict
          if (pending.lockWrites || req.lockWrites) {
            conflicts.push({
              type: 'lock',
              stateId,
              expectedVersion,
              pendingTxId: pending.txId,
              pendingLockWrites: pending.lockWrites,
            });
          } else {
            // Both are non-locking, but still a potential race
            conflicts.push({
              type: 'state',
              stateId,
              expectedVersion,
              pendingTxId: pending.txId,
              pendingLockWrites: pending.lockWrites,
            });
          }
        }
      }
    }

    return {
      ok: conflicts.length === 0,
      conflicts,
      senderNextNonce: expectedNonce,
    };
  }

  /**
   * Add a transaction to the pending index (on mempool admit)
   */
  onAdmit(tx: PendingTxRef): { ok: boolean; error?: string } {
    // Check if already tracked
    if (this.byTxId.has(tx.txId)) {
      return { ok: false, error: 'ALREADY_PENDING' };
    }

    // Track by txId
    this.byTxId.set(tx.txId, tx);

    // Track by sender
    let inFlight = this.senderInFlight.get(tx.from);
    if (!inFlight) {
      inFlight = new Map();
      this.senderInFlight.set(tx.from, inFlight);
    }
    inFlight.set(tx.nonce, tx);

    // Update next expected nonce
    const currentNext = this.senderNextNonce.get(tx.from) || 0n;
    if (tx.nonce >= currentNext) {
      this.senderNextNonce.set(tx.from, tx.nonce + 1n);
    }

    // Track by state
    for (const stateId of tx.stateTouches) {
      let statePending = this.byState.get(stateId);
      if (!statePending) {
        statePending = [];
        this.byState.set(stateId, statePending);
      }

      // Enforce per-state limit
      if (statePending.length >= this.config.perStateMax) {
        // Remove oldest
        statePending.shift();
      }

      const expectedVersion = tx.expected.get(stateId) || '';
      statePending.push({
        txId: tx.txId,
        from: tx.from,
        nonce: tx.nonce,
        expectedVersion,
        lockWrites: tx.lockWrites,
      });
    }

    return { ok: true };
  }

  /**
   * Remove a transaction from the pending index
   */
  onRemove(txId: string): boolean {
    const tx = this.byTxId.get(txId);
    if (!tx) return false;

    // Remove from byTxId
    this.byTxId.delete(txId);

    // Remove from sender tracking
    const inFlight = this.senderInFlight.get(tx.from);
    if (inFlight) {
      inFlight.delete(tx.nonce);
      if (inFlight.size === 0) {
        this.senderInFlight.delete(tx.from);
      }
    }

    // Remove from state tracking
    for (const stateId of tx.stateTouches) {
      const statePending = this.byState.get(stateId);
      if (statePending) {
        const idx = statePending.findIndex(p => p.txId === txId);
        if (idx !== -1) {
          statePending.splice(idx, 1);
        }
        if (statePending.length === 0) {
          this.byState.delete(stateId);
        }
      }
    }

    return true;
  }

  /**
   * Handle transaction commit - remove and update nonce tracking
   */
  onCommit(from: string, nonce: bigint, txId?: string): void {
    // Remove the specific tx if we know the ID
    if (txId) {
      this.onRemove(txId);
    } else {
      // Find by from + nonce
      const inFlight = this.senderInFlight.get(from);
      if (inFlight) {
        const tx = inFlight.get(nonce);
        if (tx) {
          this.onRemove(tx.txId);
        }
      }
    }

    // Update base nonce (committed nonce is now consumed)
    // Next expected = committed + 1 + remaining in-flight
    const inFlight = this.senderInFlight.get(from);
    const inFlightCount = inFlight ? inFlight.size : 0;
    this.senderNextNonce.set(from, nonce + 1n + BigInt(inFlightCount));
  }

  /**
   * Get pending transactions for a sender
   */
  getBySender(from: string): PendingTxRef[] {
    const inFlight = this.senderInFlight.get(from);
    if (!inFlight) return [];

    return Array.from(inFlight.values()).sort((a, b) => Number(a.nonce - b.nonce));
  }

  /**
   * Get pending transactions touching specific states
   */
  getByStates(stateIds: string[]): PendingTxRef[] {
    const seen = new Set<string>();
    const results: PendingTxRef[] = [];

    for (const stateId of stateIds) {
      const statePending = this.byState.get(stateId);
      if (!statePending) continue;

      for (const pending of statePending) {
        if (seen.has(pending.txId)) continue;
        seen.add(pending.txId);

        const tx = this.byTxId.get(pending.txId);
        if (tx) {
          results.push(tx);
        }
      }
    }

    return results;
  }

  /**
   * Get a specific pending transaction
   */
  get(txId: string): PendingTxRef | undefined {
    return this.byTxId.get(txId);
  }

  /**
   * Check if a transaction is pending
   */
  has(txId: string): boolean {
    return this.byTxId.has(txId);
  }

  /**
   * Get statistics
   */
  getStats(): PendingIndexStats {
    let lockedCount = 0;
    for (const tx of this.byTxId.values()) {
      if (tx.lockWrites) lockedCount++;
    }

    return {
      totalTxs: this.byTxId.size,
      senderCount: this.senderInFlight.size,
      stateCount: this.byState.size,
      lockedCount,
    };
  }

  /**
   * Clear all pending data
   */
  clear(): void {
    this.senderNextNonce.clear();
    this.senderInFlight.clear();
    this.byState.clear();
    this.byTxId.clear();
  }
}
