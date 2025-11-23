/**
 * Markets Module - Execution Handlers
 *
 * SYS.MKT_* handlers for on-chain orderbook operations.
 * Follows patterns from executor/modules/sys.ts.
 */

import { InstructionRecord } from '../instructions/abi';
import { ExecutionContext, ExecutionEffects } from '../executor/types';
import { addLog, addEventLog } from '../executor/engine';
import {
  MarketId,
  OrderId,
  GridId,
  TradeId,
  Market,
  Order,
  Trade,
  LiquidityGrid,
  PriceLevel,
  TopOfBook,
  Side,
  OrderFlag,
  SpreadMode,
  SideBias,
  CreateMarketParams,
  PlaceOrderParams,
  CreateGridParams,
  PlaceOrderResult,
  MatchResult,
  CreateGridResult,
  makeMarketId,
  makeOrderId,
  makeGridId,
  makeTradeId,
  validateMarketParams,
  validateOrderParams,
  validateGridParams,
  alignToTick,
  calcQuoteAmount,
  calcFee,
  MAX_MATCHES_PER_CALL,
  MAX_LEVELS_PER_SIDE,
  GEOM_RATIO_SCALE,
} from './types';
import { TokenId, makeTokenId } from '../tokens/types';
import {
  MarketStore,
  InMemoryMarketStore,
  MarketNotFoundError,
  OrderNotFoundError,
  InsufficientEscrowError,
} from './store';

// ============================================================================
// Global Market Store (singleton for executor context)
// ============================================================================

let globalMarketStore: MarketStore | undefined;

export function getMarketStore(): MarketStore {
  if (!globalMarketStore) {
    globalMarketStore = new InMemoryMarketStore();
  }
  return globalMarketStore;
}

export function setMarketStore(store: MarketStore): void {
  globalMarketStore = store;
}

// ============================================================================
// Event Keys
// ============================================================================

const EVENT_KEY_MARKET_CREATED = '0x4d4b545f4352454154454400000000000000000000000000000000000000000000' as const;
const EVENT_KEY_ORDER_PLACED = '0x4f52445f504c41434544000000000000000000000000000000000000000000000' as const;
const EVENT_KEY_ORDER_CANCELLED = '0x4f52445f43414e43454c4c4544000000000000000000000000000000000000000' as const;
const EVENT_KEY_ORDER_FILLED = '0x4f52445f46494c4c454400000000000000000000000000000000000000000000' as const;
const EVENT_KEY_TRADE_EXECUTED = '0x54524144455f4558454355544544000000000000000000000000000000000000' as const;
const EVENT_KEY_GRID_CREATED = '0x475249445f435245415445440000000000000000000000000000000000000000' as const;
const EVENT_KEY_GRID_CANCELLED = '0x475249445f43414e43454c4c4544000000000000000000000000000000000000' as const;

// ============================================================================
// Helper Functions
// ============================================================================

/** Generate nonce for unique IDs */
let nonceCounter = 0n;
function getNonce(): bigint {
  return nonceCounter++;
}

/** Get current block height from context */
function getBlockHeight(ctx: ExecutionContext): bigint {
  return ctx.currentBlockHeight ?? 0n;
}

/** Simple topic from string */
function topicFromString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
}

// ============================================================================
// SYS.MKT_CREATE - Create a new market
// ============================================================================

export interface MktCreateArgs {
  baseTokenId: string;
  quoteTokenId: string;
  tickSize: string; // bigint as string
  lotSize: string;  // bigint as string
  feeBps: number;
  ownerOrgId?: string;
}

