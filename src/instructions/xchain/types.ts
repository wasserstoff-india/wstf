/**
 * Cross-Chain Bridge Types
 *
 * Instruction types for chain-of-chains bridging coordination.
 * WSTFChain acts as control plane, bridge runners handle actual EVM operations.
 */

export type ChainId =
  | 'bsc'
  | 'polygon'
  | 'ethereum'
  | 'avalanche'
  | 'arbitrum'
  | 'optimism'
  | 'solana'
  | string;

export type TokenStandard = 'erc20' | 'spl' | 'native';

/**
 * Bridge route registration - defines what a bridge provider supports
 */
export interface BridgeRoute {
  /** Unique route identifier */
  routeId: string;

  /** Source chain information */
  srcChainId: ChainId;
  srcToken: string;        // Contract address or token identifier
  srcTokenStandard: TokenStandard;

  /** Destination chain information */
  dstChainId: ChainId;
  dstToken: string;        // Contract address or token identifier
  dstTokenStandard: TokenStandard;

  /** Bridge provider details */
  provider: string;        // WSTF address (gc...)
  providerName: string;    // Human readable name

  /** Route constraints */
  minAmount: bigint;       // Minimum bridge amount (in token decimals)
  maxAmount: bigint;       // Maximum bridge amount
  dailyLimit: bigint;      // Daily volume limit

  /** Economics */
  feeBps: number;          // Bridge fee in basis points (100 = 1%)
  gasEstimate: bigint;     // Estimated gas cost in dest chain native token

  /** Operational parameters */
  avgConfirmationTime: number;  // Average time in seconds
  requiredConfirmations: number; // Required confirmations on source

  /** Trust and reliability */
  trustScore: number;      // 0-1000, based on history
  isActive: boolean;       // Whether route is currently available

  /** Metadata */
  createdAt: bigint;
  updatedAt: bigint;
  version: bigint;
}

/**
 * Bridge request status
 */
export type BridgeStatus =
  | 'pending'          // Request submitted, waiting for provider
  | 'confirmed'        // Provider confirmed, waiting for source tx
  | 'src_confirmed'    // Source tx confirmed, executing dest tx
  | 'fulfilled'        // Successfully completed
  | 'failed'           // Failed for some reason
  | 'expired'          // Deadline passed
  | 'cancelled';       // Cancelled by user or provider

/**
 * Bridge request - user's intent to bridge tokens
 */
export interface BridgeRequest {
  /** Request identification */
  requestId: string;       // Generated deterministically
  routeId: string;         // Which route to use

  /** User information */
  client: string;          // WSTF address requesting bridge
  clientNonce: bigint;     // User's sequence number for uniqueness

  /** Transfer details */
  srcChainId: ChainId;
  dstChainId: ChainId;
  srcToken: string;
  dstToken: string;
  amount: bigint;          // Amount in source token decimals

  /** Destination */
  dstRecipient: string;    // Destination chain address (0x... or native format)

  /** Execution parameters */
  deadline: bigint;        // WSTF timestamp deadline
  maxFeeBps: number;       // Maximum acceptable fee
  minDstAmount: bigint;    // Minimum acceptable destination amount
  slippageTolerance: number; // Slippage tolerance in basis points

  /** Optional optimization hints */
  srcTxHash?: string;      // If user pre-sent deposit transaction
  priorityLevel: 'standard' | 'fast' | 'instant'; // Speed vs cost preference

  /** Metadata */
  memo?: string;           // Optional user memo
  createdAt: bigint;
  expiresAt: bigint;
}

/**
 * Bridge execution result - provider's report back to chain
 */
export interface BridgeResult {
  /** Identification */
  requestId: string;
  provider: string;        // WSTF address of provider who executed

  /** Execution status */
  status: BridgeStatus;
  reason?: string;         // Error message if failed

  /** Transaction hashes */
  srcTxHash?: string;      // Source chain transaction
  dstTxHash?: string;      // Destination chain transaction

