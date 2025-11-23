/**
 * Markets Module - Type Definitions
 *
 * Branded types, interfaces, and helpers for the on-chain orderbook system.
 * Follows existing patterns from tokens/types.ts for consistency.
 */
import { TokenId } from '../tokens/types';
/** Unique market identifier */
export type MarketId = string & {
    readonly __brand: 'MarketId';
};
/** Unique order identifier */
export type OrderId = string & {
    readonly __brand: 'OrderId';
};
/** Unique liquidity grid identifier */
export type GridId = string & {
    readonly __brand: 'GridId';
};
/** Unique trade identifier */
export type TradeId = string & {
    readonly __brand: 'TradeId';
};
/** Create a MarketId from base and quote token IDs */
export declare function makeMarketId(baseTokenId: string, quoteTokenId: string): MarketId;
/** Create a MarketId from raw string (for deserialization) */
export declare function makeMarketIdRaw(raw: string): MarketId;
/** Create an OrderId */
export declare function makeOrderId(marketId: MarketId, owner: string, nonce: bigint): OrderId;
/** Create an OrderId from raw string */
export declare function makeOrderIdRaw(raw: string): OrderId;
/** Create a GridId */
export declare function makeGridId(marketId: MarketId, owner: string, nonce: bigint): GridId;
/** Create a GridId from raw string */
export declare function makeGridIdRaw(raw: string): GridId;
/** Create a TradeId */
export declare function makeTradeId(marketId: MarketId, height: bigint, index: number): TradeId;
export type Side = 'bid' | 'ask';
export type MarketStatus = 'active' | 'paused' | 'closed';
export type OrderStatus = 'open' | 'partial' | 'filled' | 'cancelled';
export type OrderFlag = 'post_only' | 'ioc' | 'fok';
export type SpreadMode = 'arith' | 'geom';
export type SideBias = 'both' | 'bid_only' | 'ask_only';
/** Maximum levels per side for LP grids (bounded for determinism) */
export declare const MAX_LEVELS_PER_SIDE = 64;
/** Maximum matches per single match call (bounded for gas) */
export declare const MAX_MATCHES_PER_CALL = 100;
/** Fixed-point scale for geometric ratio (1e6 = 1.0) */
export declare const GEOM_RATIO_SCALE = 1000000n;
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
/** Funds locked for market operations */
export interface MarketEscrow {
    marketId: MarketId;
    owner: string;
    tokenId: TokenId;
    /** Amount locked */
    lockedAmount: bigint;
    version: bigint;
}
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
/** Validate market parameters */
export declare function validateMarketParams(params: CreateMarketParams): string | null;
/** Validate order parameters */
export declare function validateOrderParams(params: PlaceOrderParams, market: Market): string | null;
/** Validate grid parameters */
export declare function validateGridParams(params: CreateGridParams): string | null;
/** Align price to tick size (round down) */
export declare function alignToTick(price: bigint, tickSize: bigint): bigint;
/** Calculate quote amount from price and size */
export declare function calcQuoteAmount(price: bigint, size: bigint): bigint;
/** Calculate fee amount */
export declare function calcFee(amount: bigint, feeBps: number): bigint;
//# sourceMappingURL=types.d.ts.map