export async function handleMKT_CREATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as MktCreateArgs;
  const store = getMarketStore();

  // Parse and validate params
  const params: CreateMarketParams = {
    baseTokenId: makeTokenId(args.baseTokenId),
    quoteTokenId: makeTokenId(args.quoteTokenId),
    tickSize: BigInt(args.tickSize),
    lotSize: BigInt(args.lotSize),
    feeBps: args.feeBps,
    ownerOrgId: args.ownerOrgId,
  };

  const validationError = validateMarketParams(params);
  if (validationError) {
    throw new Error(`MKT_CREATE: ${validationError}`);
  }

  // Generate market ID
  const marketId = makeMarketId(params.baseTokenId, params.quoteTokenId);

  // Check market doesn't exist
  const existing = await store.getMarket(marketId);
  if (existing) {
    throw new Error(`MKT_CREATE: market already exists: ${marketId}`);
  }

  // Create market
  const market: Market = {
    marketId,
    baseTokenId: params.baseTokenId,
    quoteTokenId: params.quoteTokenId,
    tickSize: params.tickSize,
    lotSize: params.lotSize,
    feeBps: params.feeBps,
    status: 'active',
    ownerOrgId: params.ownerOrgId,
    creator: ctx.txFrom,
    createdAtHeight: getBlockHeight(ctx),
    version: 1n,
  };

  await store.createMarket(market);

  // Initialize top of book
  const top: TopOfBook = {
    marketId,
    bestBidPrice: null,
    bestAskPrice: null,
    lastTradePrice: null,
    lastTradeHeight: null,
    version: 1n,
  };
  await store.setTopOfBook(top);

  // Emit event
  addEventLog(effects, {
    module: 'SYS.MKT_CREATE',
    key: EVENT_KEY_MARKET_CREATED as any,
    topics: [topicFromString(marketId)] as any[],
    data: ('0x' + Buffer.from(JSON.stringify({
      marketId,
      baseTokenId: params.baseTokenId,
      quoteTokenId: params.quoteTokenId,
      tickSize: params.tickSize.toString(),
      lotSize: params.lotSize.toString(),
      feeBps: params.feeBps,
      creator: ctx.txFrom,
    })).toString('hex')) as any,
  });

  addLog(effects, 'info', `MKT_CREATE: Market created`, {
    marketId,
    baseTokenId: params.baseTokenId,
    quoteTokenId: params.quoteTokenId,
    tickSize: params.tickSize.toString(),
    lotSize: params.lotSize.toString(),
  });
}

// ============================================================================
// SYS.MKT_ORDER_PLACE - Place a limit order
// ============================================================================

export interface MktOrderPlaceArgs {
  marketId: string;
  side: Side;
  price: string;  // bigint as string
  size: string;   // bigint as string
  flags?: OrderFlag[];
  gridId?: string;
}

