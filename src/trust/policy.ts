/**
 * Trust Policy Engine
 *
 * Provides configurable trust policies that determine confirmation tier
 * requirements based on trust scores, action risk, and value thresholds.
 */
import {
  ConfirmationTier,
  TrustThresholds,
  KDepthConfig,
  ActionRisk,
  getRequiredTier,
  getKDepth,
  DEFAULT_CONFIRMATION_CONFIG,
} from './types';

/**
 * Value tier thresholds (in base units)
 */
export interface ValueThresholds {
  /** Below this: low value, can use faster confirmations */
  low: bigint;

  /** Below this: medium value */
  medium: bigint;

  /** Above medium: high value, requires stronger confirmation */
  // high is implicit: anything >= medium
}

/**
 * Policy rule - matches conditions to required tier
 */
export interface PolicyRule {
  /** Rule name for debugging */
  name: string;

  /** Minimum trust score to apply this rule (optional) */
  minTrustScore?: number;

  /** Maximum trust score (optional) */
  maxTrustScore?: number;

  /** Action risk filter (optional) */
  actionRisk?: ActionRisk[];

  /** Maximum value to apply this rule (optional, in base units) */
  maxValue?: bigint;

  /** Minimum value (optional) */
  minValue?: bigint;

  /** Required tier if rule matches */
  requiredTier: ConfirmationTier;

  /** K-depth override (optional) */
  kDepth?: number;
}

/**
 * Named trust policy profile
 */
export interface TrustPolicy {
  /** Profile name */
  name: string;

  /** Description */
  description: string;

  /** Base trust thresholds */
  thresholds: TrustThresholds;

  /** K-depth configuration */
  kDepth: KDepthConfig;

  /** Value thresholds for tier escalation */
  valueThresholds: ValueThresholds;

  /** Custom rules (evaluated in order, first match wins) */
  rules: PolicyRule[];

  /** Default tier if no rules match */
  defaultTier: ConfirmationTier;
}

/**
 * Balanced policy - good for general use
 */
export const BALANCED_POLICY: TrustPolicy = {
  name: 'balanced',
  description: 'Balanced policy with reasonable defaults for most use cases',
  thresholds: {
    instantAccept: 90,
    softConfirm: 70,
    hardConfirm: 50,
  },
  kDepth: {
    default: 6,
    highTrust: 2,
    lowTrust: 12,
  },
  valueThresholds: {
    low: 1000n,      // < 1000 units
    medium: 100000n, // < 100k units
  },
  rules: [
    {
      name: 'high-trust-low-value',
      minTrustScore: 90,
      maxValue: 1000n,
      actionRisk: ['low'],
      requiredTier: ConfirmationTier.ADMITTED,
    },
    {
      name: 'high-trust-medium-value',
      minTrustScore: 90,
      maxValue: 100000n,
      actionRisk: ['low', 'medium'],
      requiredTier: ConfirmationTier.INCLUDED,
    },
    {
      name: 'medium-trust-low-value',
      minTrustScore: 70,
      maxValue: 1000n,
      actionRisk: ['low'],
      requiredTier: ConfirmationTier.INCLUDED,
    },
    {
      name: 'high-risk-always',
      actionRisk: ['high'],
      requiredTier: ConfirmationTier.CROSS_CHAIN,
    },
    {
      name: 'high-value-always',
      minValue: 100000n,
      requiredTier: ConfirmationTier.K_DEPTH,
    },
  ],
  defaultTier: ConfirmationTier.K_DEPTH,
};

/**
 * Conservative policy - prioritizes safety over speed
 */
export const CONSERVATIVE_POLICY: TrustPolicy = {
  name: 'conservative',
  description: 'Conservative policy that prioritizes safety over speed',
  thresholds: {
    instantAccept: 95,
    softConfirm: 85,
    hardConfirm: 70,
  },
  kDepth: {
    default: 12,
    highTrust: 6,
    lowTrust: 24,
  },
  valueThresholds: {
    low: 100n,
    medium: 10000n,
  },
  rules: [
    {
      name: 'highest-trust-tiny-value',
      minTrustScore: 95,
      maxValue: 100n,
      actionRisk: ['low'],
      requiredTier: ConfirmationTier.INCLUDED,
    },
    {
      name: 'any-risk-above-low',
      actionRisk: ['medium', 'high'],
      requiredTier: ConfirmationTier.CROSS_CHAIN,
    },
    {
      name: 'any-high-value',
      minValue: 10000n,
      requiredTier: ConfirmationTier.CROSS_CHAIN,
    },
  ],
  defaultTier: ConfirmationTier.K_DEPTH,
};

