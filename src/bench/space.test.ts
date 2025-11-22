/**
 * Space Estimation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  estimateTokenSize,
  estimateVarSize,
  analyzeBloat,
  formatBytes,
  formatSpaceReport,
  TokenSizeEstimate,
  VarSizeEstimate,
} from './space';

describe('Space Estimation', () => {
  describe('Token Size Estimation', () => {
    it('should estimate FT token size', () => {
      const estimate = estimateTokenSize({
        type: 'FT',
        holderCount: 100,
        allowanceCount: 20,
      });

      expect(estimate.totalBytes).toBeGreaterThan(0);
      expect(estimate.breakdown.tokenRecord).toBeGreaterThan(0);
      expect(estimate.breakdown.balanceRecords).toBeGreaterThan(0);
      expect(estimate.breakdown.allowanceRecords).toBeGreaterThan(0);
      expect(estimate.monthlyCostEstimate).toBeGreaterThan(0);
    });

    it('should estimate NFT collection size', () => {
      const estimate = estimateTokenSize({
        type: 'NFT',
        holderCount: 50,
        instanceCount: 100,
        avgMetadataSize: 512,
      });

      expect(estimate.totalBytes).toBeGreaterThan(0);
      expect(estimate.breakdown.instanceRecords).toBeGreaterThan(0);
      expect(estimate.breakdown.balanceRecords).toBe(0); // NFT doesn't use balance
    });

    it('should estimate SFT collection size', () => {
      const estimate = estimateTokenSize({
        type: 'SFT',
        holderCount: 200,
        classCount: 10,
      });

      expect(estimate.totalBytes).toBeGreaterThan(0);
      expect(estimate.breakdown.classRecords).toBeGreaterThan(0);
      expect(estimate.breakdown.balanceRecords).toBeGreaterThan(0);
    });

    it('should scale with holder count', () => {
      const small = estimateTokenSize({
        type: 'FT',
        holderCount: 10,
      });

      const large = estimateTokenSize({
        type: 'FT',
        holderCount: 1000,
      });

      expect(large.totalBytes).toBeGreaterThan(small.totalBytes);
      expect(large.breakdown.balanceRecords / small.breakdown.balanceRecords).toBeCloseTo(100, 0);
    });

    it('should scale NFT size with instance count', () => {
      const small = estimateTokenSize({
        type: 'NFT',
        holderCount: 10,
        instanceCount: 10,
      });

      const large = estimateTokenSize({
        type: 'NFT',
        holderCount: 10,
        instanceCount: 1000,
      });

      expect(large.breakdown.instanceRecords! / small.breakdown.instanceRecords!).toBeCloseTo(100, 0);
    });
  });

  describe('Variable Size Estimation', () => {
    it('should estimate variable store size', () => {
      const estimate = estimateVarSize({
        variableCount: 100,
        avgValueSize: 256,
      });

      expect(estimate.totalBytes).toBeGreaterThan(0);
      expect(estimate.breakdown.namespaceACL).toBeGreaterThan(0);
      expect(estimate.breakdown.variableRecords).toBeGreaterThan(0);
      expect(estimate.monthlyCostEstimate).toBeGreaterThan(0);
    });

    it('should scale with variable count', () => {
      const small = estimateVarSize({
        variableCount: 10,
        avgValueSize: 256,
      });

      const large = estimateVarSize({
        variableCount: 1000,
        avgValueSize: 256,
      });

      expect(large.totalBytes).toBeGreaterThan(small.totalBytes);
    });

    it('should scale with value size', () => {
      const small = estimateVarSize({
        variableCount: 100,
        avgValueSize: 64,
      });

      const large = estimateVarSize({
        variableCount: 100,
        avgValueSize: 1024,
      });

      expect(large.breakdown.variableRecords).toBeGreaterThan(small.breakdown.variableRecords);
    });

    it('should account for grants', () => {
      const noGrants = estimateVarSize({
        variableCount: 100,
        avgValueSize: 256,
        grantCount: 0,
      });

      const manyGrants = estimateVarSize({
        variableCount: 100,
        avgValueSize: 256,
        grantCount: 50,
      });

      expect(manyGrants.breakdown.namespaceACL).toBeGreaterThan(noGrants.breakdown.namespaceACL);
    });
  });

  describe('Bloat Analysis', () => {
    it('should analyze current and projected state', () => {
      const analysis = analyzeBloat({
        currentVarCount: 1000,
        currentTokenCount: 10,
        currentHolderCount: 500,
        varGrowthRateDaily: 0.02,
        holderGrowthRateDaily: 0.01,
      });

      expect(analysis.currentSize).toBeGreaterThan(0);
      expect(analysis.projectedSize1Month).toBeGreaterThan(analysis.currentSize);
      expect(analysis.projectedSize1Year).toBeGreaterThan(analysis.projectedSize1Month);
    });

    it('should warn on high growth rate', () => {
      const analysis = analyzeBloat({
        currentVarCount: 1000,
        currentTokenCount: 10,
        currentHolderCount: 500,
        varGrowthRateDaily: 0.15, // 15% per day - very high
        holderGrowthRateDaily: 0.01,
      });

      expect(analysis.warnings.length).toBeGreaterThan(0);
      expect(analysis.warnings.some(w => w.includes('growth rate'))).toBe(true);
    });

    it('should provide recommendations for large state', () => {
      const analysis = analyzeBloat({
        currentVarCount: 100000,
        currentTokenCount: 100,
        currentHolderCount: 50000,
        varGrowthRateDaily: 0.05,
        holderGrowthRateDaily: 0.03,
      });

      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });

    it('should be healthy for small state', () => {
      const analysis = analyzeBloat({
        currentVarCount: 100,
        currentTokenCount: 5,
        currentHolderCount: 50,
        varGrowthRateDaily: 0.01,
        holderGrowthRateDaily: 0.01,
      });

      expect(analysis.warnings.length).toBe(0);
      expect(analysis.recommendations).toContain('State size is within acceptable limits');
    });
  });

  describe('Formatting', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatBytes(1536)).toBe('1.50 KB');
    });

    it('should format space report', () => {
      const tokenEstimate = estimateTokenSize({
        type: 'FT',
        holderCount: 100,
      });

      const varEstimate = estimateVarSize({
        variableCount: 100,
        avgValueSize: 256,
      });

      const report = formatSpaceReport(tokenEstimate, varEstimate);

      expect(report).toContain('SPACE ESTIMATION REPORT');
      expect(report).toContain('Token Storage');
      expect(report).toContain('Variable Storage');
      expect(report).toContain('TOTAL');
      expect(report).toContain('Monthly cost');
    });

    it('should include bloat analysis in report', () => {
      const tokenEstimate = estimateTokenSize({
        type: 'FT',
        holderCount: 100,
      });

      const varEstimate = estimateVarSize({
        variableCount: 100,
        avgValueSize: 256,
      });

      const bloatAnalysis = analyzeBloat({
        currentVarCount: 100,
        currentTokenCount: 5,
        currentHolderCount: 100,
        varGrowthRateDaily: 0.01,
        holderGrowthRateDaily: 0.01,
      });

      const report = formatSpaceReport(tokenEstimate, varEstimate, bloatAnalysis);

      expect(report).toContain('Bloat Analysis');
      expect(report).toContain('Current size');
      expect(report).toContain('Projected');
      expect(report).toContain('Recommendations');
    });
  });
});

describe('Size Estimation Accuracy', () => {
  it('should produce reasonable FT estimates', () => {
    const estimate = estimateTokenSize({
      type: 'FT',
      holderCount: 1000,
      allowanceCount: 100,
    });

    // FT with 1000 holders should be roughly 100KB-500KB
    expect(estimate.totalBytes).toBeGreaterThan(50 * 1024);
    expect(estimate.totalBytes).toBeLessThan(1024 * 1024);
  });

  it('should produce reasonable NFT estimates', () => {
    const estimate = estimateTokenSize({
      type: 'NFT',
      holderCount: 100,
      instanceCount: 10000,
      avgMetadataSize: 1024,
    });

    // 10K NFTs with 1KB metadata should be several MB
    expect(estimate.totalBytes).toBeGreaterThan(1024 * 1024);
    expect(estimate.totalBytes).toBeLessThan(100 * 1024 * 1024);
  });

  it('should produce reasonable variable store estimates', () => {
    const estimate = estimateVarSize({
      variableCount: 10000,
      avgValueSize: 512,
      avgKeyLength: 30,
    });

    // 10K variables at 512B should be several MB
    expect(estimate.totalBytes).toBeGreaterThan(5 * 1024 * 1024);
    expect(estimate.totalBytes).toBeLessThan(50 * 1024 * 1024);
  });
});