export async function handleMKT_ORDER_PLACE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as MktOrderPlaceArgs;
  const store = getMarketStore();

  const marketId = args.marketId as MarketId;
  const market = await store.getMarket(marketId);
  if (!market) {
    throw new MarketNotFoundError(marketId);
  }

  if (market.status !== 'active') {
    throw new Error(`MKT_ORDER_PLACE: market is ${market.status}`);
  }

  // Parse and validate params
  const params: PlaceOrderParams = {
    marketId,
    side: args.side,
    price: BigInt(args.price),
    size: BigInt(args.size),
    flags: args.flags || [],
    gridId: args.gridId as GridId | undefined,
  };

  const validationError = validateOrderParams(params, market);
  if (validationError) {
    throw new Error(`MKT_ORDER_PLACE: ${validationError}`);
  }

  // Calculate escrow requirement
  const escrowToken = params.side === 'bid' ? market.quoteTokenId : market.baseTokenId;
  const escrowAmount = params.side === 'bid'
    ? calcQuoteAmount(params.price, params.size)
    : params.size;

  // Lock escrow (in a real implementation, would transfer tokens to escrow)
  await store.adjustEscrow(marketId, ctx.txFrom, escrowToken, escrowAmount);

  // Generate order ID
  const orderId = makeOrderId(marketId, ctx.txFrom, getNonce());

  const flags = params.flags || [];

  // Create order
  const order: Order = {
    orderId,
    marketId,
    owner: ctx.txFrom,
    side: params.side,
    price: params.price,
    size: params.size,
    remaining: params.size,
    status: 'open',
    createdAt: getBlockHeight(ctx),
    flags,
    gridId: params.gridId,
    version: 1n,
  };

  await store.createOrder(order);

  // Update price level
  await updatePriceLevel(store, marketId, params.side, params.price, params.size, orderId, 'add');

  // Update top of book
  await updateTopOfBook(store, marketId);

  // Handle IOC/FOK flags
  const isIOC = flags.includes('ioc');
  const isFOK = flags.includes('fok');
  const isPostOnly = flags.includes('post_only');

  // If post-only, check that we don't cross the book
  if (isPostOnly) {
    const top = await store.getTopOfBook(marketId);
    if (top) {
      const wouldCross = params.side === 'bid'
        ? (top.bestAskPrice !== null && params.price >= top.bestAskPrice)
        : (top.bestBidPrice !== null && params.price <= top.bestBidPrice);
      if (wouldCross) {
        // Cancel the order immediately
        await cancelOrderInternal(store, order, effects, ctx);
        throw new Error(`MKT_ORDER_PLACE: post-only order would cross the book`);
      }
    }
  }

  // For IOC/FOK, attempt immediate matching
  if (isIOC || isFOK) {
    const matchResult = await matchOrders(store, marketId, effects, ctx);

    // Get updated order
    const updatedOrder = await store.getOrder(orderId);
    if (updatedOrder && updatedOrder.remaining > 0n) {
      if (isFOK) {
        // FOK: cancel if not fully filled
        await cancelOrderInternal(store, updatedOrder, effects, ctx);
        throw new Error(`MKT_ORDER_PLACE: FOK order not fully filled`);
      } else if (isIOC) {
        // IOC: cancel remaining
        await cancelOrderInternal(store, updatedOrder, effects, ctx);
      }
    }
  }

  // Emit event
  addEventLog(effects, {
    module: 'SYS.MKT_ORDER_PLACE',
    key: EVENT_KEY_ORDER_PLACED as any,
    topics: [topicFromString(marketId), topicFromString(orderId)] as any[],
    data: ('0x' + Buffer.from(JSON.stringify({
      orderId,
      marketId,
      owner: ctx.txFrom,
      side: params.side,
      price: params.price.toString(),
      size: params.size.toString(),
    })).toString('hex')) as any,
  });

  addLog(effects, 'info', `MKT_ORDER_PLACE: Order placed`, {
    orderId,
    marketId,
    side: params.side,
    price: params.price.toString(),
    size: params.size.toString(),
  });
}

// ============================================================================
// SYS.MKT_ORDER_CANCEL - Cancel an order
// ============================================================================

export interface MktOrderCancelArgs {
  orderId: string;
}

export async function handleMKT_ORDER_CANCEL(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as MktOrderCancelArgs;
  const store = getMarketStore();

  const orderId = args.orderId as OrderId;
  const order = await store.getOrder(orderId);
  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  // Only owner can cancel
  if (order.owner !== ctx.txFrom) {
    throw new Error(`MKT_ORDER_CANCEL: only owner can cancel`);
  }

  // Can't cancel filled orders
  if (order.status === 'filled') {
    throw new Error(`MKT_ORDER_CANCEL: order already filled`);
  }

  await cancelOrderInternal(store, order, effects, ctx);

  addLog(effects, 'info', `MKT_ORDER_CANCEL: Order cancelled`, {
    orderId,
    marketId: order.marketId,
    remaining: order.remaining.toString(),
  });
}

