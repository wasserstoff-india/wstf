/**
 * SDK Markets Module
 *
 * High-level API for orderbook operations (markets, orders, grids).
 */

import {
  Address,
  TokenId,
  MarketId,
  OrderId,
  GridId,
  Side,
  MarketStatus,
  OrderStatus,
  OrderFlag,
  SpreadMode,
  SideBias,
  SdkResult,
  TxReceipt,
  MarketInfo,
  OrderView,
  TopOfBook,
  OrderbookView,
  PriceLevelView,
  TradeView,
  LPGridConfig,
  LPGridView,
  PlaceOrderResult,
  CreateGridResult,
  CancelOrderResult,
  WaitOptions,
  MAX_LEVELS_PER_SIDE,
  MAX_MATCHES_PER_CALL,
  GEOM_RATIO_SCALE,
} from './types';
import { RpcClient } from './client';
import { Signer } from './signer';

// Internal market types
import type {
  Market,
  Order,
  LiquidityGrid,
  Trade,
  PriceLevel,
  MarketEscrow,
  CreateMarketParams,
  PlaceOrderParams,
  CreateGridParams,
} from '../../markets/types';

// ============================================================================
// Market SDK Types
// ============================================================================

/**
 * Parameters for creating a market.
 */
export interface CreateMarketSdkParams {
  /** Base token ID (e.g., BTC) */
  baseTokenId: TokenId;
  /** Quote token ID (e.g., USDT) */
  quoteTokenId: TokenId;
  /** Minimum price increment */
  tickSize: bigint;
  /** Minimum order size */
  lotSize: bigint;
  /** Trading fee in basis points (100 = 1%) */
  feeBps: number;
  /** Optional org that owns this market */
  ownerOrgId?: string;
}

/**
 * Parameters for placing an order.
 */
export interface PlaceOrderSdkParams {
  /** Market ID */
  marketId: MarketId;
  /** Order side (bid = buy, ask = sell) */
  side: Side;
  /** Limit price */
  price: bigint;
  /** Order size in base token units */
  size: bigint;
  /** Order flags */
  flags?: OrderFlag[];
}

/**
 * Parameters for creating an LP grid.
 */
export interface CreateGridSdkParams {
  /** Market ID */
  marketId: MarketId;
  /** Center price for the grid */
  centerPrice: bigint;
  /** Price distance around center */
  halfWidth: bigint;
  /** Number of levels per side (max 64) */
  levelsPerSide: number;
  /** Spread calculation mode */
  mode: SpreadMode;
  /** Geometric ratio (for geometric mode, scaled by 1e6) */
  geomRatio?: bigint;
  /** Total base token amount to allocate */
  totalBaseSize: bigint;
  /** Which sides to place orders on */
  sideBias: SideBias;
}

/**
 * Escrow balance info.
 */
export interface EscrowBalance {
  marketId: MarketId;
  owner: Address;
  tokenId: TokenId;
  lockedAmount: bigint;
}

/**
 * Market statistics.
 */
export interface MarketStats {
  marketId: MarketId;
  volume24h: bigint;
  tradeCount24h: number;
  highPrice24h: bigint | null;
  lowPrice24h: bigint | null;
  openPrice24h: bigint | null;
  lastPrice: bigint | null;
}

// ============================================================================
// Markets SDK
// ============================================================================

/**
 * Markets SDK for orderbook operations.
 */
export class MarketsSDK {
  private client: RpcClient;
  private signer: Signer;
  private programId: string;

  constructor(client: RpcClient, signer: Signer, programId: string = 'markets') {
    this.client = client;
    this.signer = signer;
    this.programId = programId;
  }

  // ==========================================================================
  // Market Queries
  // ==========================================================================

  /**
   * Get market info by ID.
   */
  async getMarket(marketId: MarketId): Promise<SdkResult<MarketInfo>> {
    return this.client.getMarket(marketId);
  }