  /** Execution details */
  actualFee?: bigint;      // Actual fee charged (in source token)
  actualDstAmount?: bigint; // Actual amount delivered
  gasUsed?: bigint;        // Gas used on destination

  /** Timing */
  startedAt?: bigint;      // When provider started processing
  completedAt?: bigint;    // When fully completed

  /** Proof data for verification */
  srcBlockNumber?: bigint;
  dstBlockNumber?: bigint;
  srcConfirmations?: number;

  /** Provider specific data */
  providerData?: string;   // Base64 encoded provider-specific data
}

/**
 * Bridge provider statistics
 */
export interface BridgeProviderStats {
  provider: string;
  totalRequests: bigint;
  fulfilledRequests: bigint;
  failedRequests: bigint;
  totalVolumeUSD: bigint;
  avgConfirmationTime: number;
  reliabilityScore: number; // 0-1000
  lastActiveAt: bigint;
}

/**
 * Bridge route metrics
 */
export interface BridgeRouteMetrics {
  routeId: string;
  dailyVolume: bigint;
  weeklyVolume: bigint;
  monthlyVolume: bigint;
  avgTransactionSize: bigint;
  totalTransactions: bigint;
  successfulTransactions?: bigint; // Track successful transactions separately
  successRate: number;      // 0-100 percentage
  avgFulfillmentTime: number; // Seconds
  competitorCount: number;   // Number of providers for this route
}

/**
 * Instruction data structures for the binary IR
 */

/** XCHAIN_BRIDGE_REGISTER_ROUTE instruction data */
export interface RegisterRouteData {
  route: BridgeRoute;
  signature: string;       // Provider signature over route data
}

/** XCHAIN_BRIDGE_UPDATE_ROUTE instruction data */
export interface UpdateRouteData {
  routeId: string;
  updates: Partial<Pick<BridgeRoute,
    | 'minAmount'
    | 'maxAmount'
    | 'feeBps'
    | 'isActive'
    | 'trustScore'
  >>;
  newVersion: bigint;
  signature: string;
}

/** XCHAIN_BRIDGE_REQUEST instruction data */
export interface BridgeRequestData {
  request: BridgeRequest;
  userSignature: string;   // User signature over request
}

/** XCHAIN_BRIDGE_RESULT instruction data */
export interface BridgeResultData {
  result: BridgeResult;
  providerSignature: string; // Provider signature over result
}

/** XCHAIN_BRIDGE_DISPUTE instruction data */
export interface BridgeDisputeData {
  requestId: string;
  disputeType: 'timeout' | 'incorrect_amount' | 'wrong_recipient' | 'no_dest_tx';
  evidence: string;        // Base64 encoded proof data
  requesterSignature: string;
}

/**
 * Event log data for indexing
 */

export interface BridgeRequestEvent {
  requestId: string;
  routeId: string;
  client: string;
  provider: string;
  srcChainId: ChainId;
  dstChainId: ChainId;
  amount: bigint;
  deadline: bigint;
}

export interface BridgeResultEvent {
  requestId: string;
  provider: string;
  status: BridgeStatus;
  srcTxHash?: string;
  dstTxHash?: string;
  actualDstAmount?: bigint;
}

export interface RouteUpdateEvent {
  routeId: string;
  provider: string;
  field: keyof BridgeRoute;
  oldValue: string;
  newValue: string;
}

/**
 * Configuration and constants
 */
export const BRIDGE_CONFIG = {
  /** Maximum bridge amount in USD equivalent */
  MAX_BRIDGE_AMOUNT_USD: 1000000n * 1000000n, // $1M with 6 decimals

  /** Maximum deadline from now (24 hours) */
  MAX_DEADLINE_OFFSET: 24 * 60 * 60 * 1000, // 24 hours in ms

  /** Minimum deadline from now (5 minutes) */
  MIN_DEADLINE_OFFSET: 5 * 60 * 1000, // 5 minutes in ms

  /** Maximum fee in basis points (10%) */
  MAX_FEE_BPS: 1000,

  /** Route registration requires this stake amount */
  ROUTE_REGISTRATION_STAKE: 10000n * 1000000n, // $10k equivalent

  /** Bridge request ID format */
  REQUEST_ID_PREFIX: 'br_',

  /** Route ID format: {srcChain}_{srcToken}_{dstChain}_{dstToken} */
  ROUTE_ID_SEPARATOR: '_',
} as const;

