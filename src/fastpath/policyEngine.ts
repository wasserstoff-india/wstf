/**
 * Policy Engine
 *
 * Configurable policies for trust tier computation.
 * Supports default, conservative, and aggressive policies.
 */

import { TrustTier, TrustContext } from './trustTypes';

/**
 * Trust policy configuration
 */
export interface TrustPolicy {
  name: string;
  admittedThreshold: number;    // Trust score needed for ADMITTED
  includedThreshold: number;    // Trust score needed for INCLUDED
  kDepthThreshold: number;      // Trust score needed for K_DEPTH
  maxKDepth: number;            // Maximum k-depth confirmations
  highValueMultiplier: number;  // Multiplier for high-value tx k-depth
}

/**
 * Default balanced policy
 */
export const DEFAULT_POLICY: TrustPolicy = {
  name: 'default',
  admittedThreshold: 0.9,
  includedThreshold: 0.6,
  kDepthThreshold: 0.3,
  maxKDepth: 6,
  highValueMultiplier: 2,
};

/**
 * Conservative policy - higher thresholds
 */
export const CONSERVATIVE_POLICY: TrustPolicy = {
  name: 'conservative',
  admittedThreshold: 0.98,
  includedThreshold: 0.85,
  kDepthThreshold: 0.5,
  maxKDepth: 12,
  highValueMultiplier: 3,
};

/**
 * Aggressive policy - lower thresholds
 */
export const AGGRESSIVE_POLICY: TrustPolicy = {
  name: 'aggressive',
  admittedThreshold: 0.7,
  includedThreshold: 0.4,
  kDepthThreshold: 0.2,
  maxKDepth: 3,
  highValueMultiplier: 1.5,
};

/**
 * Policy validation result
 */
export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Policy Engine
 */
export class PolicyEngine {
  private currentPolicy: TrustPolicy = DEFAULT_POLICY;

  /**
   * Get current policy
   */
  getCurrentPolicy(): TrustPolicy {
    return this.currentPolicy;
  }

  /**
   * Set policy
   */
  setPolicy(policy: TrustPolicy): void {
    this.currentPolicy = policy;
  }

  /**
   * Compute trust tier based on current policy
   */
  computeTier(ctx: TrustContext): TrustTier {
    const policy = this.currentPolicy;

    // High risk always requires cross-chain
    if (ctx.riskScore >= 0.7) {
      return TrustTier.CROSS_CHAIN;
    }

    // High value escalation
    if (ctx.isHighValue) {
      if (ctx.trustScore >= policy.admittedThreshold) {
        return TrustTier.K_DEPTH;
      }
      return TrustTier.CROSS_CHAIN;
    }

    // Normal tier assignment
    if (ctx.trustScore >= policy.admittedThreshold && ctx.riskScore < 0.2) {
      return TrustTier.ADMITTED;
    }

    if (ctx.trustScore >= policy.includedThreshold && ctx.riskScore < 0.3) {
      return TrustTier.INCLUDED;
    }

    if (ctx.trustScore >= policy.kDepthThreshold) {
      return TrustTier.K_DEPTH;
    }

    return TrustTier.CROSS_CHAIN;
  }

  /**
   * Get required k-depth for trust score
   */
  getRequiredKDepth(trustScore: number): number {
    const policy = this.currentPolicy;

    if (trustScore >= policy.admittedThreshold) return 0;
    if (trustScore >= policy.includedThreshold) return 1;
    if (trustScore >= policy.kDepthThreshold) return 3;

    return policy.maxKDepth;
  }

  /**
   * Validate a policy configuration
   */
  validatePolicy(policy: TrustPolicy): PolicyValidationResult {
    const errors: string[] = [];

    // Thresholds should be in descending order
    if (policy.admittedThreshold <= policy.includedThreshold) {
      errors.push('admittedThreshold must be greater than includedThreshold');
    }

    if (policy.includedThreshold <= policy.kDepthThreshold) {
      errors.push('includedThreshold must be greater than kDepthThreshold');
    }

    // Thresholds should be in valid range
    if (policy.admittedThreshold < 0 || policy.admittedThreshold > 1) {
      errors.push('admittedThreshold must be between 0 and 1');
    }

    if (policy.maxKDepth < 1) {
      errors.push('maxKDepth must be at least 1');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
