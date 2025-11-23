/**
 * High-Level Trading Helper
 *
 * Provides convenient methods for trading operations including:
 * - Smart order routing
 * - Position management
 * - Order strategies
 * - Risk management
 */

import {
  Address,
  MarketId,
  OrderId,
  TokenId,
  Side,
  OrderStatus,
  OrderFlag,
  SdkResult,
  TxReceipt,
  WaitOptions,
  OrderView,
  TradeView,
  TopOfBook,
  PlaceOrderResult,
  CancelOrderResult,
} from '../core/types';
import { MarketsSDK, PlaceOrderSdkParams } from '../core/markets';
import { TokensSDK } from '../core/tokens';

// ============================================================================
// Trading Types
// ============================================================================

/**
 * Trading position for a market.
 */
export interface TradingPosition {
  /** Market ID */
  marketId: MarketId;
  /** Base token ID */
  baseTokenId: TokenId;
  /** Quote token ID */
  quoteTokenId: TokenId;
  /** Net base position (positive = long, negative = short) */
  basePosition: bigint;
  /** Average entry price */
  avgEntryPrice: bigint;
  /** Unrealized PnL */
  unrealizedPnL: bigint;
  /** Number of open orders */
  openOrders: number;
}

/**
 * Order strategy type.
 */
export type OrderStrategy =
  | 'market'
  | 'limit'
  | 'limit_ioc'
  | 'limit_fok'
  | 'post_only'
  | 'twap'
  | 'iceberg';

/**
 * TWAP (Time-Weighted Average Price) order parameters.
 */
export interface TWAPParams {
  /** Total size to execute */
  totalSize: bigint;
  /** Number of slices */
  slices: number;
  /** Interval between slices in milliseconds */
  intervalMs: number;
  /** Price limit (optional) */
  priceLimit?: bigint;
  /** Cancel remaining if market moves too far */
  maxSlippage?: number;
}

/**
 * Iceberg order parameters.
 */
export interface IcebergParams {
  /** Total size to execute */
  totalSize: bigint;
  /** Visible size per order */
  visibleSize: bigint;
  /** Price limit */
  price: bigint;
  /** Refresh threshold (when to place next slice) */
  refreshThreshold?: bigint;
}

/**
 * Stop loss configuration.
 */
export interface StopLossConfig {
  /** Trigger price */
  triggerPrice: bigint;
  /** Order type when triggered */
  orderType: 'market' | 'limit';
  /** Limit price (if limit order) */
  limitPrice?: bigint;
}

/**
 * Take profit configuration.
 */
export interface TakeProfitConfig {
  /** Trigger price */
  triggerPrice: bigint;
  /** Order type when triggered */
  orderType: 'market' | 'limit';
  /** Limit price (if limit order) */
  limitPrice?: bigint;
}

/**
 * Trade execution summary.
 */
export interface ExecutionSummary {
  /** Total size executed */
  executedSize: bigint;
  /** Average execution price */
  avgPrice: bigint;
  /** Total fees paid */
  totalFees: bigint;
  /** Number of fills */
  fillCount: number;
  /** Slippage from initial price (bps) */
  slippageBps: number;
}

// ============================================================================
// Trading Helper Class
// ============================================================================

/**
 * High-level trading helper for order management.
 */
export class TradingHelper {
  private markets: MarketsSDK;
  private tokens: TokensSDK;

  constructor(markets: MarketsSDK, tokens: TokensSDK) {
    this.markets = markets;
    this.tokens = tokens;
  }

  // ==========================================================================
  // Simple Orders
  // ==========================================================================

  /**
   * Place a market buy order.
   */
  async marketBuy(
    marketId: MarketId,
    size: bigint,
    options?: WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    return this.markets.placeMarketOrder(marketId, Side.BID, size, options);
  }

  /**
   * Place a market sell order.
   */
  async marketSell(
    marketId: MarketId,
    size: bigint,
    options?: WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    return this.markets.placeMarketOrder(marketId, Side.ASK, size, options);
  }