  /**
   * Get all markets (optionally filtered by base/quote token).
   */
  async getMarkets(options?: {
    baseTokenId?: TokenId;
    quoteTokenId?: TokenId;
    status?: MarketStatus;
  }): Promise<SdkResult<MarketInfo[]>> {
    return {
      success: false,
      error: 'Market listing requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get top of book for a market.
   */
  async getTopOfBook(marketId: MarketId): Promise<SdkResult<TopOfBook>> {
    return this.client.getTopOfBook(marketId);
  }

  /**
   * Get orderbook snapshot.
   */
  async getOrderbook(marketId: MarketId, depth?: number): Promise<SdkResult<OrderbookView>> {
    return this.client.getOrderbook(marketId, depth);
  }

  /**
   * Get market statistics.
   */
  async getMarketStats(marketId: MarketId): Promise<SdkResult<MarketStats>> {
    return {
      success: false,
      error: 'Market stats require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Order Queries
  // ==========================================================================

  /**
   * Get order by ID.
   */
  async getOrder(orderId: OrderId): Promise<SdkResult<OrderView>> {
    return this.client.getOrder(orderId);
  }

  /**
   * Get all orders for the signer.
   */
  async getMyOrders(options?: {
    marketId?: MarketId;
    status?: OrderStatus;
  }): Promise<SdkResult<OrderView[]>> {
    return this.client.getOrders(this.signer.address, options?.marketId);
  }

  /**
   * Get orders by owner address.
   */
  async getOrdersByOwner(
    owner: Address,
    options?: { marketId?: MarketId; status?: OrderStatus }
  ): Promise<SdkResult<OrderView[]>> {
    return this.client.getOrders(owner, options?.marketId);
  }

  // ==========================================================================
  // Trade Queries
  // ==========================================================================

  /**
   * Get recent trades for a market.
   */
  async getTrades(
    marketId: MarketId,
    options?: { fromHeight?: bigint; limit?: number }
  ): Promise<SdkResult<TradeView[]>> {
    return this.client.getTrades(marketId, options);
  }

  /**
   * Get trades for the signer.
   */
  async getMyTrades(options?: {
    marketId?: MarketId;
    fromHeight?: bigint;
    limit?: number;
  }): Promise<SdkResult<TradeView[]>> {
    return {
      success: false,
      error: 'User trade queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Grid Queries
  // ==========================================================================

  /**
   * Get LP grid by ID.
   */
  async getGrid(gridId: GridId): Promise<SdkResult<LPGridView>> {
    return this.client.getGrid(gridId);
  }

  /**
   * Get all grids for the signer.
   */
  async getMyGrids(marketId?: MarketId): Promise<SdkResult<LPGridView[]>> {
    return {
      success: false,
      error: 'Grid queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Escrow Queries
  // ==========================================================================

  /**
   * Get escrow balance for the signer in a market.
   */
  async getMyEscrow(
    marketId: MarketId,
    tokenId: TokenId
  ): Promise<SdkResult<EscrowBalance>> {
    return {
      success: false,
      error: 'Escrow queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Market Management
  // ==========================================================================

  /**
   * Create a new market.
   */
  async createMarket(
    params: CreateMarketSdkParams,
    options?: WaitOptions
  ): Promise<SdkResult<{ marketId: MarketId; receipt: TxReceipt }>> {
    const authToken = this.signer.createScopedToken(this.programId, ['market:create']);

    return {
      success: false,
      error: 'Market creation requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Pause a market (requires ownership).
   */
  async pauseMarket(
    marketId: MarketId,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    const authToken = this.signer.createScopedToken(this.programId, ['market:admin']);

    return {
      success: false,
      error: 'Market admin requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Resume a paused market.
   */
  async resumeMarket(
    marketId: MarketId,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    const authToken = this.signer.createScopedToken(this.programId, ['market:admin']);

    return {
      success: false,
      error: 'Market admin requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Order Operations
  // ==========================================================================

  /**
   * Place a limit order.
   */
  async placeOrder(
    params: PlaceOrderSdkParams,
    options?: WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    const authToken = this.signer.createScopedToken(this.programId, ['order:place']);

    // Validate params
    if (params.price <= 0n) {
      return { success: false, error: 'Price must be positive', code: 'INVALID_INPUT' };
    }
    if (params.size <= 0n) {
      return { success: false, error: 'Size must be positive', code: 'INVALID_INPUT' };
    }

    return {
      success: false,
      error: 'Order placement requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Place a market order (IOC order at extreme price).
   */
  async placeMarketOrder(
    marketId: MarketId,
    side: Side,
    size: bigint,
    options?: WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    // Market orders are IOC orders at an extreme price
    const extremePrice = side === Side.BID
      ? BigInt('0xFFFFFFFFFFFFFFFF')  // Max price for buys
      : 1n;                            // Min price for sells

    return this.placeOrder({
      marketId,
      side,
      price: extremePrice,
      size,
      flags: [OrderFlag.IOC],
    }, options);
  }

  /**
   * Cancel an order.
   */
  async cancelOrder(
    orderId: OrderId,
    options?: WaitOptions
  ): Promise<SdkResult<CancelOrderResult>> {
    const authToken = this.signer.createScopedToken(this.programId, ['order:cancel']);

    return {
      success: false,
      error: 'Order cancellation requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Cancel multiple orders.
   */
  async cancelOrders(
    orderIds: OrderId[],
    options?: WaitOptions
  ): Promise<SdkResult<CancelOrderResult[]>> {
    const authToken = this.signer.createScopedToken(this.programId, ['order:cancel']);

    return {
      success: false,
      error: 'Batch cancel requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Cancel all orders in a market.
   */
  async cancelAllOrders(
    marketId: MarketId,
    options?: WaitOptions
  ): Promise<SdkResult<CancelOrderResult[]>> {
    // First get all orders, then cancel them
    const ordersResult = await this.getMyOrders({ marketId, status: OrderStatus.OPEN });

    if (!ordersResult.success || !ordersResult.data) {
      return {
        success: false,
        error: ordersResult.error,
        code: ordersResult.code,
      };
    }

    const orderIds = ordersResult.data.map((o) => o.orderId as OrderId);
    return this.cancelOrders(orderIds, options);
  }

  // ==========================================================================
  // LP Grid Operations
  // ==========================================================================

  /**
   * Create an LP grid.
   */
  async createGrid(
    params: CreateGridSdkParams,
    options?: WaitOptions
  ): Promise<SdkResult<CreateGridResult>> {
    const authToken = this.signer.createScopedToken(this.programId, ['grid:create']);

    // Validate params
    if (params.levelsPerSide <= 0 || params.levelsPerSide > MAX_LEVELS_PER_SIDE) {
      return {
        success: false,
        error: `levelsPerSide must be 1-${MAX_LEVELS_PER_SIDE}`,
        code: 'INVALID_INPUT',
      };
    }

    if (params.mode === SpreadMode.GEOMETRIC && !params.geomRatio) {
      return {
        success: false,
        error: 'geomRatio required for geometric mode',
        code: 'INVALID_INPUT',
      };
    }

    return {
      success: false,
      error: 'Grid creation requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Cancel (close) an LP grid.
   */
  async cancelGrid(
    gridId: GridId,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    const authToken = this.signer.createScopedToken(this.programId, ['grid:cancel']);

    return {
      success: false,
      error: 'Grid cancellation requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Pause an LP grid.
   */
  async pauseGrid(
    gridId: GridId,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    const authToken = this.signer.createScopedToken(this.programId, ['grid:admin']);

    return {
      success: false,
      error: 'Grid pause requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Resume a paused LP grid.
   */
  async resumeGrid(
    gridId: GridId,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    const authToken = this.signer.createScopedToken(this.programId, ['grid:admin']);

    return {
      success: false,
      error: 'Grid resume requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Escrow Operations
  // ==========================================================================

  /**
   * Deposit to escrow.
   */
  async depositEscrow(
    marketId: MarketId,
    tokenId: TokenId,
    amount: bigint,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    const authToken = this.signer.createScopedToken(this.programId, ['escrow:deposit']);

    return {
      success: false,
      error: 'Escrow deposit requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Withdraw from escrow.
   */
  async withdrawEscrow(
    marketId: MarketId,
    tokenId: TokenId,
    amount: bigint,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    const authToken = this.signer.createScopedToken(this.programId, ['escrow:withdraw']);

    return {
      success: false,
      error: 'Escrow withdrawal requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Calculate required escrow for an order.
   */
  calculateOrderEscrow(
    side: Side,
    price: bigint,
    size: bigint,
    feeBps: number
  ): { baseAmount: bigint; quoteAmount: bigint } {
    if (side === Side.BID) {
      // Buying: need quote tokens
      const quoteAmount = price * size;
      const fee = (quoteAmount * BigInt(feeBps)) / 10000n;
      return { baseAmount: 0n, quoteAmount: quoteAmount + fee };
    } else {
      // Selling: need base tokens
      return { baseAmount: size, quoteAmount: 0n };
    }
  }

  /**
   * Calculate grid levels.
   */
  calculateGridLevels(params: CreateGridSdkParams): Array<{ side: Side; price: bigint; size: bigint }> {
    const levels: Array<{ side: Side; price: bigint; size: bigint }> = [];
    const sizePerLevel = params.totalBaseSize / BigInt(params.levelsPerSide * 2);

    if (params.mode === SpreadMode.ARITHMETIC) {
      const step = params.halfWidth / BigInt(params.levelsPerSide);

      for (let i = 1; i <= params.levelsPerSide; i++) {
        const offset = step * BigInt(i);

        if (params.sideBias !== SideBias.ASK_ONLY) {
          levels.push({
            side: Side.BID,
            price: params.centerPrice - offset,
            size: sizePerLevel,
          });
        }

        if (params.sideBias !== SideBias.BID_ONLY) {
          levels.push({
            side: Side.ASK,
            price: params.centerPrice + offset,
            size: sizePerLevel,
          });
        }
      }
    } else {
      // Geometric mode
      const ratio = params.geomRatio ?? GEOM_RATIO_SCALE + 1000n; // Default 0.1%

      for (let i = 1; i <= params.levelsPerSide; i++) {
        const multiplier = ratio ** BigInt(i) / GEOM_RATIO_SCALE ** BigInt(i - 1);
        const bidPrice = (params.centerPrice * GEOM_RATIO_SCALE) / multiplier;
        const askPrice = (params.centerPrice * multiplier) / GEOM_RATIO_SCALE;

        if (params.sideBias !== SideBias.ASK_ONLY) {
          levels.push({
            side: Side.BID,
            price: bidPrice,
            size: sizePerLevel,
          });
        }

        if (params.sideBias !== SideBias.BID_ONLY) {
          levels.push({
            side: Side.ASK,
            price: askPrice,
            size: sizePerLevel,
          });
        }
      }
    }

    return levels;
  }

  /**
   * Align price to tick size.
   */
  alignToTick(price: bigint, tickSize: bigint): bigint {
    return (price / tickSize) * tickSize;
  }

  /**
   * Align size to lot size.
   */
  alignToLot(size: bigint, lotSize: bigint): bigint {
    return (size / lotSize) * lotSize;
  }
}

/**
 * Create a MarketsSDK instance.
 */
export function createMarketsSDK(
  client: RpcClient,
  signer: Signer,
  programId?: string
): MarketsSDK {
  return new MarketsSDK(client, signer, programId);
}