async function cancelOrderInternal(
  store: MarketStore,
  order: Order,
  effects: ExecutionEffects,
  ctx: ExecutionContext
): Promise<void> {
  const market = await store.getMarket(order.marketId);
  if (!market) {
    throw new MarketNotFoundError(order.marketId);
  }

  // Release escrow for remaining size
  const escrowToken = order.side === 'bid' ? market.quoteTokenId : market.baseTokenId;
  const escrowAmount = order.side === 'bid'
    ? calcQuoteAmount(order.price, order.remaining)
    : order.remaining;

  await store.adjustEscrow(order.marketId, order.owner, escrowToken, -escrowAmount);

  // Update price level
  await updatePriceLevel(store, order.marketId, order.side, order.price, -order.remaining, order.orderId, 'remove');

  // Update order status
  await store.updateOrder(order.orderId, { status: 'cancelled', remaining: 0n }, order.version);

  // Update top of book
  await updateTopOfBook(store, order.marketId);

  // Emit event
  addEventLog(effects, {
    module: 'SYS.MKT_ORDER_CANCEL',
    key: EVENT_KEY_ORDER_CANCELLED as any,
    topics: [topicFromString(order.marketId), topicFromString(order.orderId)] as any[],
    data: ('0x' + Buffer.from(JSON.stringify({
      orderId: order.orderId,
      marketId: order.marketId,
      owner: order.owner,
      releasedSize: order.remaining.toString(),
    })).toString('hex')) as any,
  });
}

// ============================================================================
// SYS.MKT_ORDER_MATCH - Execute matching (bounded loop)
// ============================================================================

export interface MktOrderMatchArgs {
  marketId: string;
  maxMatches?: number;
}

export async function handleMKT_ORDER_MATCH(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as MktOrderMatchArgs;
  const store = getMarketStore();

  const marketId = args.marketId as MarketId;
  const market = await store.getMarket(marketId);
  if (!market) {
    throw new MarketNotFoundError(marketId);
  }

  if (market.status !== 'active') {
    throw new Error(`MKT_ORDER_MATCH: market is ${market.status}`);
  }

  const maxMatches = Math.min(args.maxMatches || MAX_MATCHES_PER_CALL, MAX_MATCHES_PER_CALL);
  const result = await matchOrders(store, marketId, effects, ctx, maxMatches);

  addLog(effects, 'info', `MKT_ORDER_MATCH: Matching complete`, {
    marketId,
    trades: result.trades.length,
    ordersUpdated: result.ordersUpdated,
    levelsUpdated: result.levelsUpdated,
  });
}

