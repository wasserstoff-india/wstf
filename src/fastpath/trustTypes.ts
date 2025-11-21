/**
 * Trust Layer Types and Utilities
 *
 * Defines trust tiers, context, and computation functions for
 * transaction confirmation based on trust scores and risk assessment.
 */

/**
 * Trust tiers define the confirmation requirements for transactions
 */
export enum TrustTier {
  ADMITTED = 0,    // Instant - no confirmation needed
  INCLUDED = 1,    // Wait for block inclusion
  K_DEPTH = 2,     // Wait for k confirmations
  CROSS_CHAIN = 3, // Full finality (cross-chain security)
}

/**
 * Context for computing trust tier
 */
export interface TrustContext {
  trustScore: number;   // 0-1, sender reputation/history
  riskScore: number;    // 0-1, transaction risk assessment
  valueUsd: number;     // USD value of transaction
  isHighValue: boolean; // Flag for high-value transactions
}

/**
 * Thresholds for tier assignment
 */
const THRESHOLDS = {
  ADMITTED_TRUST: 0.9,
  INCLUDED_TRUST: 0.6,
  K_DEPTH_TRUST: 0.3,
  HIGH_RISK: 0.7,
};

/**
 * Compute the trust tier for a transaction based on context
 */
export function computeTrustTier(ctx: TrustContext): TrustTier {
  // High risk always requires cross-chain security
  if (ctx.riskScore >= THRESHOLDS.HIGH_RISK) {
    return TrustTier.CROSS_CHAIN;
  }

  // High value transactions get escalated
  if (ctx.isHighValue) {
    if (ctx.trustScore >= THRESHOLDS.ADMITTED_TRUST) {
      return TrustTier.K_DEPTH;
    }
    return TrustTier.CROSS_CHAIN;
  }

  // Normal tier assignment based on trust score
  if (ctx.trustScore >= THRESHOLDS.ADMITTED_TRUST && ctx.riskScore < 0.2) {
    return TrustTier.ADMITTED;
  }

  if (ctx.trustScore >= THRESHOLDS.INCLUDED_TRUST && ctx.riskScore < 0.3) {
    return TrustTier.INCLUDED;
  }

  if (ctx.trustScore >= THRESHOLDS.K_DEPTH_TRUST) {
    return TrustTier.K_DEPTH;
  }

  return TrustTier.CROSS_CHAIN;
}

/**
 * Compute required k-depth confirmations based on trust score
 */
export function kDepthForTrust(trustScore: number): number {
  if (trustScore >= 0.9) return 0;
  if (trustScore >= 0.8) return 1;
  if (trustScore >= 0.7) return 2;
  if (trustScore >= 0.5) return 3;
  if (trustScore >= 0.3) return 4;
  if (trustScore >= 0.2) return 5;
  return 6;
}

/**
 * Estimate confirmation time in seconds based on tier and block time
 */
export function estimateConfirmationTime(tier: TrustTier, blockTimeSeconds: number): number {
  switch (tier) {
    case TrustTier.ADMITTED:
      return 0; // Instant
    case TrustTier.INCLUDED:
      return blockTimeSeconds; // 1 block
    case TrustTier.K_DEPTH:
      return blockTimeSeconds * 3; // ~3 blocks
    case TrustTier.CROSS_CHAIN:
      return blockTimeSeconds * 10; // ~10 blocks for finality
    default:
      return blockTimeSeconds * 10;
  }
}