/**
 * Aggressive policy - prioritizes speed (use with caution)
 */
export const AGGRESSIVE_POLICY: TrustPolicy = {
  name: 'aggressive',
  description: 'Aggressive policy that prioritizes speed (use with caution)',
  thresholds: {
    instantAccept: 70,
    softConfirm: 50,
    hardConfirm: 30,
  },
  kDepth: {
    default: 3,
    highTrust: 1,
    lowTrust: 6,
  },
  valueThresholds: {
    low: 10000n,
    medium: 1000000n,
  },
  rules: [
    {
      name: 'any-trust-low-risk-low-value',
      minTrustScore: 50,
      maxValue: 10000n,
      actionRisk: ['low'],
      requiredTier: ConfirmationTier.ADMITTED,
    },
    {
      name: 'good-trust-medium-value',
      minTrustScore: 70,
      maxValue: 1000000n,
      actionRisk: ['low', 'medium'],
      requiredTier: ConfirmationTier.INCLUDED,
    },
    {
      name: 'high-risk-only',
      actionRisk: ['high'],
      requiredTier: ConfirmationTier.K_DEPTH,
    },
  ],
  defaultTier: ConfirmationTier.INCLUDED,
};

/**
 * Built-in policy profiles
 */
export const POLICIES: Record<string, TrustPolicy> = {
  balanced: BALANCED_POLICY,
  conservative: CONSERVATIVE_POLICY,
  aggressive: AGGRESSIVE_POLICY,
};

/**
 * Policy evaluation context
 */
export interface PolicyContext {
  trustScore: number;
  actionRisk: ActionRisk;
  value?: bigint;
  metadata?: Record<string, unknown>;
}

/**
 * Policy evaluation result
 */
export interface PolicyResult {
  /** Required confirmation tier */
  requiredTier: ConfirmationTier;

  /** Rule that matched (or 'default') */
  matchedRule: string;

  /** K-depth for this context */
  kDepth: number;

  /** Explanation for UX */
  reason: string;
}

/**
 * Trust Policy Engine
 */
export class PolicyEngine {
  private policy: TrustPolicy;

  constructor(policy: TrustPolicy = BALANCED_POLICY) {
    this.policy = policy;
  }

  /**
   * Get current policy
   */
  getPolicy(): TrustPolicy {
    return this.policy;
  }

  /**
   * Set policy by name or custom policy
   */
  setPolicy(policy: TrustPolicy | string): void {
    if (typeof policy === 'string') {
      const named = POLICIES[policy];
      if (!named) {
        throw new Error(`Unknown policy: ${policy}. Available: ${Object.keys(POLICIES).join(', ')}`);
      }
      this.policy = named;
    } else {
      this.policy = policy;
    }
  }

  /**
   * Evaluate policy for a given context
   */
  evaluate(ctx: PolicyContext): PolicyResult {
    // Check rules in order
    for (const rule of this.policy.rules) {
      if (this.matchesRule(rule, ctx)) {
        return {
          requiredTier: rule.requiredTier,
          matchedRule: rule.name,
          kDepth: rule.kDepth ?? this.getKDepthForScore(ctx.trustScore),
          reason: this.buildReason(rule, ctx),
        };
      }
    }

    // Default tier from base thresholds
    const baseTier = getRequiredTier(
      ctx.trustScore,
      ctx.actionRisk,
      this.policy.thresholds
    );

    // Take the stricter of base tier and default tier
    const requiredTier = Math.max(baseTier, this.policy.defaultTier) as ConfirmationTier;

    return {
      requiredTier,
      matchedRule: 'default',
      kDepth: this.getKDepthForScore(ctx.trustScore),
      reason: `Default policy for trust=${ctx.trustScore}, risk=${ctx.actionRisk}`,
    };
  }