async function matchOrders(
  store: MarketStore,
  marketId: MarketId,
  effects: ExecutionEffects,
  ctx: ExecutionContext,
  maxMatches: number = MAX_MATCHES_PER_CALL
): Promise<MatchResult> {
  const market = await store.getMarket(marketId);
  if (!market) {
    throw new MarketNotFoundError(marketId);
  }

  const trades: Trade[] = [];
  let ordersUpdated = 0;
  let levelsUpdated = 0;
  let matchCount = 0;
  let tradeIndex = 0;

  // Bounded matching loop
  while (matchCount < maxMatches) {
    const top = await store.getTopOfBook(marketId);
    if (!top || top.bestBidPrice === null || top.bestAskPrice === null) {
      break; // No crossing possible
    }

    if (top.bestBidPrice < top.bestAskPrice) {
      break; // No crossing
    }

    // Get best bid and ask levels
    const bidLevels = await store.getLevelsByMarket(marketId, 'bid', 1);
    const askLevels = await store.getLevelsByMarket(marketId, 'ask', 1);

    if (bidLevels.length === 0 || askLevels.length === 0) {
      break;
    }

    const bestBid = bidLevels[0];
    const bestAsk = askLevels[0];

    if (bestBid.price < bestAsk.price) {
      break; // No crossing
    }

    // Get first order from each side (FIFO)
    const bidOrderId = bestBid.orderIds[0];
    const askOrderId = bestAsk.orderIds[0];

    if (!bidOrderId || !askOrderId) {
      break;
    }

    const bidOrder = await store.getOrder(bidOrderId);
    const askOrder = await store.getOrder(askOrderId);

    if (!bidOrder || !askOrder) {
      break;
    }

    // Execute trade at maker price (resting order)
    // Determine who was maker (earlier timestamp = maker)
    const isBidMaker = bidOrder.createdAt <= askOrder.createdAt;
    const executionPrice = isBidMaker ? bidOrder.price : askOrder.price;
    const matchSize = bidOrder.remaining < askOrder.remaining ? bidOrder.remaining : askOrder.remaining;

    const quoteAmount = calcQuoteAmount(executionPrice, matchSize);
    const takerFee = calcFee(quoteAmount, market.feeBps);
    const makerFee = 0n; // No maker fee (could implement rebates)

    // Create trade record
    const trade: Trade = {
      tradeId: makeTradeId(marketId, getBlockHeight(ctx), tradeIndex++),
      marketId,
      makerOrderId: isBidMaker ? bidOrder.orderId : askOrder.orderId,
      makerAddress: isBidMaker ? bidOrder.owner : askOrder.owner,
      takerOrderId: isBidMaker ? askOrder.orderId : bidOrder.orderId,
      takerAddress: isBidMaker ? askOrder.owner : bidOrder.owner,
      side: isBidMaker ? 'ask' : 'bid',
      price: executionPrice,
      size: matchSize,
      quoteAmount,
      takerFee,
      makerFee,
      height: getBlockHeight(ctx),
      timestamp: BigInt(Date.now()),
    };

    await store.recordTrade(trade);
    trades.push(trade);

    // Update orders
    const newBidRemaining = bidOrder.remaining - matchSize;
    const newAskRemaining = askOrder.remaining - matchSize;

    await store.updateOrder(
      bidOrder.orderId,
      {
        remaining: newBidRemaining,
        status: newBidRemaining === 0n ? 'filled' : 'partial',
      },
      bidOrder.version
    );

    await store.updateOrder(
      askOrder.orderId,
      {
        remaining: newAskRemaining,
        status: newAskRemaining === 0n ? 'filled' : 'partial',
      },
      askOrder.version
    );

    ordersUpdated += 2;

    // Update escrow - release locked funds and transfer
    // Bid side: release quote tokens, transfer base tokens
    // Ask side: release base tokens, transfer quote tokens
    await store.adjustEscrow(marketId, bidOrder.owner, market.quoteTokenId, -quoteAmount);
    await store.adjustEscrow(marketId, askOrder.owner, market.baseTokenId, -matchSize);

    // Update price levels
    await updatePriceLevel(store, marketId, 'bid', bidOrder.price, -matchSize, bidOrder.orderId, newBidRemaining === 0n ? 'remove' : 'update');
    await updatePriceLevel(store, marketId, 'ask', askOrder.price, -matchSize, askOrder.orderId, newAskRemaining === 0n ? 'remove' : 'update');
    levelsUpdated += 2;

    // Update top of book with last trade price
    await updateTopOfBook(store, marketId, executionPrice);

    // Emit trade event
    addEventLog(effects, {
      module: 'SYS.MKT_ORDER_MATCH',
      key: EVENT_KEY_TRADE_EXECUTED as any,
      topics: [topicFromString(marketId), topicFromString(trade.tradeId)] as any[],
      data: ('0x' + Buffer.from(JSON.stringify({
        tradeId: trade.tradeId,
        marketId,
        price: executionPrice.toString(),
        size: matchSize.toString(),
        makerAddress: trade.makerAddress,
        takerAddress: trade.takerAddress,
      })).toString('hex')) as any,
    });

    matchCount++;
  }

  return { trades, ordersUpdated, levelsUpdated };
}

// ============================================================================
// SYS.MKT_GRID_CREATE - Create liquidity grid
// ============================================================================

export interface MktGridCreateArgs {
  marketId: string;
  centerPrice: string;
  halfWidth: string;
  levelsPerSide: number;
  mode: SpreadMode;
  geomRatio?: string;
  totalBaseSize: string;
  sideBias: SideBias;
}