  /**
   * Place a limit buy order.
   */
  async limitBuy(
    marketId: MarketId,
    price: bigint,
    size: bigint,
    options?: { flags?: OrderFlag[] } & WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    return this.markets.placeOrder({
      marketId,
      side: Side.BID,
      price,
      size,
      flags: options?.flags,
    }, options);
  }

  /**
   * Place a limit sell order.
   */
  async limitSell(
    marketId: MarketId,
    price: bigint,
    size: bigint,
    options?: { flags?: OrderFlag[] } & WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    return this.markets.placeOrder({
      marketId,
      side: Side.ASK,
      price,
      size,
      flags: options?.flags,
    }, options);
  }

  /**
   * Place a post-only order (maker only, reject if would take).
   */
  async postOnly(
    marketId: MarketId,
    side: Side,
    price: bigint,
    size: bigint,
    options?: WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    return this.markets.placeOrder({
      marketId,
      side,
      price,
      size,
      flags: [OrderFlag.POST_ONLY],
    }, options);
  }

  // ==========================================================================
  // Order Management
  // ==========================================================================

  /**
   * Cancel an order.
   */
  async cancelOrder(
    orderId: OrderId,
    options?: WaitOptions
  ): Promise<SdkResult<CancelOrderResult>> {
    return this.markets.cancelOrder(orderId, options);
  }

  /**
   * Cancel all open orders.
   */
  async cancelAllOrders(
    marketId?: MarketId,
    options?: WaitOptions
  ): Promise<SdkResult<CancelOrderResult[]>> {
    if (marketId) {
      return this.markets.cancelAllOrders(marketId, options);
    }

    // Get all open orders across all markets
    const ordersResult = await this.markets.getMyOrders({ status: OrderStatus.OPEN });

    if (!ordersResult.success || !ordersResult.data) {
      return {
        success: false,
        error: ordersResult.error,
        code: ordersResult.code,
      };
    }

    const orderIds = ordersResult.data.map((o) => o.orderId as OrderId);
    return this.markets.cancelOrders(orderIds, options);
  }

  /**
   * Get all open orders.
   */
  async getOpenOrders(marketId?: MarketId): Promise<SdkResult<OrderView[]>> {
    return this.markets.getMyOrders({
      marketId,
      status: OrderStatus.OPEN,
    });
  }

  /**
   * Modify an existing order (cancel and replace).
   */
  async modifyOrder(
    orderId: OrderId,
    newPrice: bigint,
    newSize: bigint,
    options?: WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    // Get existing order
    const orderResult = await this.markets.getOrder(orderId);

    if (!orderResult.success || !orderResult.data) {
      return {
        success: false,
        error: orderResult.error,
        code: orderResult.code,
      };
    }

    const order = orderResult.data;

    // Cancel existing order
    const cancelResult = await this.cancelOrder(orderId, options);

    if (!cancelResult.success) {
      return {
        success: false,
        error: cancelResult.error,
        code: cancelResult.code,
      };
    }

    // Place new order
    return this.markets.placeOrder({
      marketId: order.marketId as MarketId,
      side: order.side,
      price: newPrice,
      size: newSize,
      flags: order.flags,
    }, options);
  }

  // ==========================================================================
  // Position Management
  // ==========================================================================

