/**
 * Bridge Registry API
 *
 * Express API endpoints for bridge discovery and management.
 * Integrates with the registry and instruction system.
 */

import express, { Request, Response } from 'express';
import { BridgeRegistry, RouteSelectionCriteria } from './registry';
import {
  BridgeRoute,
  BridgeRequest,
  BridgeProviderRegistration,
  ChainId,
  generateRouteId,
  validateBridgeRequest,
  SUPPORTED_CHAINS,
  COMMON_TOKENS
} from '../../instructions/xchain/types';
import {
  compileBridgeRequest,
  compileBridgeRouteRegistration,
  XChainOpcode
} from '../../instructions/xchain/opcodes';

const router = express.Router();

// Global registry instance (in production, this would be injected)
const registry = new BridgeRegistry();

/**
 * GET /bridge/routes/discover
 * Discover optimal routes for a bridge request
 */
router.get('/routes/discover', async (req: Request, res: Response) => {
  try {
    const {
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      amount,
      priority = 'cost',
      maxFeeBps,
      maxConfirmationTime,
      minTrustScore,
      excludeProviders,
      includeOnlyProviders
    } = req.query;

    // Validation
    if (!srcChainId || !dstChainId || !srcToken || !dstToken || !amount) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required parameters: srcChainId, dstChainId, srcToken, dstToken, amount'
      });
    }

    const criteria: RouteSelectionCriteria = {
      priority: priority as 'cost' | 'speed' | 'reliability',
      maxFeeBps: maxFeeBps ? parseInt(maxFeeBps as string) : undefined,
      maxConfirmationTime: maxConfirmationTime ? parseInt(maxConfirmationTime as string) : undefined,
      minTrustScore: minTrustScore ? parseInt(minTrustScore as string) : undefined,
      excludeProviders: excludeProviders ? (excludeProviders as string).split(',') : undefined,
      includeOnlyProviders: includeOnlyProviders ? (includeOnlyProviders as string).split(',') : undefined
    };

    const routes = await registry.discoverRoutes(
      srcChainId as ChainId,
      dstChainId as ChainId,
      srcToken as string,
      dstToken as string,
      BigInt(amount as string),
      criteria
    );

    res.json({
      ok: true,
      routes: routes.map(route => ({
        routeId: route.route.routeId,
        provider: {
          address: route.provider.provider,
          name: route.provider.name,
          website: route.provider.website
        },
        feeBps: route.route.feeBps,
        estimatedTime: route.estimatedTime,
        totalCost: route.totalCost.toString(),
        confidence: route.confidence,
        constraints: {
          minAmount: route.route.minAmount.toString(),
          maxAmount: route.route.maxAmount.toString(),
          dailyLimit: route.route.dailyLimit.toString()
        },
        metrics: {
          totalTransactions: route.metrics.totalTransactions.toString(),
          successRate: route.metrics.successRate,
          avgFulfillmentTime: route.metrics.avgFulfillmentTime
        }
      }))
    });

  } catch (error: unknown) {
    res.status(500).json({
      ok: false,
      error: `Action failed: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * POST /bridge/routes/register
 * Register a new bridge route (for providers)
 */
router.post('/routes/register', async (req: Request, res: Response) => {
  try {
    const routeData = req.body as BridgeRoute;

    // Generate route ID if not provided
    if (!routeData.routeId) {
      routeData.routeId = generateRouteId(
        routeData.srcChainId,
        routeData.srcToken,
        routeData.dstChainId,
        routeData.dstToken
      );
    }

    // Set timestamps
    const now = BigInt(Date.now());
    routeData.createdAt = now;
    routeData.updatedAt = now;
    routeData.version = 1n;

    const result = await registry.registerRoute(routeData);

    if (!result.success) {
      return res.status(400).json({
        ok: false,
        error: result.error
      });
    }

    res.json({
      ok: true,
      routeId: routeData.routeId,
      message: 'Route registered successfully'
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Route registration failed: ${error}`
    });
  }
});

/**
 * POST /bridge/providers/register
 * Register a new bridge provider
 */
router.post('/providers/register', async (req: Request, res: Response) => {
  try {
    const providerData = req.body as BridgeProviderRegistration;

    const result = await registry.registerProvider(providerData);

    if (!result.success) {
      return res.status(400).json({
        ok: false,
        error: result.error
      });
    }

    res.json({
      ok: true,
      provider: providerData.provider,
      message: 'Provider registered successfully'
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Provider registration failed: ${error}`
    });
  }
});

/**
 * GET /bridge/providers/:provider/routes
 * Get all routes for a specific provider
 */
router.get('/providers/:provider/routes', (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const routes = registry.getProviderRoutes(provider);

    res.json({
      ok: true,
      provider,
      routes: routes.map(route => ({
        routeId: route.routeId,
        srcChain: route.srcChainId,
        dstChain: route.dstChainId,
        srcToken: route.srcToken,
        dstToken: route.dstToken,
        feeBps: route.feeBps,
        isActive: route.isActive,
        trustScore: route.trustScore,
        constraints: {
          minAmount: route.minAmount.toString(),
          maxAmount: route.maxAmount.toString(),
          dailyLimit: route.dailyLimit.toString()
        }
      }))
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get provider routes: ${error}`
    });
  }
});

