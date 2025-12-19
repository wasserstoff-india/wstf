/**
 * Bridge SDK
 *
 * High-level SDK for interacting with the WSTFChain bridge system.
 * Provides easy-to-use functions for bridge discovery, requests, and monitoring.
 */

import { createClient, WSTFClient } from '../core/client';
import { KeypairSigner } from '../core/signer';
import {
  BridgeRoute,
  BridgeRequest,
  BridgeResult,
  BridgeStatus,
  ChainId,
  generateRequestId,
  validateBridgeRequest,
  BRIDGE_CONFIG
} from '../../../src/instructions/xchain/types';
import {
  compileBridgeRequest,
  compileBridgeRouteRegistration,
  XChainOpcode
} from '../../../src/instructions/xchain/opcodes';
import { RouteSelectionCriteria, RouteDiscoveryResult } from '../../../src/service/bridge-registry/registry';

/**
 * Bridge SDK configuration
 */
export interface BridgeSDKConfig {
  /** WSTF chain RPC URL */
  rpcUrl: string;

  /** Registry API URL (optional, defaults to rpcUrl + '/bridge') */
  registryUrl?: string;

  /** User's signer for transactions */
  signer?: KeypairSigner;

  /** Default timeout for requests (ms) */
  timeout?: number;
}

/**
 * Bridge request options
 */
export interface BridgeRequestOptions {
  /** Destination recipient address */
  dstRecipient: string;

  /** Maximum acceptable fee in basis points */
  maxFeeBps?: number;

  /** Minimum acceptable destination amount */
  minDstAmount?: bigint;

  /** Slippage tolerance in basis points */
  slippageTolerance?: number;

  /** Priority level */
  priorityLevel?: 'standard' | 'fast' | 'instant';

  /** Optional memo */
  memo?: string;

  /** Deadline (auto-calculated if not provided) */
  deadline?: bigint;
}

/**
 * Bridge monitoring options
 */
export interface BridgeMonitoringOptions {
  /** Polling interval in milliseconds */
  pollInterval?: number;

  /** Maximum polling duration */
  maxDuration?: number;

  /** Callback for status updates */
  onStatusUpdate?: (status: BridgeStatus, result?: BridgeResult) => void;

  /** Callback for completion */
  onComplete?: (result: BridgeResult) => void;

  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Main Bridge SDK class
 */
export class BridgeSDK {
  private client: WSTFClient;
  private registryUrl: string;
  private signer?: KeypairSigner;
  private timeout: number;