/**
 * Supported chains and their identifiers
 */
export const SUPPORTED_CHAINS: Record<ChainId, {
  name: string;
  chainId: number;
  nativeToken: string;
  blockTime: number; // Average block time in seconds
  confirmations: number; // Required confirmations for finality
}> = {
  'bsc': {
    name: 'Binance Smart Chain',
    chainId: 56,
    nativeToken: 'BNB',
    blockTime: 3,
    confirmations: 15
  },
  'polygon': {
    name: 'Polygon',
    chainId: 137,
    nativeToken: 'MATIC',
    blockTime: 2,
    confirmations: 20
  },
  'ethereum': {
    name: 'Ethereum',
    chainId: 1,
    nativeToken: 'ETH',
    blockTime: 12,
    confirmations: 12
  },
  'avalanche': {
    name: 'Avalanche',
    chainId: 43114,
    nativeToken: 'AVAX',
    blockTime: 2,
    confirmations: 10
  },
  'arbitrum': {
    name: 'Arbitrum One',
    chainId: 42161,
    nativeToken: 'ETH',
    blockTime: 1,
    confirmations: 1
  },
  'optimism': {
    name: 'Optimism',
    chainId: 10,
    nativeToken: 'ETH',
    blockTime: 2,
    confirmations: 1
  }
};

/**
 * Common token addresses across chains
 */
export const COMMON_TOKENS: Record<ChainId, Record<string, {
  address: string;
  decimals: number;
  symbol: string;
}>> = {
  'bsc': {
    'USDT': {
      address: '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
      symbol: 'USDT'
    },
    'USDC': {
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
      symbol: 'USDC'
    }
  },
  'polygon': {
    'USDT': {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
      symbol: 'USDT'
    },
    'USDC': {
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      decimals: 6,
      symbol: 'USDC'
    }
  },
  'ethereum': {
    'USDT': {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      symbol: 'USDT'
    },
    'USDC': {
      address: '0xA0b86a33E6417c69B84f80cAF0A6B9DaE4565D8a',
      decimals: 6,
      symbol: 'USDC'
    }
  }
};

/**
 * Helper functions
 */

export function generateRequestId(
  client: string,
  routeId: string,
  nonce: bigint,
  timestamp: bigint
): string {
  const hash = require('crypto')
    .createHash('sha256')
    .update(client + routeId + nonce.toString() + timestamp.toString())
    .digest('hex');
  return BRIDGE_CONFIG.REQUEST_ID_PREFIX + hash.slice(0, 16);
}

export function generateRouteId(
  srcChainId: ChainId,
  srcToken: string,
  dstChainId: ChainId,
  dstToken: string
): string {
  return [srcChainId, srcToken.slice(0, 8), dstChainId, dstToken.slice(0, 8)]
    .join(BRIDGE_CONFIG.ROUTE_ID_SEPARATOR)
    .toLowerCase();
}

export function validateBridgeRequest(request: BridgeRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (request.amount <= 0) {
    errors.push('Amount must be positive');
  }

  if (request.deadline <= Date.now()) {
    errors.push('Deadline must be in the future');
  }

  if (request.maxFeeBps > BRIDGE_CONFIG.MAX_FEE_BPS) {
    errors.push(`Fee cannot exceed ${BRIDGE_CONFIG.MAX_FEE_BPS / 100}%`);
  }

  if (!request.dstRecipient || request.dstRecipient.length < 10) {
    errors.push('Invalid destination recipient address');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}