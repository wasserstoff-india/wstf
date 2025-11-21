/**
 * Transaction Status Service
 *
 * Provides unified transaction status across all confirmation tiers,
 * integrating with the confirmation tracker and policy engine.
 */
import {
  ConfirmationTier,
  TIER_NAMES,
  TIER_DESCRIPTIONS,
  estimateConfirmationTimes,
  ConfirmationConfig,
  DEFAULT_CONFIRMATION_CONFIG,
} from './types';
import { ConfirmationTracker, TrackedTx } from './confirmationTracker';
import { PolicyEngine, PolicyContext, PolicyResult, BALANCED_POLICY } from './policy';

/**
 * Transaction status for API responses
 */
export interface TxStatus {
  /** Transaction ID */
  txId: string;

  /** Sender address */
  from: string;

  /** Transaction nonce */
  nonce: string;

  /** Current confirmation tier */
  tier: ConfirmationTier;

  /** Tier display name */
  tierName: string;

  /** Tier description */
  tierDescription: string;

  /** Number of confirmations (blocks deep) */
  confirms: number;

  /** Required tier for this action/context */
  requiredTier: ConfirmationTier;

  /** Whether required tier has been reached */
  isComplete: boolean;

  /** Progress percentage towards required tier (0-100) */
  progress: number;

  /** Block information (if included) */
  block?: {
    hash: string;
    height: string;
  };

  /** Cross-chain journal info (if finalized) */
  journal?: {
    txHash: string;
    chain: string;
  };

  /** Timestamps for each tier */
  timestamps: {
    preflight?: number;
    admitted?: number;
    included?: number;
    kDepth?: number;
    crossChain?: number;
  };

  /** Estimated time to next tier (ms) */
  estimatedNextTierMs?: number;

  /** Estimated time to completion (ms) */
  estimatedCompleteMs?: number;
}

/**
 * Batch status request
 */
export interface BatchStatusRequest {
  txIds: string[];
}

/**
 * Batch status response
 */
export interface BatchStatusResponse {
  statuses: Map<string, TxStatus | null>;
  found: number;
  notFound: number;
}

/**
 * Status service configuration
 */
export interface StatusServiceConfig {
  /** Confirmation config */
  confirmation: ConfirmationConfig;

  /** Enable status caching */
  enableCache: boolean;

  /** Cache TTL (ms) */
  cacheTtlMs: number;
}

/**
 * Default status service config
 */
export const DEFAULT_STATUS_CONFIG: StatusServiceConfig = {
  confirmation: DEFAULT_CONFIRMATION_CONFIG,
  enableCache: true,
  cacheTtlMs: 1000,
};

/**
 * Transaction Status Service
 */
export class StatusService {
  private tracker: ConfirmationTracker;
  private policyEngine: PolicyEngine;
  private config: StatusServiceConfig;
  private currentHeight: bigint = 0n;

  // Simple cache
  private cache = new Map<string, { status: TxStatus; expiresAt: number }>();

  constructor(
    tracker: ConfirmationTracker,
    policyEngine: PolicyEngine = new PolicyEngine(BALANCED_POLICY),
    config: StatusServiceConfig = DEFAULT_STATUS_CONFIG
  ) {
    this.tracker = tracker;
    this.policyEngine = policyEngine;
    this.config = config;
  }

  /**
   * Update current chain height (call on new blocks)
   */
  updateHeight(height: bigint): void {
    this.currentHeight = height;
  }

  /**
   * Get status for a single transaction
   */
  getStatus(txId: string): TxStatus | null {
    // Check cache
    if (this.config.enableCache) {
      const cached = this.cache.get(txId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.status;
      }
    }

    const tracked = this.tracker.get(txId);
    if (!tracked) {
      return null;
    }

    const status = this.buildStatus(tracked);

    // Cache the result
    if (this.config.enableCache) {
      this.cache.set(txId, {
        status,
        expiresAt: Date.now() + this.config.cacheTtlMs,
      });
    }

    return status;
  }

  /**
   * Get status for multiple transactions
   */
  getBatchStatus(request: BatchStatusRequest): BatchStatusResponse {
    const statuses = new Map<string, TxStatus | null>();
    let found = 0;
    let notFound = 0;

    for (const txId of request.txIds) {
      const status = this.getStatus(txId);
      statuses.set(txId, status);

      if (status) {
        found++;
      } else {
        notFound++;
      }
    }

    return { statuses, found, notFound };
  }

  /**
   * Get status by sender address
   */
  getStatusBySender(from: string): TxStatus[] {
    const tracked = this.tracker.getBySender(from);
    return tracked.map(tx => this.buildStatus(tx));
  }

  /**
   * Get required tier for a given policy context
   */
  getRequiredTierByContext(ctx: PolicyContext): PolicyResult {
    return this.policyEngine.evaluate(ctx);
  }

