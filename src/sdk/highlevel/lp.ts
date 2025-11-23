/**
 * High-Level LP (Liquidity Provider) Helper
 *
 * Provides convenient methods for LP operations including:
 * - Grid management
 * - Position tracking
 * - PnL calculation
 * - Rebalancing strategies
 */

import {
  Address,
  MarketId,
  GridId,
  TokenId,
  Side,
  SpreadMode,
  SideBias,
  SdkResult,
  TxReceipt,
  WaitOptions,
  LPGridView,
  TradeView,
  CreateGridResult,
  GEOM_RATIO_SCALE,
  MAX_LEVELS_PER_SIDE,
} from '../core/types';
import { MarketsSDK, CreateGridSdkParams } from '../core/markets';
import { TokensSDK } from '../core/tokens';

// ============================================================================
// LP Helper Types
// ============================================================================

/**
 * LP position summary.
 */
export interface LPPosition {
  /** Grid ID */
  gridId: GridId;
  /** Market ID */
  marketId: MarketId;
  /** Base token ID */
  baseTokenId: TokenId;
  /** Quote token ID */
  quoteTokenId: TokenId;
  /** Total base tokens in orders */
  baseInOrders: bigint;
  /** Total quote tokens in orders */
  quoteInOrders: bigint;
  /** Total base earned from trades */
  baseEarned: bigint;
  /** Total quote earned from trades */
  quoteEarned: bigint;
  /** Number of active orders */
  activeOrders: number;
  /** Grid status */
  status: 'active' | 'paused' | 'cancelled';
  /** Creation timestamp */
  createdAt: bigint;
}

/**
 * LP PnL (Profit and Loss) calculation.
 */
export interface LPPnL {
  /** Unrealized PnL in quote tokens */
  unrealizedPnL: bigint;
  /** Realized PnL from completed trades */
  realizedPnL: bigint;
  /** Total PnL */
  totalPnL: bigint;
  /** Fees earned */
  feesEarned: bigint;
  /** Impermanent loss estimate */
  impermanentLoss: bigint;
  /** ROI percentage (scaled by 10000, e.g., 100 = 1%) */
  roiBps: number;
}

/**
 * Grid creation preset.
 */
export interface GridPreset {
  name: string;
  description: string;
  mode: SpreadMode;
  levelsPerSide: number;
  spreadBps: number; // Basis points spread
  geomRatio?: bigint;
  sideBias: SideBias;
}

/**
 * Rebalance suggestion.
 */
export interface RebalanceSuggestion {
  reason: string;
  suggestedCenterPrice: bigint;
  suggestedHalfWidth: bigint;
  currentUtilization: number; // 0-100%
  estimatedGasCost: bigint;
}

// ============================================================================
// Grid Presets
// ============================================================================

/**
 * Common grid presets for different strategies.
 */
export const GRID_PRESETS: Record<string, GridPreset> = {
  /** Tight spread for stable pairs */
  STABLE_PAIR: {
    name: 'Stable Pair',
    description: 'Tight spread for stablecoin pairs (0.1% spread)',
    mode: SpreadMode.ARITHMETIC,
    levelsPerSide: 10,
    spreadBps: 10,
    sideBias: SideBias.BOTH,
  },
  /** Medium spread for major pairs */
  MAJOR_PAIR: {
    name: 'Major Pair',
    description: 'Medium spread for major trading pairs (0.5% spread)',
    mode: SpreadMode.ARITHMETIC,
    levelsPerSide: 20,
    spreadBps: 50,
    sideBias: SideBias.BOTH,
  },
  /** Wide spread for volatile pairs */
  VOLATILE_PAIR: {
    name: 'Volatile Pair',
    description: 'Wide spread for volatile pairs (2% spread)',
    mode: SpreadMode.GEOMETRIC,
    levelsPerSide: 32,
    spreadBps: 200,
    geomRatio: GEOM_RATIO_SCALE + 10000n, // 1.01 ratio
    sideBias: SideBias.BOTH,
  },
  /** Aggressive bid-side for accumulation */
  ACCUMULATE: {
    name: 'Accumulate',
    description: 'Bid-heavy grid for accumulating base token',
    mode: SpreadMode.ARITHMETIC,
    levelsPerSide: 30,
    spreadBps: 100,
    sideBias: SideBias.BID_ONLY,
  },
  /** Aggressive ask-side for distribution */
  DISTRIBUTE: {
    name: 'Distribute',
    description: 'Ask-heavy grid for distributing base token',
    mode: SpreadMode.ARITHMETIC,
    levelsPerSide: 30,
    spreadBps: 100,
    sideBias: SideBias.ASK_ONLY,
  },
};

// ============================================================================
// LP Helper Class
// ============================================================================

/**
 * High-level LP helper for managing liquidity positions.
 */
