/**
 * Bridge Module Types for SDK 1.0
 *
 * Enhanced bridge types for the production-ready SDK surface.
 */

import type { ChainId } from '../types';

/**
 * Bridge provider information
 */
export interface BridgeProvider {
  /** Unique provider identifier */
  id: string;             // "provider:gc1..."

  /** WSTF address of the provider */
  address: string;        // WSTF address

  /** Provider display name */
  name: string;

  /** Provider website URL */
  url?: string;

  /** Provider description */
  description?: string;

  /** Trust/reputation score (0-1000) */
  trustScore: number;

  /** Total volume handled in USD */
  totalVolumeUsd: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Average latency in seconds */
  avgLatencySec: number;

  /** Supported chains */
  supportedChains: ChainId[];

  /** Minimum stake amount */
  minimumStake: bigint;

  /** SLA commitments */
  slaCommitments: {
    maxConfirmationTime: number;  // seconds
    uptimeGuarantee: number;      // percentage
    refundPolicy: string;
  };

  /** Contact information */
  contactInfo: {
    email?: string;
    discord?: string;
    telegram?: string;
  };

  /** Provider status */
  isActive: boolean;

  /** Registration timestamp */
  createdAt: bigint;

  /** Last update timestamp */
  updatedAt: bigint;
}

/**
 * Bridge route information
 */
export interface BridgeRoute {
  /** Unique route identifier */
  routeId: string;        // "bsc:usdt->polygon:usdt#providerId"

  /** Provider identifier */
  providerId: string;

  /** Provider display name */
  providerName: string;

  /** Source chain */
  srcChain: ChainId;

  /** Destination chain */
  dstChain: ChainId;

  /** Source token contract/identifier */
  srcToken: string;

  /** Destination token contract/identifier */
  dstToken: string;

  /** Source token standard */
  srcTokenStandard: 'erc20' | 'erc721' | 'erc1155' | 'native' | 'spl';

  /** Destination token standard */
  dstTokenStandard: 'erc20' | 'erc721' | 'erc1155' | 'native' | 'spl';

  /** Minimum bridge amount */
  minAmount: bigint;

  /** Maximum bridge amount */
  maxAmount: bigint;

  /** Daily volume limit */
  dailyLimit: bigint;

  /** Fee in basis points (1 = 0.01%) */
  feeBps: number;

  /** Gas estimate for source chain */
  gasEstimate: bigint;

  /** Estimated completion time in seconds */
  estimatedTimeSec: number;

  /** Average confirmation time */
  avgConfirmationTime: number;

  /** Required confirmations */
  requiredConfirmations: number;

  /** Trust score for this route */
  trustScore: number;

  /** Route status */
  isActive: boolean;

  /** Route creation timestamp */
  createdAt: bigint;

  /** Last update timestamp */
  updatedAt: bigint;

  /** Route version */
  version: bigint;
}

/**
 * Bridge order status enumeration
 */
export type BridgeOrderStatus =
  | 'PENDING'          // Order created, waiting for source tx
  | 'LOCKED_SRC'       // Source tokens locked
  | 'CONFIRMED_SRC'    // Source transaction confirmed
  | 'SENT_DST'         // Destination transaction sent
  | 'CONFIRMED'        // Bridge completed successfully
  | 'FAILED'           // Bridge failed
  | 'EXPIRED'          // Order expired
  | 'CANCELLED';       // Order cancelled by user

/**
 * Bridge order information
 */
export interface BridgeOrder {
  /** Unique order identifier */
  orderId: string;

  /** Route identifier */
  routeId: string;

  /** Provider identifier */
  providerId: string;

  /** User WSTF address */
  user: string;           // gc...

  /** Source chain */
  srcChain: ChainId;

  /** Destination chain */
  dstChain: ChainId;

  /** Source token */
  srcToken: string;

  /** Destination token */
  dstToken: string;

  /** Source amount */
  srcAmount: bigint;

  /** Minimum destination amount */
  dstMinAmount: bigint;

  /** Actual destination amount (filled when completed) */
  dstAmount?: bigint;

  /** Destination address */
  dstAddress: string;

  /** Order status */
  status: BridgeOrderStatus;

  /** Source transaction hash */
  srcTxHash?: string;

  /** Destination transaction hash */
  dstTxHash?: string;