  /**
   * Check if a rule matches the context
   */
  private matchesRule(rule: PolicyRule, ctx: PolicyContext): boolean {
    // Trust score bounds
    if (rule.minTrustScore !== undefined && ctx.trustScore < rule.minTrustScore) {
      return false;
    }
    if (rule.maxTrustScore !== undefined && ctx.trustScore > rule.maxTrustScore) {
      return false;
    }

    // Action risk filter
    if (rule.actionRisk && !rule.actionRisk.includes(ctx.actionRisk)) {
      return false;
    }

    // Value bounds
    if (ctx.value !== undefined) {
      if (rule.minValue !== undefined && ctx.value < rule.minValue) {
        return false;
      }
      if (rule.maxValue !== undefined && ctx.value > rule.maxValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get K-depth based on trust score
   */
  private getKDepthForScore(trustScore: number): number {
    if (trustScore >= this.policy.thresholds.instantAccept) {
      return this.policy.kDepth.highTrust;
    }
    if (trustScore < this.policy.thresholds.hardConfirm) {
      return this.policy.kDepth.lowTrust;
    }
    return this.policy.kDepth.default;
  }

  /**
   * Build human-readable reason
   */
  private buildReason(rule: PolicyRule, ctx: PolicyContext): string {
    const parts: string[] = [`Rule '${rule.name}'`];

    if (rule.minTrustScore !== undefined || rule.maxTrustScore !== undefined) {
      parts.push(`trust=${ctx.trustScore}`);
    }
    if (rule.actionRisk) {
      parts.push(`risk=${ctx.actionRisk}`);
    }
    if (ctx.value !== undefined && (rule.minValue !== undefined || rule.maxValue !== undefined)) {
      parts.push(`value=${ctx.value}`);
    }

    return parts.join(', ');
  }

  /**
   * Get tier requirements for an action
   * Convenience method for common use case
   */
  getRequiredTier(trustScore: number, actionRisk: ActionRisk, value?: bigint): ConfirmationTier {
    return this.evaluate({ trustScore, actionRisk, value }).requiredTier;
  }

  /**
   * Validate a custom policy
   */
  static validatePolicy(policy: TrustPolicy): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!policy.name) {
      errors.push('Policy must have a name');
    }

    if (!policy.thresholds) {
      errors.push('Policy must have thresholds');
    } else {
      if (policy.thresholds.instantAccept <= policy.thresholds.softConfirm) {
        errors.push('instantAccept must be > softConfirm');
      }
      if (policy.thresholds.softConfirm <= policy.thresholds.hardConfirm) {
        errors.push('softConfirm must be > hardConfirm');
      }
    }

    if (!policy.kDepth) {
      errors.push('Policy must have kDepth config');
    } else {
      if (policy.kDepth.highTrust >= policy.kDepth.default) {
        errors.push('kDepth.highTrust should be < kDepth.default');
      }
      if (policy.kDepth.default >= policy.kDepth.lowTrust) {
        errors.push('kDepth.default should be < kDepth.lowTrust');
      }
    }

    for (const rule of policy.rules || []) {
      if (!rule.name) {
        errors.push('Each rule must have a name');
      }
      if (rule.requiredTier === undefined) {
        errors.push(`Rule '${rule.name}' must have requiredTier`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Load policy from JSON
   */
  static fromJSON(json: unknown): TrustPolicy {
    const obj = json as Record<string, unknown>;

    // Convert bigint strings in valueThresholds
    if (obj.valueThresholds) {
      const vt = obj.valueThresholds as Record<string, unknown>;
      if (typeof vt.low === 'string') vt.low = BigInt(vt.low);
      if (typeof vt.medium === 'string') vt.medium = BigInt(vt.medium);
    }

    // Convert bigint strings in rules
    if (Array.isArray(obj.rules)) {
      for (const rule of obj.rules) {
        if (typeof rule.minValue === 'string') rule.minValue = BigInt(rule.minValue);
        if (typeof rule.maxValue === 'string') rule.maxValue = BigInt(rule.maxValue);
      }
    }

    const policy = obj as unknown as TrustPolicy;
    const validation = PolicyEngine.validatePolicy(policy);

    if (!validation.valid) {
      throw new Error(`Invalid policy: ${validation.errors.join('; ')}`);
    }

    return policy;
  }
}
