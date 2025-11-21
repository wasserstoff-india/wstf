/**
 * Status Service
 *
 * Provides transaction status information for API responses.
 */

import { TrustTier } from './trustTypes';
import { ConfirmationTracker, TxConfirmationState } from './confirmationTracker';

/**
 * Transaction status for API
 */
export interface TxStatus {
  txId: string;
  tier: TrustTier;
  progress: number;
  confirmations: number;
  isFinalized: boolean;
  blockHash?: string;
  blockHeight?: bigint;
}

/**
 * Formatted status for API response
 */
export interface FormattedStatusResponse {
  txId: string;
  tier: string;
  progress: number;
  confirmations: number;
  isFinalized: boolean;
  blockHash?: string;
  blockHeight?: string;
  estimatedTime: number;
}

/**
 * Format status for API response
 */
export function formatStatusResponse(status: TxStatus): FormattedStatusResponse {
  const tierNames = ['ADMITTED', 'INCLUDED', 'K_DEPTH', 'CROSS_CHAIN'];

  // Estimate time based on tier (seconds)
  const estimatedTimes = [0, 2, 6, 20];

  return {
    txId: status.txId,
    tier: tierNames[status.tier],
    progress: status.progress,
    confirmations: status.confirmations,
    isFinalized: status.isFinalized,
    blockHash: status.blockHash,
    blockHeight: status.blockHeight?.toString(),
    estimatedTime: estimatedTimes[status.tier],
  };
}

/**
 * Status Service
 */
export class StatusService {
  constructor(private tracker: ConfirmationTracker) {}

  /**
   * Get status for a single transaction
   */
  getStatus(txId: string): TxStatus | undefined {
    const state = this.tracker.get(txId);
    if (!state) return undefined;

    return {
      txId: state.txId,
      tier: state.currentTier,
      progress: this.calculateProgress(state),
      confirmations: state.confirmations,
      isFinalized: state.isFinalized,
      blockHash: state.blockHash,
      blockHeight: state.blockHeight,
    };
  }

  /**
   * Get status for multiple transactions
   */
  getBatchStatus(txIds: string[]): Map<string, TxStatus | undefined> {
    const result = new Map<string, TxStatus | undefined>();

    for (const txId of txIds) {
      result.set(txId, this.getStatus(txId));
    }

    return result;
  }

  /**
   * Calculate progress percentage (0-100)
   */
  private calculateProgress(state: TxConfirmationState): number {
    if (state.isFinalized) return 100;

    // Progress based on tier and confirmations
    switch (state.currentTier) {
      case TrustTier.ADMITTED:
        return 25;
      case TrustTier.INCLUDED:
        return 50;
      case TrustTier.K_DEPTH:
        // 50-90% based on confirmations
        return Math.min(50 + state.confirmations * 10, 90);
      case TrustTier.CROSS_CHAIN:
        return 95; // Almost done, waiting for finality
      default:
        return 0;
    }
  }
}
