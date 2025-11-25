/**
 * Bridge Provider Registry
 *
 * Manages bridge route registration, discovery, and optimization.
 * Providers register routes they support, users discover best routes.
 */

import {
  BridgeRoute,
  BridgeRequest,
  BridgeProviderStats,
  BridgeRouteMetrics,
  ChainId,
  generateRouteId,
  BRIDGE_CONFIG,
  BridgeProviderRegistration
} from '../../instructions/xchain/types';

/**
 * Route selection criteria
 */
export interface RouteSelectionCriteria {
  /** Prioritize by cost, speed, or reliability */
  priority: 'cost' | 'speed' | 'reliability';

  /** Maximum acceptable fee in basis points */
  maxFeeBps?: number;

  /** Maximum acceptable confirmation time in seconds */
  maxConfirmationTime?: number;

  /** Minimum acceptable trust score (0-1000) */
  minTrustScore?: number;

  /** Exclude specific providers */
  excludeProviders?: string[];

  /** Include only specific providers */
  includeOnlyProviders?: string[];
}

/**
 * Route discovery result
 */
export interface RouteDiscoveryResult {
  route: BridgeRoute;
  provider: BridgeProviderRegistration;
  metrics: BridgeRouteMetrics;
  estimatedTime: number;
  totalCost: bigint;
  confidence: number; // 0-100, based on provider reliability
}

/**
 * Bridge Registry Service
 */
export class BridgeRegistry {
  private routes: Map<string, BridgeRoute> = new Map();
  private providers: Map<string, BridgeProviderRegistration> = new Map();
  private providerStats: Map<string, BridgeProviderStats> = new Map();
  private routeMetrics: Map<string, BridgeRouteMetrics> = new Map();

  /**
   * Register a new bridge route
   */
  async registerRoute(route: BridgeRoute): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate route data
      const validation = this.validateRoute(route);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Check if provider is registered
      if (!this.providers.has(route.provider)) {
        return { success: false, error: 'Provider not registered' };
      }

      // Check for route conflicts
      const existingRoute = this.routes.get(route.routeId);
      if (existingRoute && existingRoute.provider !== route.provider) {
        return { success: false, error: 'Route ID already exists with different provider' };
      }

      // Store route
      this.routes.set(route.routeId, route);

