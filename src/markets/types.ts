/**
 * Markets Module - Type Definitions
 *
 * Branded types, interfaces, and helpers for the on-chain orderbook system.
 * Follows existing patterns from tokens/types.ts for consistency.
 */

import { TokenId } from '../tokens/types';

// ============================================================================
// Branded Types
// ============================================================================

/** Unique market identifier */
export type MarketId = string & { readonly __brand: 'MarketId' };

/** Unique order identifier */
export type OrderId = string & { readonly __brand: 'OrderId' };

/** Unique liquidity grid identifier */
export type GridId = string & { readonly __brand: 'GridId' };

/** Unique trade identifier */
export type TradeId = string & { readonly __brand: 'TradeId' };

// ============================================================================
// Factory Functions
// ============================================================================

/** Simple hash function for ID generation */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/** Create a MarketId from base and quote token IDs */
export function makeMarketId(baseTokenId: string, quoteTokenId: string): MarketId {
  const raw = `mkt_${simpleHash(`MKT:${baseTokenId}:${quoteTokenId}`)}`;
  return raw as MarketId;
}

/** Create a MarketId from raw string (for deserialization) */
export function makeMarketIdRaw(raw: string): MarketId {
  return raw as MarketId;
}

/** Create an OrderId */
export function makeOrderId(marketId: MarketId, owner: string, nonce: bigint): OrderId {
  const raw = `ord_${simpleHash(`ORD:${marketId}:${owner}:${nonce}`)}`;
  return raw as OrderId;
}

/** Create an OrderId from raw string */
export function makeOrderIdRaw(raw: string): OrderId {
  return raw as OrderId;
}

/** Create a GridId */
export function makeGridId(marketId: MarketId, owner: string, nonce: bigint): GridId {
  const raw = `grid_${simpleHash(`GRID:${marketId}:${owner}:${nonce}`)}`;
  return raw as GridId;
}

/** Create a GridId from raw string */
export function makeGridIdRaw(raw: string): GridId {
  return raw as GridId;
}

/** Create a TradeId */
export function makeTradeId(marketId: MarketId, height: bigint, index: number): TradeId {
  const raw = `trade_${simpleHash(`TRADE:${marketId}:${height}:${index}`)}`;
  return raw as TradeId;
}

// ============================================================================
// Enums & Constants
// ============================================================================

export type Side = 'bid' | 'ask';

export type MarketStatus = 'active' | 'paused' | 'closed';

export type OrderStatus = 'open' | 'partial' | 'filled' | 'cancelled';

export type OrderFlag = 'post_only' | 'ioc' | 'fok';

export type SpreadMode = 'arith' | 'geom';

export type SideBias = 'both' | 'bid_only' | 'ask_only';

/** Maximum levels per side for LP grids (bounded for determinism) */
export const MAX_LEVELS_PER_SIDE = 64;

/** Maximum matches per single match call (bounded for gas) */
export const MAX_MATCHES_PER_CALL = 100;

/** Fixed-point scale for geometric ratio (1e6 = 1.0) */
export const GEOM_RATIO_SCALE = 1_000_000n;

// ============================================================================
// Market Types
// ============================================================================

/** Market configuration and metadata */
export interface Market {
  marketId: MarketId;
  baseTokenId: TokenId;
  quoteTokenId: TokenId;
  /** Minimum price increment */
  tickSize: bigint;
  /** Minimum order size */
  lotSize: bigint;
  /** Trading fee in basis points (100 = 1%) */
  feeBps: number;
  /** Current market status */
  status: MarketStatus;
  /** Optional org that owns this market */
  ownerOrgId?: string;
  /** Creator address */
  creator: string;
  /** Block height when created */
  createdAtHeight: bigint;
  /** OCC version */
  version: bigint;
}

/** Parameters for creating a new market */
export interface CreateMarketParams {
  baseTokenId: TokenId;
  quoteTokenId: TokenId;
  tickSize: bigint;
  lotSize: bigint;
  feeBps: number;
  ownerOrgId?: string;
}

/** Top-of-book snapshot (maintained for efficient matching) */
export interface TopOfBook {
  marketId: MarketId;
  bestBidPrice: bigint | null;
  bestAskPrice: bigint | null;
  lastTradePrice: bigint | null;
  lastTradeHeight: bigint | null;
  version: bigint;
}

// ============================================================================
// Order Types
// ============================================================================

/** Individual order in the orderbook */
export interface Order {
  orderId: OrderId;
  marketId: MarketId;
  owner: string;
  side: Side;
  /** Price in quote token units per base token unit */
  price: bigint;
  /** Original order size in base token units */
  size: bigint;
  /** Remaining unfilled size */
  remaining: bigint;
  /** Current status */
  status: OrderStatus;
  /** Block height when created */
  createdAt: bigint;
  /** Order flags */
  flags: OrderFlag[];
  /** Associated grid ID if part of LP grid */
  gridId?: GridId;
  /** OCC version */
  version: bigint;
}

/** Parameters for placing an order */
export interface PlaceOrderParams {
  marketId: MarketId;
  side: Side;
  price: bigint;
  size: bigint;
  flags?: OrderFlag[];
  gridId?: GridId;
}

/** Price level aggregation (for efficient book queries) */
export interface PriceLevel {
  marketId: MarketId;
  side: Side;
  price: bigint;
  /** Total size at this level */
  aggregate: bigint;
  /** Order IDs at this level (FIFO order) */
  orderIds: OrderId[];
  version: bigint;
}