  constructor(config: BridgeSDKConfig) {
    this.client = createClient({
      rpc: config.rpcUrl,
      signer: config.signer
    });
    this.registryUrl = config.registryUrl || `${config.rpcUrl.replace(/\/+$/, '')}/bridge`;
    this.signer = config.signer;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Set or update the signer
   */
  setSigner(signer: KeypairSigner): void {
    this.signer = signer;
    this.client = createClient({
      rpc: this.client.rpc,
      signer
    });
  }

  // ============================================================================
  // ROUTE DISCOVERY
  // ============================================================================

  /**
   * Discover optimal routes for a bridge request
   */
  async discoverRoutes(
    srcChainId: ChainId,
    dstChainId: ChainId,
    srcToken: string,
    dstToken: string,
    amount: bigint,
    criteria?: RouteSelectionCriteria
  ): Promise<RouteDiscoveryResult[]> {
    const params = new URLSearchParams({
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      amount: amount.toString(),
      ...(criteria?.priority && { priority: criteria.priority }),
      ...(criteria?.maxFeeBps && { maxFeeBps: criteria.maxFeeBps.toString() }),
      ...(criteria?.maxConfirmationTime && { maxConfirmationTime: criteria.maxConfirmationTime.toString() }),
      ...(criteria?.minTrustScore && { minTrustScore: criteria.minTrustScore.toString() }),
      ...(criteria?.excludeProviders && { excludeProviders: criteria.excludeProviders.join(',') }),
      ...(criteria?.includeOnlyProviders && { includeOnlyProviders: criteria.includeOnlyProviders.join(',') })
    });

    const response = await fetch(`${this.registryUrl}/routes/discover?${params}`);

    if (!response.ok) {
      throw new Error(`Route discovery failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    if (!data.ok) {
      throw new Error(data.error);
    }

    return data.routes;
  }

  /**
   * Get the best route for a bridge request
   */
  async getBestRoute(
    srcChainId: ChainId,
    dstChainId: ChainId,
    srcToken: string,
    dstToken: string,
    amount: bigint,
    criteria?: RouteSelectionCriteria
  ): Promise<RouteDiscoveryResult | null> {
    const routes = await this.discoverRoutes(
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      amount,
      criteria
    );

    return routes.length > 0 ? routes[0] : null;
  }

  /**
   * Estimate bridge cost and time
   */
  async estimateBridge(
    srcChainId: ChainId,
    dstChainId: ChainId,
    srcToken: string,
    dstToken: string,
    amount: bigint
  ): Promise<{
    available: boolean;
    estimatedFee: bigint;
    estimatedTime: number;
    confidence: number;
    route?: RouteDiscoveryResult;
  }> {
    try {
      const bestRoute = await this.getBestRoute(
        srcChainId,
        dstChainId,
        srcToken,
        dstToken,
        amount,
        { priority: 'cost' }
      );

      if (!bestRoute) {
        return {
          available: false,
          estimatedFee: 0n,
          estimatedTime: 0,
          confidence: 0
        };
      }

      const fee = (amount * BigInt(bestRoute.route.feeBps)) / 10000n;

      return {
        available: true,
        estimatedFee: fee + bestRoute.route.gasEstimate,
        estimatedTime: bestRoute.estimatedTime,
        confidence: bestRoute.confidence,
        route: bestRoute
      };

    } catch (error) {
      return {
        available: false,
        estimatedFee: 0n,
        estimatedTime: 0,
        confidence: 0
      };
    }
  }

  // ============================================================================
  // BRIDGE REQUESTS
  // ============================================================================

  /**
   * Create and submit a bridge request
   */
  async requestBridge(
    srcChainId: ChainId,
    dstChainId: ChainId,
    srcToken: string,
    dstToken: string,
    amount: bigint,
    options: BridgeRequestOptions
  ): Promise<{
    requestId: string;
    routeId: string;
    txHash: string;
    estimatedTime: number;
  }> {
    if (!this.signer) {
      throw new Error('Signer required for bridge requests');
    }

    // Find best route
    const bestRoute = await this.getBestRoute(
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      amount
    );

    if (!bestRoute) {
      throw new Error('No routes available for this bridge request');
    }

    // Generate request ID
    const clientNonce = BigInt(Date.now() + Math.random() * 1000);
    const deadline = options.deadline || BigInt(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const requestId = generateRequestId(
      this.signer.address,
      bestRoute.route.routeId,
      clientNonce,
      BigInt(Date.now())
    );

    // Create bridge request
    const bridgeRequest: BridgeRequest = {
      requestId,
      routeId: bestRoute.route.routeId,
      client: this.signer.address,
      clientNonce,
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      amount,
      dstRecipient: options.dstRecipient,
      deadline,
      maxFeeBps: options.maxFeeBps || bestRoute.route.feeBps,
      minDstAmount: options.minDstAmount || amount,
      slippageTolerance: options.slippageTolerance || 100, // 1%
      priorityLevel: options.priorityLevel || 'standard',
      memo: options.memo,
      createdAt: BigInt(Date.now()),
      expiresAt: deadline
    };

    // Validate request
    const validation = validateBridgeRequest(bridgeRequest);
    if (!validation.valid) {
      throw new Error(`Invalid bridge request: ${validation.errors.join(', ')}`);
    }

    // Compile to instruction
    const instruction = compileBridgeRequest(bridgeRequest);

    // Submit to WSTF chain
    const txHash = await this.client.submitInstruction(instruction);

    return {
      requestId,
      routeId: bestRoute.route.routeId,
      txHash,
      estimatedTime: bestRoute.estimatedTime
    };
  }

  /**
   * Monitor bridge request status
   */
  async monitorBridgeRequest(
    requestId: string,
    options: BridgeMonitoringOptions = {}
  ): Promise<BridgeResult> {
    return new Promise((resolve, reject) => {
      const pollInterval = options.pollInterval || 5000; // 5 seconds
      const maxDuration = options.maxDuration || 30 * 60 * 1000; // 30 minutes
      const startTime = Date.now();

      const poll = async () => {
        try {
          // Check if we've exceeded max duration
          if (Date.now() - startTime > maxDuration) {
            const error = new Error('Bridge monitoring timeout');
            options.onError?.(error);
            reject(error);
            return;
          }

          // Query bridge status from chain events
          const status = await this.getBridgeStatus(requestId);

          if (status) {
            options.onStatusUpdate?.(status.status, status);

            // Check if completed
            if (['fulfilled', 'failed', 'expired', 'cancelled'].includes(status.status)) {
              options.onComplete?.(status);
              resolve(status);
              return;
            }
          }

          // Continue polling
          setTimeout(poll, pollInterval);

        } catch (error) {
          options.onError?.(error as Error);
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Get bridge request status
   */
  async getBridgeStatus(requestId: string): Promise<BridgeResult | null> {
    try {
      // Query events from WSTF chain
      const events = await this.client.queryEvents({
        module: 'XCHAIN.BRIDGE',
        key: 'BRIDGE_RESULT',
        topics: [requestId]
      });

      if (events.length === 0) {
        return null;
      }

      // Return the latest status
      const latestEvent = events[events.length - 1];
      return latestEvent.data as BridgeResult;

    } catch (error) {
      console.error('Error getting bridge status:', error);
      return null;
    }
  }

  // ============================================================================
  // PROVIDER FUNCTIONS
  // ============================================================================

  /**
   * Register as a bridge provider
   */
  async registerAsProvider(providerInfo: {
    name: string;
    description: string;
    website?: string;
    supportedChains: ChainId[];
    contactInfo: {
      email?: string;
      telegram?: string;
      discord?: string;
    };
    emergencyContact: string;
    slaCommitments: {
      maxConfirmationTime: number;
      uptimeGuarantee: number;
      refundPolicy: string;
    };
  }): Promise<{ success: boolean; txHash?: string }> {
    if (!this.signer) {
      throw new Error('Signer required for provider registration');
    }

    const response = await fetch(`${this.registryUrl}/providers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: this.signer.address,
        minimumStake: BRIDGE_CONFIG.ROUTE_REGISTRATION_STAKE,
        ...providerInfo
      })
    });

