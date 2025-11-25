/**
 * Bridge Registry Tests
 */

import { expect, describe, it, beforeEach } from 'vitest';
import {
  BridgeRegistry,
  RouteSelectionCriteria,
  RouteDiscoveryResult
} from './registry';
import {
  BridgeRoute,
  BridgeProviderRegistration,
  ChainId
} from '../../instructions/xchain/types';

describe('BridgeRegistry', () => {
  let registry: BridgeRegistry;
  let testProvider: BridgeProviderRegistration;
  let testRoute: BridgeRoute;

  beforeEach(() => {
    registry = new BridgeRegistry();

    testProvider = {
      provider: 'gc1234567890abcdef',
      name: 'Test Bridge Provider',
      description: 'Reliable bridge services',
      website: 'https://testbridge.io',
      supportedChains: ['bsc', 'polygon', 'ethereum'],
      minimumStake: 10000n * 1000000n,
      contactInfo: {
        email: 'support@testbridge.io',
        telegram: '@testbridge',
        discord: 'testbridge#1234'
      },
      emergencyContact: 'gc9876543210fedcba',
      slaCommitments: {
        maxConfirmationTime: 300, // 5 minutes
        uptimeGuarantee: 99.5,
        refundPolicy: 'Full refund for failed transactions within 24 hours'
      }
    };

    testRoute = {
      routeId: 'bsc_55d39833_polygon_c2132d05',
      srcChainId: 'bsc',
      srcToken: '0x55d398326f99059fF775485246999027B3197955',
      srcTokenStandard: 'erc20',
      dstChainId: 'polygon',
      dstToken: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      dstTokenStandard: 'erc20',
      provider: 'gc1234567890abcdef',
      providerName: 'Test Bridge Provider',
      minAmount: 100n * 1000000n, // $100
      maxAmount: 100000n * 1000000n, // $100k
      dailyLimit: 1000000n * 1000000n, // $1M
      feeBps: 30, // 0.3%
      gasEstimate: 25n * 1000000000000000n, // 0.025 ETH equivalent
      avgConfirmationTime: 180, // 3 minutes
      requiredConfirmations: 15,
      trustScore: 850,
      isActive: true,
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      version: 1n
    };
  });

  describe('Provider Registration', () => {
    it('should register a valid provider', async () => {
      const result = await registry.registerProvider(testProvider);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject provider with missing required fields', async () => {
      const invalidProvider = { ...testProvider };
      delete (invalidProvider as any).provider;

      const result = await registry.registerProvider(invalidProvider);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required provider fields');
    });

    it('should reject provider with invalid SLA commitments', async () => {
      const invalidProvider = {
        ...testProvider,
        slaCommitments: {
          ...testProvider.slaCommitments,
          maxConfirmationTime: 15 // Too low
        }
      };

      const result = await registry.registerProvider(invalidProvider);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum confirmation time too low');
    });

    it('should initialize provider stats upon registration', async () => {
      await registry.registerProvider(testProvider);

      const stats = registry.getProviderStats(testProvider.provider);
      expect(stats).toBeDefined();
      expect(stats!.totalRequests).toBe(0n);
      expect(stats!.reliabilityScore).toBe(800);
    });
  });

  describe('Route Registration', () => {
    beforeEach(async () => {
      await registry.registerProvider(testProvider);
    });

    it('should register a valid route', async () => {
      const result = await registry.registerRoute(testRoute);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject route from unregistered provider', async () => {
      const routeFromUnknownProvider = {
        ...testRoute,
        provider: 'gc_unknown_provider'
      };

      const result = await registry.registerRoute(routeFromUnknownProvider);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Provider not registered');
    });

    it('should reject route with invalid constraints', async () => {
      const invalidRoute = {
        ...testRoute,
        minAmount: 1000n * 1000000n,
        maxAmount: 500n * 1000000n // Max < Min
      };

      const result = await registry.registerRoute(invalidRoute);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid amount constraints');
    });

    it('should reject route with excessive fees', async () => {
      const highFeeRoute = {
        ...testRoute,
        feeBps: 1500 // 15% - above MAX_FEE_BPS
      };

      const result = await registry.registerRoute(highFeeRoute);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Fee exceeds maximum');
    });

    it('should reject route with same source and destination', async () => {
      const sameChainRoute = {
        ...testRoute,
        dstChainId: testRoute.srcChainId
      };

      const result = await registry.registerRoute(sameChainRoute);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Source and destination chains cannot be the same');
    });

    it('should initialize route metrics upon registration', async () => {
      await registry.registerRoute(testRoute);

      const metrics = registry.getRouteMetrics(testRoute.routeId);
      expect(metrics).toBeDefined();
      expect(metrics!.totalTransactions).toBe(0n);
      expect(metrics!.successRate).toBe(100);
    });
  });

  describe('Route Discovery', () => {
    beforeEach(async () => {
      await registry.registerProvider(testProvider);
      await registry.registerRoute(testRoute);
    });

    it('should discover matching routes', async () => {
      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        1000n * 1000000n // $1000
      );

      expect(routes).toHaveLength(1);
      expect(routes[0].route.routeId).toBe(testRoute.routeId);
    });

    it('should not return routes for wrong amount', async () => {
      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        50n * 1000000n // $50 - below minimum
      );

      expect(routes).toHaveLength(0);
    });

    it('should filter by fee criteria', async () => {
      const criteria: RouteSelectionCriteria = {
        priority: 'cost',
        maxFeeBps: 25 // Lower than route's 30 bps
      };

      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        1000n * 1000000n,
        criteria
      );

      expect(routes).toHaveLength(0);
    });

    it('should filter by confirmation time', async () => {
      const criteria: RouteSelectionCriteria = {
        priority: 'speed',
        maxConfirmationTime: 120 // Lower than route's 180s
      };

      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        1000n * 1000000n,
        criteria
      );

      expect(routes).toHaveLength(0);
    });

    it('should filter by trust score', async () => {
      const criteria: RouteSelectionCriteria = {
        priority: 'reliability',
        minTrustScore: 900 // Higher than route's 850
      };

      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        1000n * 1000000n,
        criteria
      );

      expect(routes).toHaveLength(0);
    });

    it('should exclude providers', async () => {
      const criteria: RouteSelectionCriteria = {
        priority: 'cost',
        excludeProviders: [testRoute.provider]
      };

      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        1000n * 1000000n,
        criteria
      );

      expect(routes).toHaveLength(0);
    });

    it('should calculate total costs correctly', async () => {
      const amount = 1000n * 1000000n; // $1000
      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        amount
      );

      const expectedFee = (amount * BigInt(testRoute.feeBps)) / 10000n;
      const expectedTotalCost = expectedFee + testRoute.gasEstimate;

      expect(routes[0].totalCost).toBe(expectedTotalCost);
    });
  });

  describe('Multiple Routes and Sorting', () => {
    let testRoute2: BridgeRoute;

    beforeEach(async () => {
      await registry.registerProvider(testProvider);
      await registry.registerRoute(testRoute);

      // Create second route with different characteristics
      testRoute2 = {
        ...testRoute,
        routeId: 'bsc_55d39833_polygon_c2132d05_v2',
        feeBps: 50, // Higher fee
        avgConfirmationTime: 120, // Faster
        trustScore: 900, // More trusted
        gasEstimate: 20n * 1000000000000000n // Lower gas
      };
      await registry.registerRoute(testRoute2);
    });

    it('should sort by cost (lowest first)', async () => {
      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        1000n * 1000000n,
        { priority: 'cost' }
      );

      expect(routes).toHaveLength(2);
      expect(routes[0].totalCost).toBeLessThanOrEqual(routes[1].totalCost);
    });

    it('should sort by speed (fastest first)', async () => {
      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        1000n * 1000000n,
        { priority: 'speed' }
      );

      expect(routes).toHaveLength(2);
      expect(routes[0].estimatedTime).toBeLessThanOrEqual(routes[1].estimatedTime);
    });

    it('should sort by reliability (most reliable first)', async () => {
      const routes = await registry.discoverRoutes(
        'bsc',
        'polygon',
        testRoute.srcToken,
        testRoute.dstToken,
        1000n * 1000000n,
        { priority: 'reliability' }
      );

      expect(routes).toHaveLength(2);
      expect(routes[0].confidence).toBeGreaterThanOrEqual(routes[1].confidence);
    });
  });

  describe('Statistics Updates', () => {
    beforeEach(async () => {
      await registry.registerProvider(testProvider);
      await registry.registerRoute(testRoute);
    });

    it('should update provider stats after successful bridge', () => {
      registry.updateProviderStats(
        testProvider.provider,
        true, // success
        1000n * 1000000n, // $1000 volume
        150 // 2.5 minutes confirmation time
      );

      const stats = registry.getProviderStats(testProvider.provider);
      expect(stats!.totalRequests).toBe(1n);
      expect(stats!.fulfilledRequests).toBe(1n);
      expect(stats!.failedRequests).toBe(0n);
      expect(stats!.totalVolumeUSD).toBe(1000n * 1000000n);
    });

    it('should update provider stats after failed bridge', () => {
      registry.updateProviderStats(
        testProvider.provider,
        false, // failed
        0n, // no volume for failed transaction
        0 // no confirmation time
      );

      const stats = registry.getProviderStats(testProvider.provider);
      expect(stats!.totalRequests).toBe(1n);
      expect(stats!.fulfilledRequests).toBe(0n);
      expect(stats!.failedRequests).toBe(1n);
      expect(stats!.reliabilityScore).toBeLessThan(800); // Should decrease
    });

    it('should update route metrics after successful bridge', () => {
      const amount = 1000n * 1000000n;

      registry.updateRouteMetrics(
        testRoute.routeId,
        amount,
        true, // success
        150 // fulfillment time
      );

      const metrics = registry.getRouteMetrics(testRoute.routeId);
      expect(metrics!.totalTransactions).toBe(1n);
      expect(metrics!.dailyVolume).toBe(amount);
      expect(metrics!.avgTransactionSize).toBe(amount);
      expect(metrics!.successRate).toBe(100);
    });

    it('should track average confirmation times', () => {
      // Add multiple confirmations with different times
      registry.updateProviderStats(testProvider.provider, true, 100n * 1000000n, 120);
      registry.updateProviderStats(testProvider.provider, true, 100n * 1000000n, 180);
      registry.updateProviderStats(testProvider.provider, true, 100n * 1000000n, 240);

      const stats = registry.getProviderStats(testProvider.provider);
      const expectedAvg = (120 + 180 + 240) / 3;
      expect(Math.abs(stats!.avgConfirmationTime - expectedAvg)).toBeLessThan(1);
    });
  });

  describe('Registry Statistics', () => {
    beforeEach(async () => {
      await registry.registerProvider(testProvider);
      await registry.registerRoute(testRoute);
    });

    it('should provide accurate registry stats', () => {
      const stats = registry.getRegistryStats();

      expect(stats.totalRoutes).toBe(1);
      expect(stats.totalProviders).toBe(1);
      expect(stats.activeRoutes).toBe(1);
      expect(stats.supportedChainPairs).toContainEqual({
        src: 'bsc',
        dst: 'polygon',
        routes: 1
      });
    });

    it('should track inactive routes separately', async () => {
      const inactiveRoute = { ...testRoute, routeId: 'inactive_route', isActive: false };
      await registry.registerRoute(inactiveRoute);

      const stats = registry.getRegistryStats();
      expect(stats.totalRoutes).toBe(2);
      expect(stats.activeRoutes).toBe(1); // Only one active
    });
  });
});