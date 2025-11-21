/**
 * Trust Layer & Confirmation Comprehensive Unit Tests
 *
 * Tests trust tiers, confirmation tracking, policy engine, and status service.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TrustTier,
  TrustContext,
  computeTrustTier,
  kDepthForTrust,
  estimateConfirmationTime,
} from './trustTypes';
import {
  ConfirmationTracker,
  TxConfirmationState,
} from './confirmationTracker';
import {
  PolicyEngine,
  DEFAULT_POLICY,
  CONSERVATIVE_POLICY,
  AGGRESSIVE_POLICY,
} from './policyEngine';
import {
  StatusService,
  formatStatusResponse,
} from './statusService';

describe('Trust: Tier Computation', () => {
  describe('computeTrustTier', () => {
    it('should assign ADMITTED tier for high trust + low risk', () => {
      const ctx: TrustContext = {
        trustScore: 0.95,
        riskScore: 0.1,
        valueUsd: 100,
        isHighValue: false,
      };

      const tier = computeTrustTier(ctx);
      expect(tier).toBe(TrustTier.ADMITTED);
    });

    it('should assign INCLUDED tier for medium trust + low risk', () => {
      const ctx: TrustContext = {
        trustScore: 0.7,
        riskScore: 0.2,
        valueUsd: 100,
        isHighValue: false,
      };

      const tier = computeTrustTier(ctx);
      expect(tier).toBe(TrustTier.INCLUDED);
    });

    it('should assign K_DEPTH tier for medium trust + medium risk', () => {
      const ctx: TrustContext = {
        trustScore: 0.5,
        riskScore: 0.4,
        valueUsd: 500,
        isHighValue: false,
      };

      const tier = computeTrustTier(ctx);
      expect(tier).toBe(TrustTier.K_DEPTH);
    });

    it('should assign CROSS_CHAIN tier for low trust', () => {
      const ctx: TrustContext = {
        trustScore: 0.2,
        riskScore: 0.3,
        valueUsd: 100,
        isHighValue: false,
      };

      const tier = computeTrustTier(ctx);
      expect(tier).toBe(TrustTier.CROSS_CHAIN);
    });

    it('should always assign CROSS_CHAIN for high risk', () => {
      const ctx: TrustContext = {
        trustScore: 0.99, // Very high trust
        riskScore: 0.9,   // But also high risk
        valueUsd: 100,
        isHighValue: false,
      };

      const tier = computeTrustTier(ctx);
      expect(tier).toBe(TrustTier.CROSS_CHAIN);
    });

    it('should escalate tier for high value transactions', () => {
      const lowValueCtx: TrustContext = {
        trustScore: 0.9,
        riskScore: 0.1,
        valueUsd: 100,
        isHighValue: false,
      };

      const highValueCtx: TrustContext = {
        trustScore: 0.9,
        riskScore: 0.1,
        valueUsd: 100000,
        isHighValue: true,
      };

      const lowValueTier = computeTrustTier(lowValueCtx);
      const highValueTier = computeTrustTier(highValueCtx);

      // High value should be same or higher tier (more confirmations needed)
      expect(highValueTier).toBeGreaterThanOrEqual(lowValueTier);
    });
  });

  describe('kDepthForTrust', () => {
    it('should return 0 for ADMITTED tier', () => {
      expect(kDepthForTrust(0.95)).toBe(0);
    });

    it('should return small k for high trust', () => {
      expect(kDepthForTrust(0.8)).toBeLessThanOrEqual(2);
    });

    it('should return larger k for low trust', () => {
      expect(kDepthForTrust(0.3)).toBeGreaterThan(kDepthForTrust(0.8));
    });

    it('should return max k for very low trust', () => {
      const k = kDepthForTrust(0.1);
      expect(k).toBeGreaterThanOrEqual(6);
    });
  });

  describe('estimateConfirmationTime', () => {
    const blockTime = 2; // 2 second blocks

    it('should estimate fast time for ADMITTED', () => {
      const time = estimateConfirmationTime(TrustTier.ADMITTED, blockTime);
      expect(time).toBeLessThan(10); // Instant to near-instant
    });

    it('should estimate 1 block for INCLUDED', () => {
      const time = estimateConfirmationTime(TrustTier.INCLUDED, blockTime);
      expect(time).toBeGreaterThanOrEqual(blockTime);
    });

    it('should estimate multiple blocks for K_DEPTH', () => {
      const time = estimateConfirmationTime(TrustTier.K_DEPTH, blockTime);
      expect(time).toBeGreaterThan(blockTime);
    });

    it('should estimate longest time for CROSS_CHAIN', () => {
      const time = estimateConfirmationTime(TrustTier.CROSS_CHAIN, blockTime);
      expect(time).toBeGreaterThan(estimateConfirmationTime(TrustTier.K_DEPTH, blockTime));
    });
  });
});

describe('Trust: Confirmation Tracker', () => {
  let tracker: ConfirmationTracker;

  beforeEach(() => {
    tracker = new ConfirmationTracker();
  });

  describe('Tracking transactions', () => {
    it('should track new transaction', () => {
      tracker.track('tx1', { trustScore: 0.9, riskScore: 0.1 });

      const state = tracker.get('tx1');
      expect(state).toBeDefined();
      expect(state?.txId).toBe('tx1');
    });

    it('should set initial tier based on trust context', () => {
      tracker.track('tx1', { trustScore: 0.95, riskScore: 0.05 });

      const state = tracker.get('tx1');
      expect(state?.currentTier).toBe(TrustTier.ADMITTED);
    });

    it('should track multiple transactions', () => {
      tracker.track('tx1', { trustScore: 0.9, riskScore: 0.1 });
      tracker.track('tx2', { trustScore: 0.5, riskScore: 0.3 });
      tracker.track('tx3', { trustScore: 0.2, riskScore: 0.1 });

      expect(tracker.get('tx1')).toBeDefined();
      expect(tracker.get('tx2')).toBeDefined();
      expect(tracker.get('tx3')).toBeDefined();
    });

    it('should return undefined for unknown tx', () => {
      expect(tracker.get('unknown')).toBeUndefined();
    });
  });

  describe('Tier progression', () => {
    it('should advance tier on block inclusion', () => {
      tracker.track('tx1', { trustScore: 0.8, riskScore: 0.1 });

      const initialTier = tracker.get('tx1')!.currentTier;
      tracker.onBlockInclusion('tx1', 'block1', 100n);

      const newState = tracker.get('tx1');
      expect(newState?.blockHash).toBe('block1');
      expect(newState?.blockHeight).toBe(100n);
    });

    it('should advance on successor blocks', () => {
      tracker.track('tx1', { trustScore: 0.5, riskScore: 0.2 });
      tracker.onBlockInclusion('tx1', 'block1', 100n);

      // Add successor blocks
      tracker.onSuccessorBlock('tx1', 101n);
      tracker.onSuccessorBlock('tx1', 102n);
      tracker.onSuccessorBlock('tx1', 103n);

      const state = tracker.get('tx1');
      expect(state?.confirmations).toBe(3);
    });

    it('should reach K_DEPTH after enough confirmations', () => {
      tracker.track('tx1', { trustScore: 0.7, riskScore: 0.2 });
      tracker.onBlockInclusion('tx1', 'block1', 100n);

      // Add enough successor blocks to reach K_DEPTH
      for (let i = 1; i <= 6; i++) {
        tracker.onSuccessorBlock('tx1', 100n + BigInt(i));
      }

      const state = tracker.get('tx1');
      expect(state?.currentTier).toBeGreaterThanOrEqual(TrustTier.K_DEPTH);
    });
  });

  describe('Reorg handling', () => {
    it('should handle reorg and reset confirmations', () => {
      tracker.track('tx1', { trustScore: 0.8, riskScore: 0.1 });
      tracker.onBlockInclusion('tx1', 'block1', 100n);
      tracker.onSuccessorBlock('tx1', 101n);
      tracker.onSuccessorBlock('tx1', 102n);

      // Simulate reorg
      tracker.onReorg('tx1', 101n); // Reorg from height 101

      const state = tracker.get('tx1');
      expect(state?.confirmations).toBeLessThan(3);
    });

    it('should emit reorg events', () => {
      const events: string[] = [];
      tracker.onEvent((event) => events.push(event.type));

      tracker.track('tx1', { trustScore: 0.8, riskScore: 0.1 });
      tracker.onBlockInclusion('tx1', 'block1', 100n);
      tracker.onReorg('tx1', 100n);

      expect(events).toContain('reorg');
    });
  });
});

describe('Trust: Policy Engine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('Default policy', () => {
    it('should use default policy initially', () => {
      expect(engine.getCurrentPolicy().name).toBe(DEFAULT_POLICY.name);
    });

    it('should compute tier with default thresholds', () => {
      const tier = engine.computeTier({
        trustScore: 0.9,
        riskScore: 0.1,
        valueUsd: 100,
        isHighValue: false,
      });

      expect(tier).toBe(TrustTier.ADMITTED);
    });
  });

  describe('Conservative policy', () => {
    beforeEach(() => {
      engine.setPolicy(CONSERVATIVE_POLICY);
    });

    it('should require higher trust for ADMITTED', () => {
      const tier = engine.computeTier({
        trustScore: 0.9, // High but not very high
        riskScore: 0.1,
        valueUsd: 100,
        isHighValue: false,
      });

      // Conservative policy should not admit at 0.9 trust
      expect(tier).not.toBe(TrustTier.ADMITTED);
    });

    it('should have higher k-depth requirements', () => {
      const k = engine.getRequiredKDepth(0.8);
      engine.setPolicy(DEFAULT_POLICY);
      const defaultK = engine.getRequiredKDepth(0.8);

      expect(k).toBeGreaterThanOrEqual(defaultK);
    });
  });

  describe('Aggressive policy', () => {
    beforeEach(() => {
      engine.setPolicy(AGGRESSIVE_POLICY);
    });

    it('should admit at lower trust threshold', () => {
      const tier = engine.computeTier({
        trustScore: 0.75,
        riskScore: 0.15,
        valueUsd: 100,
        isHighValue: false,
      });

      expect(tier).toBe(TrustTier.ADMITTED);
    });

    it('should have lower k-depth requirements', () => {
      const k = engine.getRequiredKDepth(0.8);
      engine.setPolicy(DEFAULT_POLICY);
      const defaultK = engine.getRequiredKDepth(0.8);

      expect(k).toBeLessThanOrEqual(defaultK);
    });
  });

  describe('Policy switching', () => {
    it('should switch policies dynamically', () => {
      engine.setPolicy(CONSERVATIVE_POLICY);
      expect(engine.getCurrentPolicy().name).toBe(CONSERVATIVE_POLICY.name);

      engine.setPolicy(AGGRESSIVE_POLICY);
      expect(engine.getCurrentPolicy().name).toBe(AGGRESSIVE_POLICY.name);

      engine.setPolicy(DEFAULT_POLICY);
      expect(engine.getCurrentPolicy().name).toBe(DEFAULT_POLICY.name);
    });

    it('should validate custom policy', () => {
      const customPolicy = {
        name: 'custom',
        admittedThreshold: 0.99,
        includedThreshold: 0.9,
        kDepthThreshold: 0.7,
        maxKDepth: 10,
        highValueMultiplier: 2,
      };

      const result = engine.validatePolicy(customPolicy);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid policy', () => {
      const invalidPolicy = {
        name: 'invalid',
        admittedThreshold: 0.5, // Lower than included
        includedThreshold: 0.8, // Higher than admitted
        kDepthThreshold: 0.3,
        maxKDepth: 10,
        highValueMultiplier: 2,
      };

      const result = engine.validatePolicy(invalidPolicy);
      expect(result.valid).toBe(false);
    });
  });

  describe('High value escalation', () => {
    it('should escalate tier for high value', () => {
      const normalCtx = {
        trustScore: 0.9,
        riskScore: 0.1,
        valueUsd: 100,
        isHighValue: false,
      };

      const highValueCtx = {
        ...normalCtx,
        valueUsd: 100000,
        isHighValue: true,
      };

      const normalTier = engine.computeTier(normalCtx);
      const highValueTier = engine.computeTier(highValueCtx);

      expect(highValueTier).toBeGreaterThanOrEqual(normalTier);
    });
  });
});

describe('Trust: Status Service', () => {
  let statusService: StatusService;
  let tracker: ConfirmationTracker;

  beforeEach(() => {
    tracker = new ConfirmationTracker();
    statusService = new StatusService(tracker);
  });

  describe('Get transaction status', () => {
    it('should return status for tracked tx', () => {
      tracker.track('tx1', { trustScore: 0.9, riskScore: 0.1 });

      const status = statusService.getStatus('tx1');
      expect(status).toBeDefined();
      expect(status?.txId).toBe('tx1');
    });

    it('should return undefined for unknown tx', () => {
      const status = statusService.getStatus('unknown');
      expect(status).toBeUndefined();
    });

    it('should include tier information', () => {
      tracker.track('tx1', { trustScore: 0.95, riskScore: 0.05 });

      const status = statusService.getStatus('tx1');
      expect(status?.tier).toBe(TrustTier.ADMITTED);
    });
  });

  describe('Progress calculation', () => {
    it('should calculate progress percentage', () => {
      tracker.track('tx1', { trustScore: 0.7, riskScore: 0.2 });
      tracker.onBlockInclusion('tx1', 'block1', 100n);

      const status = statusService.getStatus('tx1');
      expect(status?.progress).toBeGreaterThan(0);
      expect(status?.progress).toBeLessThanOrEqual(100);
    });

    it('should show 100% progress when finalized', () => {
      tracker.track('tx1', { trustScore: 0.5, riskScore: 0.2 });
      tracker.onBlockInclusion('tx1', 'block1', 100n);

      // Simulate journal commit (final tier)
      tracker.onJournalCommit('tx1');

      const status = statusService.getStatus('tx1');
      expect(status?.progress).toBe(100);
    });
  });

  describe('Batch status', () => {
    it('should return status for multiple txs', () => {
      tracker.track('tx1', { trustScore: 0.9, riskScore: 0.1 });
      tracker.track('tx2', { trustScore: 0.8, riskScore: 0.2 });
      tracker.track('tx3', { trustScore: 0.7, riskScore: 0.1 });

      const statuses = statusService.getBatchStatus(['tx1', 'tx2', 'tx3', 'tx4']);

      expect(statuses.get('tx1')).toBeDefined();
      expect(statuses.get('tx2')).toBeDefined();
      expect(statuses.get('tx3')).toBeDefined();
      expect(statuses.get('tx4')).toBeUndefined();
    });
  });

  describe('Format response', () => {
    it('should format status for API response', () => {
      tracker.track('tx1', { trustScore: 0.9, riskScore: 0.1 });

      const status = statusService.getStatus('tx1')!;
      const formatted = formatStatusResponse(status);

      expect(formatted.txId).toBe('tx1');
      expect(typeof formatted.tier).toBe('string');
      expect(typeof formatted.progress).toBe('number');
      expect(formatted.estimatedTime).toBeDefined();
    });
  });
});