export class LPHelper {
  private markets: MarketsSDK;
  private tokens: TokensSDK;

  constructor(markets: MarketsSDK, tokens: TokensSDK) {
    this.markets = markets;
    this.tokens = tokens;
  }

  // ==========================================================================
  // Grid Creation
  // ==========================================================================

  /**
   * Create a grid from a preset.
   */
  async createGridFromPreset(
    marketId: MarketId,
    presetName: keyof typeof GRID_PRESETS,
    centerPrice: bigint,
    totalBaseSize: bigint,
    options?: WaitOptions
  ): Promise<SdkResult<CreateGridResult>> {
    const preset = GRID_PRESETS[presetName];
    if (!preset) {
      return {
        success: false,
        error: `Unknown preset: ${presetName}`,
        code: 'INVALID_INPUT',
      };
    }

    const halfWidth = (centerPrice * BigInt(preset.spreadBps)) / 10000n;

    return this.markets.createGrid({
      marketId,
      centerPrice,
      halfWidth,
      levelsPerSide: preset.levelsPerSide,
      mode: preset.mode,
      geomRatio: preset.geomRatio,
      totalBaseSize,
      sideBias: preset.sideBias,
    }, options);
  }

  /**
   * Create a custom grid with validation.
   */
  async createCustomGrid(
    params: CreateGridSdkParams,
    options?: WaitOptions
  ): Promise<SdkResult<CreateGridResult>> {
    // Validate parameters
    const validation = this.validateGridParams(params);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        code: 'INVALID_INPUT',
      };
    }

    return this.markets.createGrid(params, options);
  }

  /**
   * Validate grid parameters before creation.
   */
  validateGridParams(params: CreateGridSdkParams): { valid: boolean; error?: string } {
    if (params.centerPrice <= 0n) {
      return { valid: false, error: 'Center price must be positive' };
    }

    if (params.halfWidth <= 0n) {
      return { valid: false, error: 'Half width must be positive' };
    }

    if (params.halfWidth >= params.centerPrice) {
      return { valid: false, error: 'Half width must be less than center price' };
    }

    if (params.levelsPerSide <= 0 || params.levelsPerSide > MAX_LEVELS_PER_SIDE) {
      return { valid: false, error: `Levels per side must be 1-${MAX_LEVELS_PER_SIDE}` };
    }

    if (params.totalBaseSize <= 0n) {
      return { valid: false, error: 'Total base size must be positive' };
    }

    if (params.mode === SpreadMode.GEOMETRIC) {
      if (!params.geomRatio || params.geomRatio <= GEOM_RATIO_SCALE) {
        return { valid: false, error: 'Geometric ratio must be > 1.0' };
      }
    }

    return { valid: true };
  }

  // ==========================================================================
  // Position Tracking
  // ==========================================================================

  /**
   * Get all LP positions for the current user.
   */
  async getMyPositions(marketId?: MarketId): Promise<SdkResult<LPPosition[]>> {
    const gridsResult = await this.markets.getMyGrids(marketId);

    if (!gridsResult.success || !gridsResult.data) {
      return {
        success: false,
        error: gridsResult.error,
        code: gridsResult.code,
      };
    }

    // For each grid, calculate position details
    const positions: LPPosition[] = [];

    for (const grid of gridsResult.data) {
      // Get market info for token IDs
      const marketResult = await this.markets.getMarket(grid.marketId);
      if (!marketResult.success || !marketResult.data) {
        continue;
      }

      const position: LPPosition = {
        gridId: grid.gridId as GridId,
        marketId: grid.marketId as MarketId,
        baseTokenId: marketResult.data.baseTokenId as TokenId,
        quoteTokenId: marketResult.data.quoteTokenId as TokenId,
        baseInOrders: 0n, // Would need to sum from orders
        quoteInOrders: 0n,
        baseEarned: 0n,
        quoteEarned: 0n,
        activeOrders: grid.orderIds.length,
        status: grid.status,
        createdAt: grid.createdAt,
      };

      positions.push(position);
    }

    return { success: true, data: positions };
  }

  /**
   * Get position details for a specific grid.
   */
  async getPosition(gridId: GridId): Promise<SdkResult<LPPosition>> {
    const gridResult = await this.markets.getGrid(gridId);

    if (!gridResult.success || !gridResult.data) {
      return {
        success: false,
        error: gridResult.error,
        code: gridResult.code,
      };
    }

    const grid = gridResult.data;

    const marketResult = await this.markets.getMarket(grid.marketId as MarketId);
    if (!marketResult.success || !marketResult.data) {
      return {
        success: false,
        error: 'Failed to get market info',
        code: 'NOT_FOUND',
      };
    }

    return {
      success: true,
      data: {
        gridId: grid.gridId as GridId,
        marketId: grid.marketId as MarketId,
        baseTokenId: marketResult.data.baseTokenId as TokenId,
        quoteTokenId: marketResult.data.quoteTokenId as TokenId,
        baseInOrders: 0n,
        quoteInOrders: 0n,
        baseEarned: 0n,
        quoteEarned: 0n,
        activeOrders: grid.orderIds.length,
        status: grid.status,
        createdAt: grid.createdAt,
      },
    };
  }

  // ==========================================================================
  // PnL Calculation
  // ==========================================================================

  /**
   * Calculate PnL for a position.
   */
  async calculatePnL(
    gridId: GridId,
    currentPrice: bigint
  ): Promise<SdkResult<LPPnL>> {
    // This would require:
    // 1. Getting the grid's initial state
    // 2. Summing all trades associated with the grid
    // 3. Calculating current position value
    // 4. Computing impermanent loss

    return {
      success: false,
      error: 'PnL calculation requires historical data integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Grid Management
  // ==========================================================================

  /**
   * Cancel a grid and return all funds.
   */
  async cancelGrid(
    gridId: GridId,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    return this.markets.cancelGrid(gridId, options);
  }

  /**
   * Pause a grid (stop new fills, keep orders).
   */
  async pauseGrid(
    gridId: GridId,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    return this.markets.pauseGrid(gridId, options);
  }

  /**
   * Resume a paused grid.
   */
  async resumeGrid(
    gridId: GridId,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    return this.markets.resumeGrid(gridId, options);
  }

  /**
   * Get rebalance suggestion for a grid.
   */
  async getRebalanceSuggestion(
    gridId: GridId,
    currentPrice: bigint
  ): Promise<SdkResult<RebalanceSuggestion | null>> {
    const gridResult = await this.markets.getGrid(gridId);

    if (!gridResult.success || !gridResult.data) {
      return {
        success: false,
        error: gridResult.error,
        code: gridResult.code,
      };
    }

    const grid = gridResult.data;
    const config = grid.config;

    // Calculate how far price has moved from center
    const priceDiff = currentPrice > config.centerPrice
      ? currentPrice - config.centerPrice
      : config.centerPrice - currentPrice;

    const utilizationPct = Number((priceDiff * 100n) / config.halfWidth);

    // Suggest rebalance if price has moved beyond 80% of grid width
    if (utilizationPct < 80) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        reason: `Price has moved ${utilizationPct}% from center`,
        suggestedCenterPrice: currentPrice,
        suggestedHalfWidth: config.halfWidth,
        currentUtilization: utilizationPct,
        estimatedGasCost: 100000n, // Placeholder
      },
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Calculate optimal grid parameters for a target APY.
   */
  calculateOptimalParams(
    targetApyBps: number,
    expectedVolatilityBps: number,
    dailyVolume: bigint,
    liquidityAmount: bigint
  ): CreateGridSdkParams | null {
    // This is a simplified calculation
    // Real implementation would use more sophisticated models

    // Higher volatility = wider spread
    const spreadBps = Math.max(expectedVolatilityBps / 10, 10);

    // More levels for higher volume
    const levelsPerSide = Math.min(
      Math.max(Math.floor(Number(dailyVolume / liquidityAmount) * 10), 5),
      MAX_LEVELS_PER_SIDE
    );

    return {
      marketId: '' as MarketId, // To be filled
      centerPrice: 0n, // To be filled
      halfWidth: 0n, // To be calculated
      levelsPerSide,
      mode: expectedVolatilityBps > 500 ? SpreadMode.GEOMETRIC : SpreadMode.ARITHMETIC,
      geomRatio: expectedVolatilityBps > 500 ? GEOM_RATIO_SCALE + BigInt(spreadBps) : undefined,
      totalBaseSize: liquidityAmount,
      sideBias: SideBias.BOTH,
    };
  }

  /**
   * Estimate fees earned over a period.
   */
  estimateFees(
    gridValue: bigint,
    marketFeeBps: number,
    expectedTurnover: number // Times per day the grid turns over
  ): {
    dailyFees: bigint;
    weeklyFees: bigint;
    monthlyFees: bigint;
    apyBps: number;
  } {
    const dailyFees = (gridValue * BigInt(marketFeeBps) * BigInt(expectedTurnover)) / 10000n;
    const weeklyFees = dailyFees * 7n;
    const monthlyFees = dailyFees * 30n;
    const yearlyFees = dailyFees * 365n;

    const apyBps = Number((yearlyFees * 10000n) / gridValue);

    return { dailyFees, weeklyFees, monthlyFees, apyBps };
  }
}

/**
 * Create an LP helper instance.
 */
export function createLPHelper(markets: MarketsSDK, tokens: TokensSDK): LPHelper {
  return new LPHelper(markets, tokens);
}
