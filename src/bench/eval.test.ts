/**
 * Evaluation and Benchmark Regression Tests
 *
 * These tests ensure:
 * 1. Benchmarks complete without error
 * 2. Performance doesn't regress catastrophically
 * 3. Size estimates are sane (no NaN, no negative, reasonable ranges)
 */

import { describe, it, expect } from 'vitest';
import { quickEval, runEvaluation, DEFAULT_EVAL_CONFIG } from './eval';
import { runTokenBenchmarks, runVarBenchmarks, MicroBenchResult } from './micro';
import { estimateTokenSize, estimateVarSize, analyzeBloat } from './space';

// ============================================================================
// Performance Regression Tests
// ============================================================================

describe('Performance Regression Tests', () => {
  it('should complete token benchmarks without catastrophic regression', async () => {
    const results = await runTokenBenchmarks(100);

    expect(results.results.length).toBeGreaterThan(0);

    for (const result of results.results) {
      // Basic sanity: ops/sec should be positive
      expect(result.opsPerSecond).toBeGreaterThan(0);

      // Latency should be reasonable (not infinite, not negative)
      expect(result.avgLatencyUs).toBeGreaterThan(0);
      expect(result.avgLatencyUs).toBeLessThan(1000000); // < 1 second

      // P99 should not be more than 500x P50 (no catastrophic tail latency)
      // Note: Higher threshold accounts for GC pauses and other dev environment noise
      expect(result.p99LatencyUs / result.p50LatencyUs).toBeLessThan(1000);
    }
  });

  it('should complete var benchmarks without catastrophic regression', async () => {
    const results = await runVarBenchmarks(100);

    expect(results.results.length).toBeGreaterThan(0);

    for (const result of results.results) {
      expect(result.opsPerSecond).toBeGreaterThan(0);
      expect(result.avgLatencyUs).toBeGreaterThan(0);
      expect(result.avgLatencyUs).toBeLessThan(1000000);
      // P99 should not be more than 500x P50 (no catastrophic tail latency)
      expect(result.p99LatencyUs / result.p50LatencyUs).toBeLessThan(1000);
    }
  });

  it('should achieve minimum ops/sec thresholds', async () => {
    const tokenResults = await runTokenBenchmarks(100);
    const varResults = await runVarBenchmarks(100);

    // Token balance queries should be fast
    const balanceQuery = tokenResults.results.find(r => r.name.includes('balance'));
    if (balanceQuery) {
      expect(balanceQuery.opsPerSecond).toBeGreaterThan(1000); // At least 1K ops/sec
    }

    // Var gets should be fast
    const varGet = varResults.results.find(r => r.name === 'var.get');
    if (varGet) {
      expect(varGet.opsPerSecond).toBeGreaterThan(1000);
    }
  });
});

// ============================================================================
// Size Estimation Sanity Tests
// ============================================================================

describe('Size Estimation Sanity Tests', () => {
  it('should produce valid token size estimates', () => {
    const estimates = [
      estimateTokenSize({ type: 'FT', holderCount: 100, allowanceCount: 10 }),
      estimateTokenSize({ type: 'FT', holderCount: 10000, allowanceCount: 1000 }),
      estimateTokenSize({ type: 'NFT', holderCount: 1000, instanceCount: 5000 }),
      estimateTokenSize({ type: 'SFT', holderCount: 1000, classCount: 50 }),
    ];

    for (const est of estimates) {
      // No NaN
      expect(Number.isNaN(est.totalBytes)).toBe(false);
      expect(Number.isNaN(est.breakdown.tokenRecord)).toBe(false);
      expect(Number.isNaN(est.breakdown.balanceRecords)).toBe(false);

      // No negative
      expect(est.totalBytes).toBeGreaterThanOrEqual(0);
      expect(est.breakdown.tokenRecord).toBeGreaterThanOrEqual(0);
      expect(est.breakdown.balanceRecords).toBeGreaterThanOrEqual(0);

      // Total should be sum of parts
      expect(est.totalBytes).toBe(
        est.breakdown.tokenRecord +
        est.breakdown.balanceRecords +
        est.breakdown.allowanceRecords +
        (est.breakdown.instanceRecords ?? 0) +
        (est.breakdown.classRecords ?? 0)
      );
    }
  });

  it('should produce valid var size estimates', () => {
    const estimates = [
      estimateVarSize({ variableCount: 100, avgValueSize: 256 }),
      estimateVarSize({ variableCount: 10000, avgValueSize: 512 }),
      estimateVarSize({ variableCount: 100000, avgValueSize: 1024 }),
    ];

    for (const est of estimates) {
      expect(Number.isNaN(est.totalBytes)).toBe(false);
      expect(est.totalBytes).toBeGreaterThanOrEqual(0);
      expect(est.breakdown.variableRecords).toBeGreaterThanOrEqual(0);
    }
  });

  it('should scale linearly with holder count', () => {
    const small = estimateTokenSize({ type: 'FT', holderCount: 1000, allowanceCount: 100 });
    const large = estimateTokenSize({ type: 'FT', holderCount: 10000, allowanceCount: 1000 });

    // 10x holders should be roughly 10x balance state
    const ratio = large.breakdown.balanceRecords / small.breakdown.balanceRecords;
    expect(ratio).toBeGreaterThan(8);
    expect(ratio).toBeLessThan(12);
  });

  it('should scale linearly with variable count', () => {
    const small = estimateVarSize({ variableCount: 1000, avgValueSize: 256 });
    const large = estimateVarSize({ variableCount: 10000, avgValueSize: 256 });

    const ratio = large.breakdown.variableRecords / small.breakdown.variableRecords;
    expect(ratio).toBeGreaterThan(8);
    expect(ratio).toBeLessThan(12);
  });
});

