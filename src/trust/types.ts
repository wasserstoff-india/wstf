/**
 * Trust types and confirmation tiers
 *
 * Trust scores are computed by the application layer.
 * The chain provides infrastructure for tier-based confirmation.
 */

/**
 * Confirmation tiers - graduated finality model
 */
export enum ConfirmationTier {
  /** ~50ms - Preflight passed, safe to sign */
  PREFLIGHT = 0,

  /** ~100ms - Admitted to mempool, signature verified */
  ADMITTED = 1,

  /** ~2-4s - Included in a block */
  INCLUDED = 2,

  /** ~10-20s - K blocks deep, reorg unlikely */
  K_DEPTH = 3,

  /** ~30s - Written to external DA layer, irreversible */
  CROSS_CHAIN = 4,
}

/**
 * Trust profile for a sender/action
 */
export interface TrustProfile {
  /** Trust score 0-100 */
  score: number;

  /** Source of trust */
  source: TrustSource;

  /** Computed required confirmation tier */
  requiredTier: ConfirmationTier;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export type TrustSource =
  | 'identity'      // Verified identity (KYC, etc.)
  | 'stake'         // Collateral/stake deposited
  | 'history'       // Transaction history reputation
  | 'attestation'   // External attestation (oracle, etc.)
  | 'default';      // No specific trust source

/**
 * Action risk levels
 */
export type ActionRisk = 'low' | 'medium' | 'high';

/**
 * Confirmation timing estimates
 */
export interface ConfirmationEstimates {
  /** Time to ADMITTED tier (ms) */
  admittedMs: number;

  /** Time to INCLUDED tier (ms) */
  includedMs: number;

  /** Time to K_DEPTH tier (ms) */
  kDepthMs: number;

  /** Time to CROSS_CHAIN tier (ms) */
  crossChainMs: number;
}

/**
 * Trust thresholds configuration
 */
export interface TrustThresholds {
  /** Score >= this: ADMITTED tier is acceptable */
  instantAccept: number;

  /** Score >= this: INCLUDED tier is acceptable */
  softConfirm: number;

  /** Score >= this: K_DEPTH tier is acceptable */
  hardConfirm: number;

  // Below hardConfirm: always wait for CROSS_CHAIN
}

/**
 * K-depth configuration per trust level
 */
export interface KDepthConfig {
  /** Default K for standard transactions */
  default: number;

  /** K for high-trust senders (score >= instantAccept) */
  highTrust: number;

  /** K for low-trust senders (score < hardConfirm) */
  lowTrust: number;
}

/**
 * Confirmation configuration
 */
export interface ConfirmationConfig {
  kDepth: KDepthConfig;

  journal: {
    enabled: boolean;
    delayAfterKDepthMs: number;
    batchSize: number;
    adapters: string[];
  };

  trustThresholds: TrustThresholds;

  /** Estimated block time in ms */
  blockTimeMs: number;
}

/**
 * Default confirmation configuration
 */
export const DEFAULT_CONFIRMATION_CONFIG: ConfirmationConfig = {
  kDepth: {
    default: 6,
    highTrust: 2,
    lowTrust: 12,
  },
  journal: {
    enabled: false,
    delayAfterKDepthMs: 5000,
    batchSize: 10,
    adapters: ['mock'],
  },
  trustThresholds: {
    instantAccept: 90,
    softConfirm: 70,
    hardConfirm: 50,
  },
  blockTimeMs: 2000,
};

/**
 * Get the required confirmation tier based on trust score and action risk
 */
export function getRequiredTier(
  trustScore: number,
  actionRisk: ActionRisk,
  thresholds: TrustThresholds = DEFAULT_CONFIRMATION_CONFIG.trustThresholds
): ConfirmationTier {
  // High-risk actions always require cross-chain finality
  if (actionRisk === 'high') {
    return ConfirmationTier.CROSS_CHAIN;
  }

  // Low-risk actions with high trust can use faster tiers
  if (actionRisk === 'low') {
    if (trustScore >= thresholds.instantAccept) {
      return ConfirmationTier.ADMITTED;
    }
    if (trustScore >= thresholds.softConfirm) {
      return ConfirmationTier.INCLUDED;
    }
  }

  // Medium-risk or moderate trust
  if (trustScore >= thresholds.hardConfirm) {
    return ConfirmationTier.K_DEPTH;
  }

  // Low trust always waits for cross-chain
  return ConfirmationTier.CROSS_CHAIN;
}

/**
 * Get K-depth based on trust score
 */
export function getKDepth(
  trustScore: number,
  config: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG
): number {
  if (trustScore >= config.trustThresholds.instantAccept) {
    return config.kDepth.highTrust;
  }
  if (trustScore < config.trustThresholds.hardConfirm) {
    return config.kDepth.lowTrust;
  }
  return config.kDepth.default;
}

/**
 * Estimate confirmation times based on configuration
 */
export function estimateConfirmationTimes(
  config: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG
): ConfirmationEstimates {
  const blockTime = config.blockTimeMs;

  return {
    admittedMs: 100,                                    // Network + validation
    includedMs: blockTime * 1.5,                        // ~1.5 blocks average
    kDepthMs: blockTime * (config.kDepth.default + 1),  // K blocks after inclusion
    crossChainMs: blockTime * (config.kDepth.default + 1) + config.journal.delayAfterKDepthMs + 10000,
  };
}

/**
 * Tier display names for UX
 */
export const TIER_NAMES: Record<ConfirmationTier, string> = {
  [ConfirmationTier.PREFLIGHT]: 'Processing',
  [ConfirmationTier.ADMITTED]: 'Sent',
  [ConfirmationTier.INCLUDED]: 'Confirmed',
  [ConfirmationTier.K_DEPTH]: 'Finalized',
  [ConfirmationTier.CROSS_CHAIN]: 'Permanent',
};

/**
 * Tier descriptions for UX
 */
export const TIER_DESCRIPTIONS: Record<ConfirmationTier, string> = {
  [ConfirmationTier.PREFLIGHT]: 'Transaction is being prepared',
  [ConfirmationTier.ADMITTED]: 'Transaction accepted by network',
  [ConfirmationTier.INCLUDED]: 'Transaction included in block',
  [ConfirmationTier.K_DEPTH]: 'Transaction is final (reorg unlikely)',
  [ConfirmationTier.CROSS_CHAIN]: 'Transaction anchored to external chain',
};
