/**
 * Preflight Service
 *
 * Pre-submission validation for transactions.
 * Checks for conflicts before adding to mempool.
 */

import { PendingIndex, ConflictResult } from './pendingIndex';
import { HotWindow } from './hotWindow';

/**
 * Preflight request
 */
export interface PreflightRequest {
  from: string;
  nonce: bigint;
  stateIds: string[];
  stateVersions: Map<string, string>;
  locks?: string[];
}

/**
 * Conflict type
 */
export interface Conflict {
  type: 'nonce' | 'state' | 'lock';
  stateId?: string;
  conflictingTxId: string;
  reason: string;
}

/**
 * Preflight result
 */
export interface PreflightResult {
  ok: boolean;
  conflicts: Conflict[];
  senderNextNonce: bigint;
}

/**
 * Preflight Service
 */
export class PreflightService {
  constructor(
    private pendingIndex: PendingIndex,
    private hotWindow: HotWindow,
  ) {}

  /**
   * Check transaction for conflicts before submission
   */
  check(request: PreflightRequest): PreflightResult {
    const conflicts: Conflict[] = [];

    // Check nonce conflict
    const nonceResult = this.pendingIndex.checkNonceConflict(request.from, request.nonce);
    if (nonceResult.hasConflict) {
      conflicts.push({
        type: 'nonce',
        conflictingTxId: nonceResult.conflictingTxId!,
        reason: nonceResult.reason!,
      });
    }

    // Check state version conflicts
    for (const [stateId, version] of request.stateVersions) {
      const stateResult = this.pendingIndex.checkStateConflict(stateId, version);
      if (stateResult.hasConflict) {
        conflicts.push({
          type: 'state',
          stateId,
          conflictingTxId: stateResult.conflictingTxId!,
          reason: stateResult.reason!,
        });
      }
    }

    // Check lock conflicts
    if (request.locks) {
      for (const stateId of request.locks) {
        const lockResult = this.pendingIndex.checkLockConflict(stateId);
        if (lockResult.hasConflict) {
          conflicts.push({
            type: 'lock',
            stateId,
            conflictingTxId: lockResult.conflictingTxId!,
            reason: lockResult.reason!,
          });
        }
      }
    }

    // Calculate sender's next expected nonce
    const senderTxs = this.hotWindow.getBySender(request.from);
    let maxNonce = 0n;
    for (const tx of senderTxs) {
      if (tx.nonce > maxNonce) {
        maxNonce = tx.nonce;
      }
    }

    return {
      ok: conflicts.length === 0,
      conflicts,
      senderNextNonce: maxNonce + 1n,
    };
  }
}