export async function handleMKT_GRID_CREATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as MktGridCreateArgs;
  const store = getMarketStore();

  const marketId = args.marketId as MarketId;
  const market = await store.getMarket(marketId);
  if (!market) {
    throw new MarketNotFoundError(marketId);
  }

  if (market.status !== 'active') {
    throw new Error(`MKT_GRID_CREATE: market is ${market.status}`);
  }

  // Parse and validate params
  const params: CreateGridParams = {
    marketId,
    centerPrice: BigInt(args.centerPrice),
    halfWidth: BigInt(args.halfWidth),
    levelsPerSide: args.levelsPerSide,
    mode: args.mode,
    geomRatio: args.geomRatio ? BigInt(args.geomRatio) : undefined,
    totalBaseSize: BigInt(args.totalBaseSize),
    sideBias: args.sideBias,
  };

  const validationError = validateGridParams(params);
  if (validationError) {
    throw new Error(`MKT_GRID_CREATE: ${validationError}`);
  }

  // Generate grid ID
  const gridId = makeGridId(marketId, ctx.txFrom, getNonce());

  // Compute grid levels
  const levels = computeGridLevels(params, market);

  // Calculate total escrow needed
  let totalBaseEscrow = 0n;
  let totalQuoteEscrow = 0n;

  for (const level of levels) {
    if (level.side === 'ask') {
      totalBaseEscrow += level.size;
    } else {
      totalQuoteEscrow += calcQuoteAmount(level.price, level.size);
    }
  }

  // Lock escrow
  if (totalBaseEscrow > 0n) {
    await store.adjustEscrow(marketId, ctx.txFrom, market.baseTokenId, totalBaseEscrow);
  }
  if (totalQuoteEscrow > 0n) {
    await store.adjustEscrow(marketId, ctx.txFrom, market.quoteTokenId, totalQuoteEscrow);
  }

  // Create orders for each level
  const orderIds: OrderId[] = [];
  for (const level of levels) {
    const orderId = makeOrderId(marketId, ctx.txFrom, getNonce());
    const order: Order = {
      orderId,
      marketId,
      owner: ctx.txFrom,
      side: level.side,
      price: level.price,
      size: level.size,
      remaining: level.size,
      status: 'open',
      createdAt: getBlockHeight(ctx),
      flags: [],
      gridId,
      version: 1n,
    };

    await store.createOrder(order);
    await updatePriceLevel(store, marketId, level.side, level.price, level.size, orderId, 'add');
    orderIds.push(orderId);
  }

  // Create grid
  const grid: LiquidityGrid = {
    gridId,
    marketId,
    owner: ctx.txFrom,
    centerPrice: params.centerPrice,
    halfWidth: params.halfWidth,
    levelsPerSide: params.levelsPerSide,
    mode: params.mode,
    geomRatio: params.geomRatio,
    totalBaseSize: params.totalBaseSize,
    sideBias: params.sideBias,
    status: 'active',
    orderIds,
    createdAt: getBlockHeight(ctx),
    version: 1n,
  };

  await store.createGrid(grid);

  // Update top of book
  await updateTopOfBook(store, marketId);

  // Emit event
  addEventLog(effects, {
    module: 'SYS.MKT_GRID_CREATE',
    key: EVENT_KEY_GRID_CREATED as any,
    topics: [topicFromString(marketId), topicFromString(gridId)] as any[],
    data: ('0x' + Buffer.from(JSON.stringify({
      gridId,
      marketId,
      owner: ctx.txFrom,
      levelsCreated: levels.length,
      orderIds,
    })).toString('hex')) as any,
  });

  addLog(effects, 'info', `MKT_GRID_CREATE: Grid created`, {
    gridId,
    marketId,
    levelsCreated: levels.length,
    mode: params.mode,
  });
}

interface GridLevel {
  side: Side;
  price: bigint;
  size: bigint;
}