  /** Fee paid */
  feePaid?: bigint;

  /** Error message (if failed) */
  errorMessage?: string;

  /** Order created at height */
  createdAtHeight: bigint;

  /** Order updated at height */
  updatedAtHeight: bigint;

  /** Order creation timestamp */
  createdAt: number;

  /** Order update timestamp */
  updatedAt: number;

  /** Expiration timestamp */
  expiresAt: number;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Bridge route query parameters
 */
export interface BridgeRouteQuery {
  /** Source chain */
  srcChain: ChainId;

  /** Destination chain */
  dstChain: ChainId;

  /** Token symbol or identifier */
  token: string;          // e.g. "USDT"

  /** Minimum amount filter */
  minAmount?: bigint;

  /** Maximum fee in basis points */
  maxFeeBps?: number;

  /** Maximum time in seconds */
  maxTimeSec?: number;

  /** Minimum trust score */
  minTrustScore?: number;

  /** Preferred provider */
  providerId?: string;
}

/**
 * Bridge quote information
 */
export interface BridgeQuote {
  /** Route used for the quote */
  route: BridgeRoute;

  /** Input amount */
  inputAmount: bigint;

  /** Output amount (after fees) */
  outputAmount: bigint;

  /** Fee amount */
  feeAmount: bigint;

  /** Fee percentage */
  feePercent: number;

  /** Gas cost estimate */
  gasCost: bigint;

  /** Total cost (fees + gas) */
  totalCost: bigint;

  /** Estimated completion time */
  estimatedTime: number;

  /** Price impact */
  priceImpact: number;

  /** Quote expiration */
  expiresAt: number;

  /** Quote ID for tracking */
  quoteId: string;
}

/**
 * Route selection priority
 */
export type RouteSelectionPriority = 'cost' | 'speed' | 'trust' | 'balanced';

/**
 * Bridge statistics
 */
export interface BridgeStats {
  /** Total bridge volume in USD */
  totalVolumeUsd: number;

  /** Total number of bridges */
  totalBridges: number;

  /** Number of active providers */
  activeProviders: number;

  /** Number of active routes */
  activeRoutes: number;

  /** Average completion time */
  avgCompletionTime: number;

  /** Success rate */
  successRate: number;

  /** Volume by chain */
  volumeByChain: Record<ChainId, number>;

  /** Popular token pairs */
  popularTokenPairs: Array<{
    srcChain: ChainId;
    dstChain: ChainId;
    token: string;
    volume: number;
  }>;
}

/**
 * Bridge module interface
 */
export interface BridgeModule {
  // Provider operations
  listProviders(): Promise<BridgeProvider[]>;
  getProvider(id: string): Promise<BridgeProvider | null>;

  // Route operations
  listRoutes(query: BridgeRouteQuery): Promise<BridgeRoute[]>;
  getRoute(routeId: string): Promise<BridgeRoute | null>;
  getQuote(routeId: string, inputAmount: bigint): Promise<BridgeQuote>;

  // Order operations
  openOrder(params: {
    routeId: string;
    userAddress: string;      // gc...
    srcAmount: bigint;
    dstMinAmount?: bigint;
    dstAddress: string;       // dest chain address
    evmSignedSrcTx?: string;  // optional pre-signed EVM tx blob
    metadata?: Record<string, any>;
  }): Promise<{ orderId: string; txId: string }>;

  getOrder(orderId: string): Promise<BridgeOrder | null>;
  listUserOrders(user: string, limit?: number): Promise<BridgeOrder[]>;
  cancelOrder(orderId: string): Promise<{ txId: string }>;

  // Helper functions
  pickBestRoute(
    routes: BridgeRoute[],
    priority: RouteSelectionPriority,
    amount?: bigint
  ): BridgeRoute | null;

  estimateTime(routeId: string): Promise<number>;
  estimateFees(routeId: string, amount: bigint): Promise<{
    bridgeFee: bigint;
    gasFee: bigint;
    totalFee: bigint;
  }>;

  // Statistics and monitoring
  getBridgeStats(): Promise<BridgeStats>;
  getProviderStats(providerId: string): Promise<{
    provider: BridgeProvider;
    stats: {
      last24hVolume: number;
      last24hBridges: number;
      successRate: number;
      avgTime: number;
    };
  }>;
}