  /**
   * Build TxStatus from TrackedTx
   */
  private buildStatus(tracked: TrackedTx): TxStatus {
    const estimates = estimateConfirmationTimes(this.config.confirmation);

    // Calculate progress percentage
    const progress = this.calculateProgress(tracked);

    // Calculate estimated times
    const { estimatedNextTierMs, estimatedCompleteMs } = this.calculateEstimates(
      tracked,
      estimates
    );

    return {
      txId: tracked.txId,
      from: tracked.from,
      nonce: tracked.nonce.toString(),
      tier: tracked.tier,
      tierName: TIER_NAMES[tracked.tier],
      tierDescription: TIER_DESCRIPTIONS[tracked.tier],
      confirms: tracked.currentDepth ?? 0,
      requiredTier: tracked.requiredTier,
      isComplete: tracked.tier >= tracked.requiredTier,
      progress,
      block: tracked.block ? {
        hash: tracked.block.hash,
        height: tracked.block.height.toString(),
      } : undefined,
      journal: tracked.journal ? {
        txHash: tracked.journal.txHash,
        chain: tracked.journal.chain,
      } : undefined,
      timestamps: tracked.timestamps,
      estimatedNextTierMs,
      estimatedCompleteMs,
    };
  }

  /**
   * Calculate progress percentage
   */
  private calculateProgress(tracked: TrackedTx): number {
    // If complete, 100%
    if (tracked.tier >= tracked.requiredTier) {
      return 100;
    }

    // Calculate based on tier progression
    const totalTiers = tracked.requiredTier - ConfirmationTier.PREFLIGHT;
    const completedTiers = tracked.tier - ConfirmationTier.PREFLIGHT;

    if (totalTiers === 0) return 100;

    // Base progress from completed tiers
    let progress = (completedTiers / totalTiers) * 100;

    // Add partial progress within current tier
    if (tracked.tier === ConfirmationTier.INCLUDED && tracked.kDepthTarget && tracked.currentDepth !== undefined) {
      // Progress towards K_DEPTH
      const kProgress = Math.min(tracked.currentDepth / tracked.kDepthTarget, 1);
      const tierWeight = 100 / totalTiers;
      progress += kProgress * tierWeight;
    }

    return Math.min(Math.round(progress), 99); // Cap at 99 until complete
  }

  /**
   * Calculate estimated times
   */
  private calculateEstimates(
    tracked: TrackedTx,
    estimates: ReturnType<typeof estimateConfirmationTimes>
  ): { estimatedNextTierMs?: number; estimatedCompleteMs?: number } {
    if (tracked.tier >= tracked.requiredTier) {
      return {}; // Already complete
    }

    const now = Date.now();
    let estimatedNextTierMs: number | undefined;
    let estimatedCompleteMs: number | undefined;

    switch (tracked.tier) {
      case ConfirmationTier.PREFLIGHT:
        estimatedNextTierMs = estimates.admittedMs;
        break;

      case ConfirmationTier.ADMITTED:
        estimatedNextTierMs = estimates.includedMs - estimates.admittedMs;
        break;

      case ConfirmationTier.INCLUDED:
        if (tracked.kDepthTarget && tracked.currentDepth !== undefined) {
          const remainingBlocks = tracked.kDepthTarget - tracked.currentDepth;
          estimatedNextTierMs = remainingBlocks * this.config.confirmation.blockTimeMs;
        }
        break;

      case ConfirmationTier.K_DEPTH:
        estimatedNextTierMs = this.config.confirmation.journal.delayAfterKDepthMs + 10000;
        break;
    }

    // Calculate total time to required tier
    if (tracked.requiredTier > tracked.tier) {
      let remainingMs = estimatedNextTierMs ?? 0;

      // Add time for subsequent tiers
      for (let tier = tracked.tier + 1; tier < tracked.requiredTier; tier++) {
        switch (tier) {
          case ConfirmationTier.ADMITTED:
            remainingMs += estimates.includedMs - estimates.admittedMs;
            break;
          case ConfirmationTier.INCLUDED:
            remainingMs += estimates.kDepthMs - estimates.includedMs;
            break;
          case ConfirmationTier.K_DEPTH:
            remainingMs += estimates.crossChainMs - estimates.kDepthMs;
            break;
        }
      }

      estimatedCompleteMs = remainingMs;
    }

    return { estimatedNextTierMs, estimatedCompleteMs };
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [txId, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(txId);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get service stats
   */
  getStats(): {
    cacheSize: number;
    trackerStats: ReturnType<ConfirmationTracker['getStats']>;
  } {
    return {
      cacheSize: this.cache.size,
      trackerStats: this.tracker.getStats(),
    };
  }
}

/**
 * Format status for JSON API response
 */
export function formatStatusResponse(status: TxStatus | null): Record<string, unknown> | null {
  if (!status) return null;

  return {
    txId: status.txId,
    from: status.from,
    nonce: status.nonce,
    tier: status.tier,
    tierName: status.tierName,
    tierDescription: status.tierDescription,
    confirms: status.confirms,
    requiredTier: status.requiredTier,
    requiredTierName: TIER_NAMES[status.requiredTier],
    isComplete: status.isComplete,
    progress: status.progress,
    block: status.block,
    journal: status.journal,
    timestamps: status.timestamps,
    estimatedNextTierMs: status.estimatedNextTierMs,
    estimatedCompleteMs: status.estimatedCompleteMs,
  };
}