// ============================================================================
// Trade Types
// ============================================================================

/** Executed trade record */
export interface Trade {
  tradeId: TradeId;
  marketId: MarketId;
  /** Maker order (resting order) */
  makerOrderId: OrderId;
  makerAddress: string;
  /** Taker order (aggressing order) */
  takerOrderId: OrderId;
  takerAddress: string;
  /** Trade side from taker's perspective */
  side: Side;
  /** Execution price */
  price: bigint;
  /** Trade size in base token units */
  size: bigint;
  /** Quote amount (price * size) */
  quoteAmount: bigint;
  /** Fee paid by taker */
  takerFee: bigint;
  /** Fee paid to maker (can be rebate) */
  makerFee: bigint;
  /** Block height of execution */
  height: bigint;
  /** Logical timestamp within block */
  timestamp: bigint;
}

// ============================================================================
// Liquidity Grid Types
// ============================================================================

/** Configuration for an LP liquidity grid */
export interface LiquidityGrid {
  gridId: GridId;
  marketId: MarketId;
  owner: string;
  /** Center price for the grid */
  centerPrice: bigint;
  /** Price distance around center (determines spread width) */
  halfWidth: bigint;
  /** Number of levels per side (capped at MAX_LEVELS_PER_SIDE) */
  levelsPerSide: number;
  /** Spread calculation mode */
  mode: SpreadMode;
  /** For geometric mode: ratio scaled by GEOM_RATIO_SCALE (e.g., 1001000 = 1.001) */
  geomRatio?: bigint;
  /** Total base token amount allocated to the grid */
  totalBaseSize: bigint;
  /** Which sides to place orders on */
  sideBias: SideBias;
  /** Current status */
  status: 'active' | 'paused' | 'cancelled';
  /** Order IDs belonging to this grid */
  orderIds: OrderId[];
  /** Block height when created */
  createdAt: bigint;
  /** OCC version */
  version: bigint;
}

/** Parameters for creating a liquidity grid */
export interface CreateGridParams {
  marketId: MarketId;
  centerPrice: bigint;
  halfWidth: bigint;
  levelsPerSide: number;
  mode: SpreadMode;
  geomRatio?: bigint;
  totalBaseSize: bigint;
  sideBias: SideBias;
}

/** Computed level for grid placement */
export interface GridLevel {
  side: Side;
  price: bigint;
  size: bigint;
}

// ============================================================================
// Escrow Types
// ============================================================================

/** Funds locked for market operations */
export interface MarketEscrow {
  marketId: MarketId;
  owner: string;
  tokenId: TokenId;
  /** Amount locked */
  lockedAmount: bigint;
  version: bigint;
}

// ============================================================================
// Result Types
// ============================================================================

export interface MarketResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PlaceOrderResult {
  orderId: OrderId;
  /** Immediate fills if crossing book */
  fills: Trade[];
  /** Remaining size (0 if fully filled or IOC/FOK rejected) */
  remainingSize: bigint;
}

export interface MatchResult {
  trades: Trade[];
  ordersUpdated: number;
  levelsUpdated: number;
}

export interface CreateGridResult {
  gridId: GridId;
  orderIds: OrderId[];
  levelsCreated: number;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/** Validate market parameters */
export function validateMarketParams(params: CreateMarketParams): string | null {
  if (params.tickSize <= 0n) return 'tickSize must be positive';
  if (params.lotSize <= 0n) return 'lotSize must be positive';
  if (params.feeBps < 0 || params.feeBps > 10000) return 'feeBps must be 0-10000';
  if (params.baseTokenId === params.quoteTokenId) return 'base and quote tokens must differ';
  return null;
}

/** Validate order parameters */
export function validateOrderParams(params: PlaceOrderParams, market: Market): string | null {
  if (params.price <= 0n) return 'price must be positive';
  if (params.size <= 0n) return 'size must be positive';
  if (params.price % market.tickSize !== 0n) return `price must be multiple of tickSize (${market.tickSize})`;
  if (params.size % market.lotSize !== 0n) return `size must be multiple of lotSize (${market.lotSize})`;
  if (params.size < market.lotSize) return `size must be >= lotSize (${market.lotSize})`;
  return null;
}

/** Validate grid parameters */
export function validateGridParams(params: CreateGridParams): string | null {
  if (params.centerPrice <= 0n) return 'centerPrice must be positive';
  if (params.halfWidth <= 0n) return 'halfWidth must be positive';
  if (params.levelsPerSide <= 0) return 'levelsPerSide must be positive';
  if (params.levelsPerSide > MAX_LEVELS_PER_SIDE) return `levelsPerSide exceeds max (${MAX_LEVELS_PER_SIDE})`;
  if (params.totalBaseSize <= 0n) return 'totalBaseSize must be positive';
  if (params.mode === 'geom') {
    if (!params.geomRatio) return 'geomRatio required for geometric mode';
    if (params.geomRatio <= GEOM_RATIO_SCALE) return 'geomRatio must be > 1.0';
    if (params.geomRatio > GEOM_RATIO_SCALE * 2n) return 'geomRatio too large (max 2.0)';
  }
  return null;
}

/** Align price to tick size (round down) */
export function alignToTick(price: bigint, tickSize: bigint): bigint {
  return (price / tickSize) * tickSize;
}

/** Calculate quote amount from price and size */
export function calcQuoteAmount(price: bigint, size: bigint): bigint {
  return price * size;
}

/** Calculate fee amount */
export function calcFee(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(feeBps)) / 10000n;
}