function computeGridLevels(params: CreateGridParams, market: Market): GridLevel[] {
  const levels: GridLevel[] = [];
  const { centerPrice, halfWidth, levelsPerSide, mode, geomRatio, totalBaseSize, sideBias } = params;

  // Size per level (equal distribution)
  const includeBids = sideBias === 'both' || sideBias === 'bid_only';
  const includeAsks = sideBias === 'both' || sideBias === 'ask_only';
  const totalLevels = (includeBids ? levelsPerSide : 0) + (includeAsks ? levelsPerSide : 0);
  const sizePerLevel = totalBaseSize / BigInt(totalLevels || 1);

  if (mode === 'arith') {
    // Arithmetic progression: equal price spacing
    const priceStep = halfWidth / BigInt(levelsPerSide);

    for (let i = 1; i <= levelsPerSide; i++) {
      const offset = priceStep * BigInt(i);

      if (includeBids) {
        const bidPrice = alignToTick(centerPrice - offset, market.tickSize);
        if (bidPrice > 0n) {
          levels.push({ side: 'bid', price: bidPrice, size: sizePerLevel });
        }
      }

      if (includeAsks) {
        const askPrice = alignToTick(centerPrice + offset, market.tickSize);
        levels.push({ side: 'ask', price: askPrice, size: sizePerLevel });
      }
    }
  } else {
    // Geometric progression: ratio-based spacing
    const ratio = geomRatio || GEOM_RATIO_SCALE + 1000n; // Default 1.001

    for (let i = 1; i <= levelsPerSide; i++) {
      // ratio^i = (ratio/SCALE)^i, computed as ratio^i / SCALE^(i-1)
      let multiplier = GEOM_RATIO_SCALE;
      for (let j = 0; j < i; j++) {
        multiplier = (multiplier * ratio) / GEOM_RATIO_SCALE;
      }

      if (includeBids) {
        // Bid price = center / ratio^i
        const bidPrice = alignToTick((centerPrice * GEOM_RATIO_SCALE) / multiplier, market.tickSize);
        if (bidPrice > 0n) {
          levels.push({ side: 'bid', price: bidPrice, size: sizePerLevel });
        }
      }

      if (includeAsks) {
        // Ask price = center * ratio^i
        const askPrice = alignToTick((centerPrice * multiplier) / GEOM_RATIO_SCALE, market.tickSize);
        levels.push({ side: 'ask', price: askPrice, size: sizePerLevel });
      }
    }
  }

  return levels;
}

// ============================================================================
// SYS.MKT_GRID_CANCEL - Cancel a liquidity grid
// ============================================================================

export interface MktGridCancelArgs {
  gridId: string;
}

export async function handleMKT_GRID_CANCEL(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as MktGridCancelArgs;
  const store = getMarketStore();

  const gridId = args.gridId as GridId;
  const grid = await store.getGrid(gridId);
  if (!grid) {
    throw new Error(`MKT_GRID_CANCEL: grid not found: ${gridId}`);
  }

  // Only owner can cancel
  if (grid.owner !== ctx.txFrom) {
    throw new Error(`MKT_GRID_CANCEL: only owner can cancel`);
  }

  if (grid.status === 'cancelled') {
    throw new Error(`MKT_GRID_CANCEL: grid already cancelled`);
  }

  // Cancel all orders in the grid
  for (const orderId of grid.orderIds) {
    const order = await store.getOrder(orderId);
    if (order && order.status !== 'filled' && order.status !== 'cancelled') {
      await cancelOrderInternal(store, order, effects, ctx);
    }
  }

  // Update grid status
  await store.updateGrid(gridId, { status: 'cancelled' }, grid.version);

  // Emit event
  addEventLog(effects, {
    module: 'SYS.MKT_GRID_CANCEL',
    key: EVENT_KEY_GRID_CANCELLED as any,
    topics: [topicFromString(grid.marketId), topicFromString(gridId)] as any[],
    data: ('0x' + Buffer.from(JSON.stringify({
      gridId,
      marketId: grid.marketId,
      owner: grid.owner,
      ordersCancelled: grid.orderIds.length,
    })).toString('hex')) as any,
  });

  addLog(effects, 'info', `MKT_GRID_CANCEL: Grid cancelled`, {
    gridId,
    marketId: grid.marketId,
    ordersCancelled: grid.orderIds.length,
  });
}

// ============================================================================
// Helper: Update Price Level
// ============================================================================