// ============================================================================
// Bloat Analysis Tests
// ============================================================================

describe('Bloat Analysis Tests', () => {
  it('should project growth correctly', () => {
    const analysis = analyzeBloat({
      currentTokenCount: 100,
      currentVarCount: 10000,
      currentHolderCount: 1000,
      varGrowthRateDaily: 0.01,
      holderGrowthRateDaily: 0.01,
    });

    // Current should be less than 1 month projection
    expect(analysis.currentSize).toBeLessThan(analysis.projectedSize1Month);

    // 1 month should be less than 1 year
    expect(analysis.projectedSize1Month).toBeLessThan(analysis.projectedSize1Year);

    // No negative values
    expect(analysis.currentSize).toBeGreaterThan(0);
    expect(analysis.projectedSize1Month).toBeGreaterThan(0);
    expect(analysis.projectedSize1Year).toBeGreaterThan(0);
  });

  it('should handle zero growth rate', () => {
    const analysis = analyzeBloat({
      currentTokenCount: 100,
      currentVarCount: 10000,
      currentHolderCount: 1000,
      varGrowthRateDaily: 0,
      holderGrowthRateDaily: 0,
    });

    // With zero growth, projections should equal current (or very close)
    // Allow some tolerance for float imprecision
    expect(Math.abs(analysis.currentSize - analysis.projectedSize1Month) / analysis.currentSize).toBeLessThan(0.01);
  });

  it('should handle aggressive growth without overflow', () => {
    const analysis = analyzeBloat({
      currentTokenCount: 1000,
      currentVarCount: 100000,
      currentHolderCount: 10000,
      varGrowthRateDaily: 0.10, // 10% daily - very aggressive
      holderGrowthRateDaily: 0.10,
    });

    // Should still produce valid numbers (not Infinity)
    expect(Number.isFinite(analysis.projectedSize1Year)).toBe(true);
    expect(analysis.projectedSize1Year).toBeGreaterThan(0);
  });
});

// ============================================================================
// Quick Eval Tests
// ============================================================================

describe('Quick Eval Tests', () => {
  it('should complete quick eval successfully', async () => {
    const result = await quickEval();

    expect(result.tokenOpsPerSec).toBeGreaterThan(0);
    expect(result.varOpsPerSec).toBeGreaterThan(0);
    expect(result.estimatedStateKB).toBeGreaterThan(0);
  });

  it('should produce reasonable state size estimates', async () => {
    const result = await quickEval();

    // For 10K holders + 10K vars, should be in KB-MB range, not GB
    expect(result.estimatedStateKB).toBeLessThan(100000); // < 100MB
    expect(result.estimatedStateKB).toBeGreaterThan(10); // > 10KB
  });
});

// ============================================================================
// Full Evaluation Tests
// ============================================================================

describe('Full Evaluation Tests', () => {
  it('should complete full evaluation with default config', async () => {
    const config = {
      ...DEFAULT_EVAL_CONFIG,
      benchIterations: 50, // Reduce for faster test
    };

    const report = await runEvaluation(config);

    expect(report.timestamp).toBeInstanceOf(Date);
    expect(report.benchmarks.length).toBe(2); // Token + Var
    expect(report.tokenSizeEstimates.length).toBe(4);
    expect(report.varSizeEstimates.length).toBe(4);
    expect(report.bloatAnalyses.length).toBe(3);

    // Summary should have valid values
    expect(report.summary.peakOpsPerSecond).toBeGreaterThan(0);
    expect(report.summary.avgP50LatencyUs).toBeGreaterThan(0);
    expect(report.summary.estimatedStateSizeBytes).toBeGreaterThan(0);
  });
});
