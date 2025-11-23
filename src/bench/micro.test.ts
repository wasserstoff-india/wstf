/**
 * Microbenchmark Tests
 *
 * Tests the microbenchmark runner works correctly (runs quick iterations).
 */

import { describe, it, expect } from 'vitest';
import {
  runTokenBenchmarks,
  runVarBenchmarks,
  runMarketBenchmarks,
  runAllMicroBenchmarks,
  formatMicroBenchReport,
  MicroBenchResult,
  MicroBenchSuite,
} from './micro';

describe('Microbenchmarks', () => {
  // Run with small iterations to keep tests fast
  const ITERATIONS = 10;

  describe('Token Benchmarks', () => {
    it('should run token benchmarks', async () => {
      const suite = await runTokenBenchmarks(ITERATIONS);

      expect(suite.name).toBe('Token Operations');
      expect(suite.results.length).toBeGreaterThan(0);
      expect(suite.totalDurationMs).toBeGreaterThan(0);

      for (const result of suite.results) {
        expect(result.operations).toBeGreaterThan(0);
        expect(result.opsPerSecond).toBeGreaterThan(0);
        expect(result.avgLatencyUs).toBeGreaterThanOrEqual(0);
        expect(result.p50LatencyUs).toBeGreaterThanOrEqual(0);
        expect(result.p95LatencyUs).toBeGreaterThanOrEqual(result.p50LatencyUs);
        expect(result.p99LatencyUs).toBeGreaterThanOrEqual(result.p95LatencyUs);
      }
    });

    it('should include expected token operations', async () => {
      const suite = await runTokenBenchmarks(ITERATIONS);
      const names = suite.results.map(r => r.name);

      expect(names).toContain('token.deploy.ft');
      expect(names).toContain('token.deploy.nft');
      expect(names).toContain('token.mint.ft');
      expect(names).toContain('token.mint.nft');
      expect(names).toContain('token.transfer.ft');
      expect(names).toContain('token.balance.ft');
      expect(names).toContain('token.get.info');
    });
  });

  describe('Variable Benchmarks', () => {
    it('should run variable benchmarks', async () => {
      const suite = await runVarBenchmarks(ITERATIONS);

      expect(suite.name).toBe('Variable Store Operations');
      expect(suite.results.length).toBeGreaterThan(0);
      expect(suite.totalDurationMs).toBeGreaterThan(0);

      for (const result of suite.results) {
        expect(result.operations).toBeGreaterThan(0);
        expect(result.opsPerSecond).toBeGreaterThan(0);
      }
    });

    it('should include expected variable operations', async () => {
      const suite = await runVarBenchmarks(ITERATIONS);
      const names = suite.results.map(r => r.name);

      expect(names).toContain('var.namespace.create');
      expect(names).toContain('var.set.small');
      expect(names).toContain('var.set.1kb');
      expect(names).toContain('var.get');
      expect(names).toContain('var.get.miss');
      expect(names).toContain('var.update');
      expect(names).toContain('var.delete');
      expect(names).toContain('var.list.100');
    });
  });

  describe('Market Benchmarks', () => {
    it('should run market benchmarks', async () => {
      const suite = await runMarketBenchmarks(ITERATIONS);

      expect(suite.name).toBe('Market Operations');
      expect(suite.results.length).toBeGreaterThan(0);
      expect(suite.totalDurationMs).toBeGreaterThan(0);

      for (const result of suite.results) {
        expect(result.operations).toBeGreaterThan(0);
        expect(result.opsPerSecond).toBeGreaterThan(0);
      }
    });

    it('should include expected market operations', async () => {
      const suite = await runMarketBenchmarks(ITERATIONS);
      const names = suite.results.map(r => r.name);

      expect(names).toContain('market.create');
      expect(names).toContain('market.order.create');
      expect(names).toContain('market.order.get');
      expect(names).toContain('market.level.set');
      expect(names).toContain('market.level.list.100');
      expect(names).toContain('market.escrow.adjust');
      expect(names).toContain('market.trade.record');
      expect(names).toContain('market.grid.create');
      expect(names).toContain('market.topofbook.set');
    });
  });

  describe('Combined Suite', () => {
    it('should run all benchmarks', async () => {
      const suites = await runAllMicroBenchmarks(ITERATIONS);

      expect(suites.length).toBe(3);
      expect(suites[0].name).toBe('Token Operations');
      expect(suites[1].name).toBe('Variable Store Operations');
      expect(suites[2].name).toBe('Market Operations');
    });
  });

  describe('Report Formatting', () => {
    it('should format report correctly', async () => {
      const suites = await runAllMicroBenchmarks(ITERATIONS);
      const report = formatMicroBenchReport(suites);

      expect(report).toContain('MICROBENCHMARK RESULTS');
      expect(report).toContain('Token Operations');
      expect(report).toContain('Variable Store Operations');
      expect(report).toContain('Market Operations');
      expect(report).toContain('Ops/sec');
      expect(report).toContain('P99');
    });
  });
});

describe('MicroBenchResult Structure', () => {
  it('should have correct result structure', async () => {
    const suite = await runTokenBenchmarks(5);
    const result = suite.results[0];

    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('operations');
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('opsPerSecond');
    expect(result).toHaveProperty('avgLatencyUs');
    expect(result).toHaveProperty('p50LatencyUs');
    expect(result).toHaveProperty('p95LatencyUs');
    expect(result).toHaveProperty('p99LatencyUs');

    expect(typeof result.name).toBe('string');
    expect(typeof result.operations).toBe('number');
    expect(typeof result.durationMs).toBe('number');
    expect(typeof result.opsPerSecond).toBe('number');
    expect(typeof result.avgLatencyUs).toBe('number');
  });
});