      // Initialize metrics if new route
      if (!this.routeMetrics.has(route.routeId)) {
        this.routeMetrics.set(route.routeId, {
          routeId: route.routeId,
          dailyVolume: 0n,
          weeklyVolume: 0n,
          monthlyVolume: 0n,
          avgTransactionSize: 0n,
          totalTransactions: 0n,
          successRate: 100, // Start optimistic
          avgFulfillmentTime: route.avgConfirmationTime,
          competitorCount: this.getCompetitorCount(route.srcChainId, route.dstChainId, route.srcToken, route.dstToken)
        });
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: `Route registration failed: ${error}` };
    }
  }

  /**
   * Register a bridge provider
   */
  async registerProvider(provider: BridgeProviderRegistration): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate provider data
      const validation = this.validateProvider(provider);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // TODO: Verify minimum stake requirement
      // This would check the provider's account balance on WSTFChain

      // Store provider
      this.providers.set(provider.provider, provider);

      // Initialize stats
      if (!this.providerStats.has(provider.provider)) {
        this.providerStats.set(provider.provider, {
          provider: provider.provider,
          totalRequests: 0n,
          fulfilledRequests: 0n,
          failedRequests: 0n,
          totalVolumeUSD: 0n,
          avgConfirmationTime: 300, // 5 minutes default
          reliabilityScore: 800, // Start with good score
          lastActiveAt: BigInt(Date.now())
        });
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: `Provider registration failed: ${error}` };
    }
  }

  /**
   * Discover optimal routes for a bridge request
   */
  async discoverRoutes(
    srcChainId: ChainId,
    dstChainId: ChainId,
    srcToken: string,
    dstToken: string,
    amount: bigint,
    criteria: RouteSelectionCriteria = { priority: 'cost' }
  ): Promise<RouteDiscoveryResult[]> {
    const matchingRoutes: RouteDiscoveryResult[] = [];

    for (const [routeId, route] of this.routes) {
      // Check if route matches the request
      if (
        route.srcChainId !== srcChainId ||
        route.dstChainId !== dstChainId ||
        route.srcToken.toLowerCase() !== srcToken.toLowerCase() ||
        route.dstToken.toLowerCase() !== dstToken.toLowerCase()
      ) {
        continue;
      }

      // Check if route is active and supports the amount
      if (!route.isActive || amount < route.minAmount || amount > route.maxAmount) {
        continue;
      }

      // Get provider and check if registered
      const provider = this.providers.get(route.provider);
      if (!provider) {
        continue;
      }

      // Apply criteria filters
      if (criteria.maxFeeBps && route.feeBps > criteria.maxFeeBps) {
        continue;
      }

      if (criteria.maxConfirmationTime && route.avgConfirmationTime > criteria.maxConfirmationTime) {
        continue;
      }

      if (criteria.minTrustScore && route.trustScore < criteria.minTrustScore) {
        continue;
      }

      if (criteria.excludeProviders?.includes(route.provider)) {
        continue;
      }

      if (criteria.includeOnlyProviders && !criteria.includeOnlyProviders.includes(route.provider)) {
        continue;
      }

      // Calculate costs and metrics
      const fee = (amount * BigInt(route.feeBps)) / 10000n;
      const totalCost = fee + route.gasEstimate;

      const metrics = this.routeMetrics.get(routeId) || {
        routeId,
        dailyVolume: 0n,
        weeklyVolume: 0n,
        monthlyVolume: 0n,
        avgTransactionSize: 0n,
        totalTransactions: 0n,
        successRate: 100,
        avgFulfillmentTime: route.avgConfirmationTime,
        competitorCount: 1
      };

      const providerStats = this.providerStats.get(route.provider);
      const confidence = this.calculateConfidence(route, metrics, providerStats);

      matchingRoutes.push({
        route,
        provider,
        metrics,
        estimatedTime: route.avgConfirmationTime,
        totalCost,
        confidence
      });
    }

    // Sort routes based on criteria
    matchingRoutes.sort((a, b) => {
      switch (criteria.priority) {
        case 'cost':
          return Number(a.totalCost - b.totalCost);

        case 'speed':
          return a.estimatedTime - b.estimatedTime;

        case 'reliability':
          return b.confidence - a.confidence;

        default:
          return Number(a.totalCost - b.totalCost);
      }
    });

    return matchingRoutes;
  }

  /**
   * Get all routes for a specific provider
   */
  getProviderRoutes(provider: string): BridgeRoute[] {
    return Array.from(this.routes.values()).filter(route => route.provider === provider);
  }

  /**
   * Get provider statistics
   */
  getProviderStats(provider: string): BridgeProviderStats | undefined {
    return this.providerStats.get(provider);
  }

  /**
   * Get route metrics
   */
  getRouteMetrics(routeId: string): BridgeRouteMetrics | undefined {
    return this.routeMetrics.get(routeId);
  }

  /**
   * Update provider statistics after a bridge completion
   */
  updateProviderStats(
    provider: string,
    success: boolean,
    volumeUSD: bigint,
    confirmationTime: number
  ): void {
    const stats = this.providerStats.get(provider);
    if (!stats) return;

    stats.totalRequests += 1n;
    stats.totalVolumeUSD += volumeUSD;
    stats.lastActiveAt = BigInt(Date.now());

    if (success) {
      stats.fulfilledRequests += 1n;
    } else {
      stats.failedRequests += 1n;
    }

    // Update running averages
    const totalTxns = Number(stats.totalRequests);
    stats.avgConfirmationTime = (
      (stats.avgConfirmationTime * (totalTxns - 1) + confirmationTime) / totalTxns
    );

    // Update reliability score (exponential moving average)
    const successRate = Number(stats.fulfilledRequests) / totalTxns;
    stats.reliabilityScore = Math.floor(
      stats.reliabilityScore * 0.95 + successRate * 1000 * 0.05
    );

    this.providerStats.set(provider, stats);
  }

  /**
   * Update route metrics after a bridge completion
   */
  updateRouteMetrics(
    routeId: string,
    amount: bigint,
    success: boolean,
    fulfillmentTime: number
  ): void {
    const metrics = this.routeMetrics.get(routeId);
    if (!metrics) return;

    metrics.totalTransactions += 1n;

    if (success) {
      // Update volumes (simplified - would need USD conversion)
      metrics.dailyVolume += amount;
      metrics.weeklyVolume += amount;
      metrics.monthlyVolume += amount;

      // Update averages
      const totalTxns = Number(metrics.totalTransactions);
      metrics.avgTransactionSize = (
        (metrics.avgTransactionSize * BigInt(totalTxns - 1) + amount) / BigInt(totalTxns)
      );

      metrics.avgFulfillmentTime = (
        (metrics.avgFulfillmentTime * (totalTxns - 1) + fulfillmentTime) / totalTxns
      );
    }

    // Update success rate - track successful transactions separately
    if (!metrics.successfulTransactions) {
      metrics.successfulTransactions = 0n;
    }

    if (success) {
      metrics.successfulTransactions += 1n;
    }

    // Calculate success rate as percentage
    metrics.successRate = (Number(metrics.successfulTransactions) / Number(metrics.totalTransactions)) * 100;

    this.routeMetrics.set(routeId, metrics);
  }

  /**
   * Validate route data
   */
  private validateRoute(route: BridgeRoute): { valid: boolean; error?: string } {
    if (!route.routeId || !route.provider || !route.srcChainId || !route.dstChainId) {
      return { valid: false, error: 'Missing required route fields' };
    }

    if (route.minAmount >= route.maxAmount) {
      return { valid: false, error: 'Invalid amount constraints' };
    }

    if (route.feeBps > BRIDGE_CONFIG.MAX_FEE_BPS) {
      return { valid: false, error: `Fee exceeds maximum of ${BRIDGE_CONFIG.MAX_FEE_BPS / 100}%` };
    }

    if (route.srcChainId === route.dstChainId) {
      return { valid: false, error: 'Source and destination chains cannot be the same' };
    }

    return { valid: true };
  }

  /**
   * Validate provider data
   */
  private validateProvider(provider: BridgeProviderRegistration): { valid: boolean; error?: string } {
    if (!provider.provider || !provider.name || !provider.supportedChains.length) {
      return { valid: false, error: 'Missing required provider fields' };
    }

    if (provider.slaCommitments.maxConfirmationTime < 30) {
      return { valid: false, error: 'Maximum confirmation time too low (min 30 seconds)' };
    }

    if (provider.slaCommitments.uptimeGuarantee < 50 || provider.slaCommitments.uptimeGuarantee > 100) {
      return { valid: false, error: 'Invalid uptime guarantee (must be 50-100%)' };
    }

    return { valid: true };
  }

  /**
   * Calculate confidence score for a route
   */
  private calculateConfidence(
    route: BridgeRoute,
    metrics: BridgeRouteMetrics,
    providerStats?: BridgeProviderStats
  ): number {
    let confidence = 0;

    // Base confidence from trust score (0-40 points)
    confidence += (route.trustScore / 1000) * 40;

    // Success rate bonus (0-30 points)
    confidence += (metrics.successRate / 100) * 30;

    // Provider reliability (0-20 points)
    if (providerStats) {
      confidence += (providerStats.reliabilityScore / 1000) * 20;
    }

    // Volume bonus - more activity = more confidence (0-10 points)
    const volumeScore = Math.min(Number(metrics.totalTransactions) / 100, 1) * 10;
    confidence += volumeScore;

    return Math.min(confidence, 100);
  }

  /**
   * Count competitors for a route
   */
  private getCompetitorCount(
    srcChainId: ChainId,
    dstChainId: ChainId,
    srcToken: string,
    dstToken: string
  ): number {
    let count = 0;
    for (const route of this.routes.values()) {
      if (
        route.srcChainId === srcChainId &&
        route.dstChainId === dstChainId &&
        route.srcToken.toLowerCase() === srcToken.toLowerCase() &&
        route.dstToken.toLowerCase() === dstToken.toLowerCase()
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get registry statistics
   */
  getRegistryStats(): {
    totalRoutes: number;
    totalProviders: number;
    activeRoutes: number;
    supportedChainPairs: Array<{ src: ChainId; dst: ChainId; routes: number }>;
  } {
    const activeRoutes = Array.from(this.routes.values()).filter(r => r.isActive).length;

    const chainPairs = new Map<string, number>();
    for (const route of this.routes.values()) {
      const key = `${route.srcChainId}->${route.dstChainId}`;
      chainPairs.set(key, (chainPairs.get(key) || 0) + 1);
    }

    const supportedChainPairs = Array.from(chainPairs.entries()).map(([pair, count]) => {
      const [src, dst] = pair.split('->');
      return { src: src as ChainId, dst: dst as ChainId, routes: count };
    });

    return {
      totalRoutes: this.routes.size,
      totalProviders: this.providers.size,
      activeRoutes,
      supportedChainPairs
    };
  }
}

/**
 * Global registry instance
 */
export const bridgeRegistry = new BridgeRegistry();