    const data = await response.json() as any;
    return data;
  }

  /**
   * Register a bridge route
   */
  async registerRoute(route: Omit<BridgeRoute, 'provider' | 'createdAt' | 'updatedAt' | 'version'>): Promise<{
    success: boolean;
    routeId?: string;
    txHash?: string;
  }> {
    if (!this.signer) {
      throw new Error('Signer required for route registration');
    }

    const fullRoute: BridgeRoute = {
      ...route,
      provider: this.signer.address,
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      version: 1n
    };

    const response = await fetch(`${this.registryUrl}/routes/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullRoute)
    });

    const data = await response.json() as any;
    return data;
  }

  /**
   * Get provider's routes
   */
  async getProviderRoutes(provider?: string): Promise<BridgeRoute[]> {
    const providerAddress = provider || this.signer?.address;
    if (!providerAddress) {
      throw new Error('Provider address required');
    }

    const response = await fetch(`${this.registryUrl}/providers/${providerAddress}/routes`);
    const data = await response.json() as any;

    if (!data.ok) {
      throw new Error(data.error);
    }

    return data.routes;
  }

  /**
   * Get provider statistics
   */
  async getProviderStats(provider?: string): Promise<any> {
    const providerAddress = provider || this.signer?.address;
    if (!providerAddress) {
      throw new Error('Provider address required');
    }

    const response = await fetch(`${this.registryUrl}/providers/${providerAddress}/stats`);
    const data = await response.json() as any;

    if (!data.ok) {
      throw new Error(data.error);
    }

    return data.stats;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Get supported chains
   */
  async getSupportedChains(): Promise<Array<{
    chainId: string;
    name: string;
    nativeToken: string;
    blockTime: number;
    confirmations: number;
  }>> {
    const response = await fetch(`${this.registryUrl}/chains/supported`);
    const data = await response.json() as any;

    if (!data.ok) {
      throw new Error(data.error);
    }

    return data.chains;
  }

  /**
   * Get common token addresses
   */
  async getCommonTokens(): Promise<Record<string, any>> {
    const response = await fetch(`${this.registryUrl}/tokens/common`);
    const data = await response.json() as any;

    if (!data.ok) {
      throw new Error(data.error);
    }

    return data.tokens;
  }

  /**
   * Validate a bridge request before submission
   */
  async validateBridgeRequest(request: BridgeRequest): Promise<{
    valid: boolean;
    errors?: string[];
    bestRoute?: any;
    totalRoutesAvailable?: number;
  }> {
    const response = await fetch(`${this.registryUrl}/request/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    return await response.json() as any;
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats(): Promise<{
    totalRoutes: number;
    totalProviders: number;
    activeRoutes: number;
    supportedChainPairs: Array<{ src: ChainId; dst: ChainId; routes: number }>;
  }> {
    const response = await fetch(`${this.registryUrl}/registry/stats`);
    const data = await response.json() as any;

    if (!data.ok) {
      throw new Error(data.error);
    }

    return data.stats;
  }
}

/**
 * Create a Bridge SDK instance
 */
export function createBridgeSDK(config: BridgeSDKConfig): BridgeSDK {
  return new BridgeSDK(config);
}