  /**
   * Get current position for a market.
   */
  async getPosition(marketId: MarketId): Promise<SdkResult<TradingPosition>> {
    // This would need to track fills and calculate net position
    return {
      success: false,
      error: 'Position tracking requires trade history integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Close a position (market sell/buy to flatten).
   */
  async closePosition(
    marketId: MarketId,
    options?: WaitOptions
  ): Promise<SdkResult<PlaceOrderResult>> {
    const positionResult = await this.getPosition(marketId);

    if (!positionResult.success || !positionResult.data) {
      return {
        success: false,
        error: positionResult.error,
        code: positionResult.code,
      };
    }

    const position = positionResult.data;

    if (position.basePosition === 0n) {
      return {
        success: false,
        error: 'No position to close',
        code: 'NO_POSITION',
      };
    }

    // If long, market sell. If short, market buy.
    if (position.basePosition > 0n) {
      return this.marketSell(marketId, position.basePosition, options);
    } else {
      return this.marketBuy(marketId, -position.basePosition, options);
    }
  }

  // ==========================================================================
  // Smart Order Execution
  // ==========================================================================

  /**
   * Execute a TWAP order (split into multiple slices over time).
   *
   * Note: This runs client-side and requires the client to stay connected.
   */
  async executeTWAP(
    marketId: MarketId,
    side: Side,
    params: TWAPParams,
    options?: WaitOptions
  ): Promise<SdkResult<ExecutionSummary>> {
    const sliceSize = params.totalSize / BigInt(params.slices);
    let executedSize = 0n;
    let totalQuote = 0n;
    let totalFees = 0n;
    let fillCount = 0;

    // Get initial price for slippage calculation
    const tobResult = await this.markets.getTopOfBook(marketId);
    const initialPrice = tobResult.success && tobResult.data
      ? (side === Side.BID ? tobResult.data.bestAsk : tobResult.data.bestBid)
      : null;

    for (let i = 0; i < params.slices; i++) {
      // Check slippage if configured
      if (params.maxSlippage && initialPrice) {
        const currentTob = await this.markets.getTopOfBook(marketId);
        if (currentTob.success && currentTob.data) {
          const currentPrice = side === Side.BID
            ? currentTob.data.bestAsk
            : currentTob.data.bestBid;

          if (currentPrice) {
            const slippageBps = Number(
              ((currentPrice - initialPrice) * 10000n) / initialPrice
            );

            if (Math.abs(slippageBps) > params.maxSlippage) {
              return {
                success: false,
                error: `Slippage exceeded (${slippageBps} bps)`,
                code: 'SLIPPAGE_EXCEEDED',
              };
            }
          }
        }
      }

      // Execute slice
      const remaining = params.totalSize - executedSize;
      const thisSlice = remaining < sliceSize * 2n ? remaining : sliceSize;

      let result: SdkResult<PlaceOrderResult>;

      if (params.priceLimit) {
        result = await this.markets.placeOrder({
          marketId,
          side,
          price: params.priceLimit,
          size: thisSlice,
          flags: [OrderFlag.IOC],
        }, options);
      } else {
        result = await this.markets.placeMarketOrder(marketId, side, thisSlice, options);
      }

      if (result.success && result.data) {
        for (const fill of result.data.fills) {
          executedSize += fill.size;
          totalQuote += fill.quoteAmount;
          totalFees += fill.takerFee;
          fillCount++;
        }
      }

      // Wait for next slice (except last)
      if (i < params.slices - 1 && executedSize < params.totalSize) {
        await this.sleep(params.intervalMs);
      }
    }

    const avgPrice = executedSize > 0n ? totalQuote / executedSize : 0n;
    const slippageBps = initialPrice && executedSize > 0n
      ? Number(((avgPrice - initialPrice) * 10000n) / initialPrice)
      : 0;

    return {
      success: true,
      data: {
        executedSize,
        avgPrice,
        totalFees,
        fillCount,
        slippageBps,
      },
    };
  }

  /**
   * Execute an iceberg order (split into visible chunks).
   *
   * Note: This runs client-side and requires the client to stay connected.
   */
  async executeIceberg(
    marketId: MarketId,
    side: Side,
    params: IcebergParams,
    options?: WaitOptions
  ): Promise<SdkResult<ExecutionSummary>> {
    let executedSize = 0n;
    let totalQuote = 0n;
    let totalFees = 0n;
    let fillCount = 0;

    const refreshThreshold = params.refreshThreshold ?? params.visibleSize / 2n;

    while (executedSize < params.totalSize) {
      const remaining = params.totalSize - executedSize;
      const thisChunk = remaining < params.visibleSize ? remaining : params.visibleSize;

      // Place visible order
      const result = await this.markets.placeOrder({
        marketId,
        side,
        price: params.price,
        size: thisChunk,
      }, options);

      if (!result.success || !result.data) {
        break;
      }

      const order = result.data;

      // Track immediate fills
      for (const fill of order.fills) {
        executedSize += fill.size;
        totalQuote += fill.quoteAmount;
        totalFees += fill.takerFee;
        fillCount++;
      }

      // If order was fully filled, continue to next chunk
      if (order.remainingSize === 0n) {
        continue;
      }

      // Wait for order to be filled or cancelled
      // (simplified - real implementation would use WebSocket)
      let currentOrder = await this.markets.getOrder(order.orderId as OrderId);

      while (
        currentOrder.success &&
        currentOrder.data &&
        currentOrder.data.status === OrderStatus.OPEN
      ) {
        await this.sleep(1000);
        currentOrder = await this.markets.getOrder(order.orderId as OrderId);

        // Check if we should refresh
        if (
          currentOrder.success &&
          currentOrder.data &&
          currentOrder.data.remaining <= refreshThreshold
        ) {
          executedSize += thisChunk - currentOrder.data.remaining;
          break;
        }
      }
    }

    const avgPrice = executedSize > 0n ? totalQuote / executedSize : 0n;

    return {
      success: true,
      data: {
        executedSize,
        avgPrice,
        totalFees,
        fillCount,
        slippageBps: 0,
      },
    };
  }

  // ==========================================================================
  // Market Analysis
  // ==========================================================================

  /**
   * Get spread for a market.
   */
  async getSpread(marketId: MarketId): Promise<SdkResult<{
    spread: bigint | null;
    spreadBps: number | null;
    midPrice: bigint | null;
  }>> {
    const tobResult = await this.markets.getTopOfBook(marketId);

    if (!tobResult.success || !tobResult.data) {
      return {
        success: false,
        error: tobResult.error,
        code: tobResult.code,
      };
    }

    const tob = tobResult.data;

    if (!tob.bestBid || !tob.bestAsk) {
      return {
        success: true,
        data: { spread: null, spreadBps: null, midPrice: null },
      };
    }

    const spread = tob.bestAsk - tob.bestBid;
    const midPrice = (tob.bestBid + tob.bestAsk) / 2n;
    const spreadBps = Number((spread * 10000n) / midPrice);

    return {
      success: true,
      data: { spread, spreadBps, midPrice },
    };
  }

  /**
   * Calculate slippage for a given size.
   */
  async estimateSlippage(
    marketId: MarketId,
    side: Side,
    size: bigint
  ): Promise<SdkResult<{ estimatedPrice: bigint; slippageBps: number }>> {
    const orderbookResult = await this.markets.getOrderbook(marketId, 50);

    if (!orderbookResult.success || !orderbookResult.data) {
      return {
        success: false,
        error: orderbookResult.error,
        code: orderbookResult.code,
      };
    }

    const orderbook = orderbookResult.data;
    const levels = side === Side.BID ? orderbook.asks : orderbook.bids;

    if (levels.length === 0) {
      return {
        success: false,
        error: 'No liquidity on this side',
        code: 'NO_LIQUIDITY',
      };
    }

    const bestPrice = levels[0].price;
    let remainingSize = size;
    let totalQuote = 0n;

    for (const level of levels) {
      if (remainingSize <= 0n) break;

      const fillSize = remainingSize < level.size ? remainingSize : level.size;
      totalQuote += fillSize * level.price;
      remainingSize -= fillSize;
    }

    if (remainingSize > 0n) {
      return {
        success: false,
        error: 'Insufficient liquidity',
        code: 'INSUFFICIENT_LIQUIDITY',
      };
    }

    const estimatedPrice = totalQuote / size;
    const slippageBps = Number(
      ((estimatedPrice - bestPrice) * 10000n) / bestPrice
    );

    return {
      success: true,
      data: {
        estimatedPrice,
        slippageBps: Math.abs(slippageBps),
      },
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a trading helper instance.
 */
export function createTradingHelper(markets: MarketsSDK, tokens: TokensSDK): TradingHelper {
  return new TradingHelper(markets, tokens);
}
