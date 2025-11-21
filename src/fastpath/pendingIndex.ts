/**
 * Pending Index
 *
 * Tracks pending transactions for conflict detection.
 * Detects nonce, state version, and lock conflicts.
 */

/**
 * Pending entry
 */
export interface PendingEntry {
  txId: string;
  from: string;
  nonce: bigint;
  stateIds: string[];
  stateVersions: Map<string, string>;
  locks?: string[];
}

/**
 * Conflict result
 */
export interface ConflictResult {
  hasConflict: boolean;
  conflictingTxId?: string;
  reason?: string;
}

/**
 * Pending Index
 */
export class PendingIndex {
  private entries = new Map<string, PendingEntry>();

  // Secondary indexes
  private byNonce = new Map<string, string>();   // `${from}:${nonce}` -> txId
  private byStateVersion = new Map<string, string>(); // `${stateId}:${version}` -> txId
  private byLock = new Map<string, string>();    // stateId -> txId

  /**
   * Add pending entry
   */
  add(entry: PendingEntry): void {
    this.entries.set(entry.txId, entry);

    // Index by nonce
    const nonceKey = `${entry.from}:${entry.nonce}`;
    this.byNonce.set(nonceKey, entry.txId);

    // Index by state version
    for (const [stateId, version] of entry.stateVersions) {
      const versionKey = `${stateId}:${version}`;
      this.byStateVersion.set(versionKey, entry.txId);
    }

    // Index by lock
    if (entry.locks) {
      for (const stateId of entry.locks) {
        this.byLock.set(stateId, entry.txId);
      }
    }
  }

  /**
   * Check if txId exists
   */
  has(txId: string): boolean {
    return this.entries.has(txId);
  }

  /**
   * Get entry by txId
   */
  get(txId: string): PendingEntry | undefined {
    return this.entries.get(txId);
  }

  /**
   * Check for nonce conflict
   */
  checkNonceConflict(from: string, nonce: bigint): ConflictResult {
    const nonceKey = `${from}:${nonce}`;
    const existingTxId = this.byNonce.get(nonceKey);

    if (existingTxId) {
      return {
        hasConflict: true,
        conflictingTxId: existingTxId,
        reason: `Nonce ${nonce} already used by tx ${existingTxId}`,
      };
    }

    return { hasConflict: false };
  }

  /**
   * Check for state version conflict
   */
  checkStateConflict(stateId: string, version: string): ConflictResult {
    const versionKey = `${stateId}:${version}`;
    const existingTxId = this.byStateVersion.get(versionKey);

    if (existingTxId) {
      return {
        hasConflict: true,
        conflictingTxId: existingTxId,
        reason: `State ${stateId} version ${version} already claimed by tx ${existingTxId}`,
      };
    }

    return { hasConflict: false };
  }

  /**
   * Check for lock conflict
   */
  checkLockConflict(stateId: string): ConflictResult {
    const existingTxId = this.byLock.get(stateId);

    if (existingTxId) {
      return {
        hasConflict: true,
        conflictingTxId: existingTxId,
        reason: `State ${stateId} locked by tx ${existingTxId}`,
      };
    }

    return { hasConflict: false };
  }

  /**
   * Commit (remove) entry on successful execution
   */
  commit(txId: string): void {
    const entry = this.entries.get(txId);
    if (!entry) return;

    // Remove from indexes
    const nonceKey = `${entry.from}:${entry.nonce}`;
    this.byNonce.delete(nonceKey);

    for (const [stateId, version] of entry.stateVersions) {
      const versionKey = `${stateId}:${version}`;
      this.byStateVersion.delete(versionKey);
    }

    if (entry.locks) {
      for (const stateId of entry.locks) {
        this.byLock.delete(stateId);
      }
    }

    this.entries.delete(txId);
  }

  /**
   * Abort (remove) entry on failure
   */
  abort(txId: string): void {
    this.commit(txId); // Same cleanup logic
  }
}