/**
 * GET /bridge/providers/:provider/stats
 * Get provider performance statistics
 */
router.get('/providers/:provider/stats', (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const stats = registry.getProviderStats(provider);

    if (!stats) {
      return res.status(404).json({
        ok: false,
        error: 'Provider not found'
      });
    }

    res.json({
      ok: true,
      provider,
      stats: {
        totalRequests: stats.totalRequests.toString(),
        fulfilledRequests: stats.fulfilledRequests.toString(),
        failedRequests: stats.failedRequests.toString(),
        totalVolumeUSD: stats.totalVolumeUSD.toString(),
        avgConfirmationTime: stats.avgConfirmationTime,
        reliabilityScore: stats.reliabilityScore,
        lastActiveAt: stats.lastActiveAt.toString(),
        successRate: Number(stats.fulfilledRequests) / Number(stats.totalRequests) * 100
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get provider stats: ${error}`
    });
  }
});

/**
 * GET /bridge/routes/:routeId/metrics
 * Get route performance metrics
 */
router.get('/routes/:routeId/metrics', (req: Request, res: Response) => {
  try {
    const { routeId } = req.params;
    const metrics = registry.getRouteMetrics(routeId);

    if (!metrics) {
      return res.status(404).json({
        ok: false,
        error: 'Route not found'
      });
    }

    res.json({
      ok: true,
      routeId,
      metrics: {
        dailyVolume: metrics.dailyVolume.toString(),
        weeklyVolume: metrics.weeklyVolume.toString(),
        monthlyVolume: metrics.monthlyVolume.toString(),
        avgTransactionSize: metrics.avgTransactionSize.toString(),
        totalTransactions: metrics.totalTransactions.toString(),
        successRate: metrics.successRate,
        avgFulfillmentTime: metrics.avgFulfillmentTime,
        competitorCount: metrics.competitorCount
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get route metrics: ${error}`
    });
  }
});

/**
 * GET /bridge/registry/stats
 * Get overall registry statistics
 */
router.get('/registry/stats', (req: Request, res: Response) => {
  try {
    const stats = registry.getRegistryStats();

    res.json({
      ok: true,
      stats
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get registry stats: ${error}`
    });
  }
});

/**
 * GET /bridge/chains/supported
 * Get list of supported chains and their details
 */
router.get('/chains/supported', (req: Request, res: Response) => {
  try {
    res.json({
      ok: true,
      chains: Object.entries(SUPPORTED_CHAINS).map(([id, info]) => ({
        chainId: id,
        name: info.name,
        nativeToken: info.nativeToken,
        blockTime: info.blockTime,
        confirmations: info.confirmations
      }))
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get supported chains: ${error}`
    });
  }
});

/**
 * GET /bridge/tokens/common
 * Get common token addresses across chains
 */
router.get('/tokens/common', (req: Request, res: Response) => {
  try {
    res.json({
      ok: true,
      tokens: COMMON_TOKENS
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get common tokens: ${error}`
    });
  }
});

/**
 * POST /bridge/request/validate
 * Validate a bridge request before submission
 */
router.post('/request/validate', async (req: Request, res: Response) => {
  try {
    const request = req.body as BridgeRequest;

    // Validate basic request structure
    const validation = validateBridgeRequest(request);
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid bridge request',
        details: validation.errors
      });
    }

    // Check if routes exist for this request
    const routes = await registry.discoverRoutes(
      request.srcChainId,
      request.dstChainId,
      request.srcToken,
      request.dstToken,
      request.amount
    );

    if (routes.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'No routes available for this bridge request'
      });
    }

    // Find best route based on user's criteria
    const bestRoute = routes.find(route => route.route.feeBps <= request.maxFeeBps);
    if (!bestRoute) {
      return res.status(400).json({
        ok: false,
        error: 'No routes match your fee requirements'
      });
    }

    res.json({
      ok: true,
      valid: true,
      bestRoute: {
        routeId: bestRoute.route.routeId,
        provider: bestRoute.route.providerName,
        estimatedFee: ((request.amount * BigInt(bestRoute.route.feeBps)) / 10000n).toString(),
        estimatedTime: bestRoute.estimatedTime,
        confidence: bestRoute.confidence
      },
      totalRoutesAvailable: routes.length
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Request validation failed: ${error}`
    });
  }
});

/**
 * POST /bridge/request/compile
 * Compile a high-level bridge request into a binary instruction
 */
router.post('/request/compile', (req: Request, res: Response) => {
  try {
    const request = req.body as BridgeRequest;

    // Validate the request first
    const validation = validateBridgeRequest(request);
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid bridge request',
        details: validation.errors
      });
    }

    // Compile into binary instruction
    const instruction = compileBridgeRequest(request);

    res.json({
      ok: true,
      instruction: {
        opcode: instruction.opcode,
        data: instruction.data,
        sender: instruction.sender,
        timestamp: instruction.timestamp
      },
      instructionBytes: Buffer.from(JSON.stringify(instruction)).length,
      opcodeHex: `0x${instruction.opcode.toString(16).toUpperCase()}`
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Instruction compilation failed: ${error}`
    });
  }
});

// Export the configured router
export default router;

// Export registry for testing
export { registry };