async function updatePriceLevel(
  store: MarketStore,
  marketId: MarketId,
  side: Side,
  price: bigint,
  sizeDelta: bigint,
  orderId: OrderId,
  action: 'add' | 'remove' | 'update'
): Promise<void> {
  const existing = await store.getLevel(marketId, side, price);

  if (action === 'add') {
    if (existing) {
      const newOrderIds = [...existing.orderIds, orderId];
      await store.setLevel({
        ...existing,
        aggregate: existing.aggregate + sizeDelta,
        orderIds: newOrderIds,
        version: existing.version + 1n,
      });
    } else {
      await store.setLevel({
        marketId,
        side,
        price,
        aggregate: sizeDelta,
        orderIds: [orderId],
        version: 1n,
      });
    }
  } else if (action === 'remove') {
    if (existing) {
      const newOrderIds = existing.orderIds.filter(id => id !== orderId);
      const newAggregate = existing.aggregate + sizeDelta; // sizeDelta is negative

      if (newAggregate <= 0n || newOrderIds.length === 0) {
        await store.deleteLevel(marketId, side, price);
      } else {
        await store.setLevel({
          ...existing,
          aggregate: newAggregate,
          orderIds: newOrderIds,
          version: existing.version + 1n,
        });
      }
    }
  } else {
    // update - just change aggregate
    if (existing) {
      const newAggregate = existing.aggregate + sizeDelta;
      if (newAggregate <= 0n) {
        await store.deleteLevel(marketId, side, price);
      } else {
        await store.setLevel({
          ...existing,
          aggregate: newAggregate,
          version: existing.version + 1n,
        });
      }
    }
  }
}

// ============================================================================
// Helper: Update Top of Book
// ============================================================================

async function updateTopOfBook(
  store: MarketStore,
  marketId: MarketId,
  lastTradePrice?: bigint
): Promise<void> {
  const bidLevels = await store.getLevelsByMarket(marketId, 'bid', 1);
  const askLevels = await store.getLevelsByMarket(marketId, 'ask', 1);

  const existing = await store.getTopOfBook(marketId);
  const currentVersion = existing?.version ?? 0n;

  const top: TopOfBook = {
    marketId,
    bestBidPrice: bidLevels.length > 0 ? bidLevels[0].price : null,
    bestAskPrice: askLevels.length > 0 ? askLevels[0].price : null,
    lastTradePrice: lastTradePrice ?? existing?.lastTradePrice ?? null,
    lastTradeHeight: lastTradePrice ? BigInt(Date.now()) : existing?.lastTradeHeight ?? null,
    version: currentVersion + 1n,
  };

  await store.setTopOfBook(top);
}

// ============================================================================
// Read-Only Queries
// ============================================================================

export interface MktGetMarketArgs {
  marketId: string;
}

export async function handleMKT_GET_MARKET(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as MktGetMarketArgs;
  const store = getMarketStore();

  const marketId = args.marketId as MarketId;
  const market = await store.getMarket(marketId);

  if (!market) {
    addLog(effects, 'info', `MKT_GET_MARKET: Not found`, { marketId });
    return;
  }

  addLog(effects, 'info', `MKT_GET_MARKET: Found`, {
    marketId,
    baseTokenId: market.baseTokenId,
    quoteTokenId: market.quoteTokenId,
    status: market.status,
    tickSize: market.tickSize.toString(),
    lotSize: market.lotSize.toString(),
  });
}

export interface MktGetBookArgs {
  marketId: string;
  depth?: number;
}

export async function handleMKT_GET_BOOK(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as MktGetBookArgs;
  const store = getMarketStore();

  const marketId = args.marketId as MarketId;
  const depth = args.depth || 10;

  const bids = await store.getLevelsByMarket(marketId, 'bid', depth);
  const asks = await store.getLevelsByMarket(marketId, 'ask', depth);
  const top = await store.getTopOfBook(marketId);

  addLog(effects, 'info', `MKT_GET_BOOK: Retrieved`, {
    marketId,
    bidLevels: bids.length,
    askLevels: asks.length,
    bestBid: top?.bestBidPrice?.toString() ?? 'null',
    bestAsk: top?.bestAskPrice?.toString() ?? 'null',
    spread: (top?.bestBidPrice && top?.bestAskPrice)
      ? (top.bestAskPrice - top.bestBidPrice).toString()
      : 'N/A',
  });
}
