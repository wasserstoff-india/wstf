/**
 * Markets Module - Chaos/Adversarial Tests
 *
 * Tests edge cases, race conditions, and adversarial inputs for the orderbook system.
 * Follows patterns from tokens/chaos.test.ts and vars/chaos.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryMarketStore,
  MarketNotFoundError,
  OrderNotFoundError,
  MarketConcurrencyError,
  InsufficientEscrowError,
} from './store';
import {
  MarketId,
  OrderId,
  GridId,
  Market,
  Order,
  LiquidityGrid,
  PriceLevel,
  TopOfBook,
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
import { makeTokenId, TokenId } from '../tokens/types';

describe('Markets Chaos Tests', () => {
  let store: InMemoryMarketStore;
  const baseToken = makeTokenId('BASE');
  const quoteToken = makeTokenId('QUOTE');
  const user1 = 'user1';
  const user2 = 'user2';
  const user3 = 'user3';

  beforeEach(() => {
    store = new InMemoryMarketStore();
  });

  // ============================================================================
  // Market Creation Edge Cases
  // ============================================================================

  describe('Market Creation', () => {
    it('should reject duplicate market creation', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      const market: Market = {
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      };

      await store.createMarket(market);

      await expect(store.createMarket(market)).rejects.toThrow(/already exists/);
    });

    it('should validate market params - same base and quote', () => {
      const error = validateMarketParams({
        baseTokenId: baseToken,
        quoteTokenId: baseToken, // Same as base
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
      });
      expect(error).toContain('base and quote tokens must differ');
    });

    it('should validate market params - zero tick size', () => {
      const error = validateMarketParams({
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 0n,
        lotSize: 1n,
        feeBps: 30,
      });
      expect(error).toContain('tickSize must be positive');
    });

    it('should validate market params - negative tick size', () => {
      const error = validateMarketParams({
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: -1n,
        lotSize: 1n,
        feeBps: 30,
      });
      expect(error).toContain('tickSize must be positive');
    });

    it('should validate market params - fee too high', () => {
      const error = validateMarketParams({
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 10001, // > 100%
      });
      expect(error).toContain('feeBps must be 0-10000');
    });
  });

  // ============================================================================
  // Order Placement Edge Cases
  // ============================================================================

  describe('Order Placement', () => {
    let marketId: MarketId;
    let market: Market;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
      market = {
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 100n,
        lotSize: 10n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      };
      await store.createMarket(market);
    });

    it('should reject order with price not aligned to tick', () => {
      const error = validateOrderParams({
        marketId,
        side: 'bid',
        price: 150n, // Not aligned to tickSize 100
        size: 100n,
      }, market);
      expect(error).toContain('price must be multiple of tickSize');
    });

    it('should reject order with size not aligned to lot', () => {
      const error = validateOrderParams({
        marketId,
        side: 'bid',
        price: 100n,
        size: 15n, // Not aligned to lotSize 10
      }, market);
      expect(error).toContain('size must be multiple of lotSize');
    });

    it('should reject zero price order', () => {
      const error = validateOrderParams({
        marketId,
        side: 'bid',
        price: 0n,
        size: 100n,
      }, market);
      expect(error).toContain('price must be positive');
    });

    it('should reject zero size order', () => {
      const error = validateOrderParams({
        marketId,
        side: 'bid',
        price: 100n,
        size: 0n,
      }, market);
      expect(error).toContain('size must be positive');
    });

    it('should handle duplicate order IDs gracefully', async () => {
      const orderId = makeOrderId(marketId, user1, 1n);
      const order: Order = {
        orderId,
        marketId,
        owner: user1,
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      };

      await store.createOrder(order);
      await expect(store.createOrder(order)).rejects.toThrow(/already exists/);
    });
  });

  // ============================================================================
  // Concurrency Control Tests
  // ============================================================================

  describe('Optimistic Concurrency Control', () => {
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
      const market: Market = {
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      };
      await store.createMarket(market);
    });

    it('should reject market update with stale version', async () => {
      // First update succeeds
      await store.updateMarket(marketId, { status: 'paused' }, 1n);

      // Second update with old version fails
      await expect(
        store.updateMarket(marketId, { status: 'active' }, 1n)
      ).rejects.toThrow(MarketConcurrencyError);
    });

    it('should reject order update with stale version', async () => {
      const orderId = makeOrderId(marketId, user1, 1n);
      const order: Order = {
        orderId,
        marketId,
        owner: user1,
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      };
      await store.createOrder(order);

      // First update succeeds
      await store.updateOrder(orderId, { remaining: 50n }, 1n);

      // Second update with old version fails
      await expect(
        store.updateOrder(orderId, { remaining: 25n }, 1n)
      ).rejects.toThrow(MarketConcurrencyError);
    });

    it('should increment version on each update', async () => {
      let market = await store.getMarket(marketId);
      expect(market?.version).toBe(1n);

      await store.updateMarket(marketId, { feeBps: 50 }, 1n);
      market = await store.getMarket(marketId);
      expect(market?.version).toBe(2n);

      await store.updateMarket(marketId, { feeBps: 100 }, 2n);
      market = await store.getMarket(marketId);
      expect(market?.version).toBe(3n);
    });
  });

  // ============================================================================
  // Escrow Edge Cases
  // ============================================================================

  describe('Escrow Operations', () => {
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
      const market: Market = {
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      };
      await store.createMarket(market);
    });

    it('should reject negative escrow on non-existent account', async () => {
      await expect(
        store.adjustEscrow(marketId, user1, baseToken, -100n)
      ).rejects.toThrow(InsufficientEscrowError);
    });

    it('should reject overdraw from existing escrow', async () => {
      await store.adjustEscrow(marketId, user1, baseToken, 100n);

      await expect(
        store.adjustEscrow(marketId, user1, baseToken, -150n)
      ).rejects.toThrow(InsufficientEscrowError);
    });

    it('should allow exact withdrawal of escrow', async () => {
      await store.adjustEscrow(marketId, user1, baseToken, 100n);
      await store.adjustEscrow(marketId, user1, baseToken, -100n);

      const escrow = await store.getEscrow(marketId, user1, baseToken);
      expect(escrow).toBeUndefined(); // Cleaned up when zero
    });

    it('should track escrow per user and token', async () => {
      await store.adjustEscrow(marketId, user1, baseToken, 100n);
      await store.adjustEscrow(marketId, user1, quoteToken, 200n);
      await store.adjustEscrow(marketId, user2, baseToken, 300n);

      const e1b = await store.getEscrow(marketId, user1, baseToken);
      const e1q = await store.getEscrow(marketId, user1, quoteToken);
      const e2b = await store.getEscrow(marketId, user2, baseToken);

      expect(e1b?.lockedAmount).toBe(100n);
      expect(e1q?.lockedAmount).toBe(200n);
      expect(e2b?.lockedAmount).toBe(300n);
    });
  });

  // ============================================================================
  // Price Level Tests
  // ============================================================================

  describe('Price Level Management', () => {
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
      const market: Market = {
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      };
      await store.createMarket(market);
    });

    it('should sort bid levels highest first', async () => {
      await store.setLevel({
        marketId,
        side: 'bid',
        price: 100n,
        aggregate: 10n,
        orderIds: [makeOrderId(marketId, user1, 1n)],
        version: 1n,
      });
      await store.setLevel({
        marketId,
        side: 'bid',
        price: 200n,
        aggregate: 20n,
        orderIds: [makeOrderId(marketId, user1, 2n)],
        version: 1n,
      });
      await store.setLevel({
        marketId,
        side: 'bid',
        price: 150n,
        aggregate: 15n,
        orderIds: [makeOrderId(marketId, user1, 3n)],
        version: 1n,
      });

      const levels = await store.getLevelsByMarket(marketId, 'bid');
      expect(levels.length).toBe(3);
      expect(levels[0].price).toBe(200n); // Highest first
      expect(levels[1].price).toBe(150n);
      expect(levels[2].price).toBe(100n);
    });

    it('should sort ask levels lowest first', async () => {
      await store.setLevel({
        marketId,
        side: 'ask',
        price: 100n,
        aggregate: 10n,
        orderIds: [makeOrderId(marketId, user1, 1n)],
        version: 1n,
      });
      await store.setLevel({
        marketId,
        side: 'ask',
        price: 200n,
        aggregate: 20n,
        orderIds: [makeOrderId(marketId, user1, 2n)],
        version: 1n,
      });
      await store.setLevel({
        marketId,
        side: 'ask',
        price: 150n,
        aggregate: 15n,
        orderIds: [makeOrderId(marketId, user1, 3n)],
        version: 1n,
      });

      const levels = await store.getLevelsByMarket(marketId, 'ask');
      expect(levels.length).toBe(3);
      expect(levels[0].price).toBe(100n); // Lowest first
      expect(levels[1].price).toBe(150n);
      expect(levels[2].price).toBe(200n);
    });

    it('should respect depth limit', async () => {
      for (let i = 0; i < 10; i++) {
        await store.setLevel({
          marketId,
          side: 'bid',
          price: BigInt(100 + i * 10),
          aggregate: 10n,
          orderIds: [makeOrderId(marketId, user1, BigInt(i))],
          version: 1n,
        });
      }

      const levels = await store.getLevelsByMarket(marketId, 'bid', 3);
      expect(levels.length).toBe(3);
      // Should be top 3 prices
      expect(levels[0].price).toBe(190n);
      expect(levels[1].price).toBe(180n);
      expect(levels[2].price).toBe(170n);
    });
  });

  // ============================================================================
  // Grid Parameter Validation
  // ============================================================================

  describe('Grid Validation', () => {
    it('should reject grid with zero center price', () => {
      const error = validateGridParams({
        marketId: makeMarketId(baseToken, quoteToken),
        centerPrice: 0n,
        halfWidth: 100n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 1000n,
        sideBias: 'both',
      });
      expect(error).toContain('centerPrice must be positive');
    });

    it('should reject grid with zero half width', () => {
      const error = validateGridParams({
        marketId: makeMarketId(baseToken, quoteToken),
        centerPrice: 1000n,
        halfWidth: 0n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 1000n,
        sideBias: 'both',
      });
      expect(error).toContain('halfWidth must be positive');
    });

    it('should reject grid with too many levels', () => {
      const error = validateGridParams({
        marketId: makeMarketId(baseToken, quoteToken),
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: MAX_LEVELS_PER_SIDE + 1,
        mode: 'arith',
        totalBaseSize: 1000n,
        sideBias: 'both',
      });
      expect(error).toContain('levelsPerSide exceeds max');
    });

    it('should require geomRatio for geometric mode', () => {
      const error = validateGridParams({
        marketId: makeMarketId(baseToken, quoteToken),
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: 5,
        mode: 'geom',
        totalBaseSize: 1000n,
        sideBias: 'both',
        // Missing geomRatio
      });
      expect(error).toContain('geomRatio required for geometric mode');
    });

    it('should reject geomRatio <= 1.0', () => {
      const error = validateGridParams({
        marketId: makeMarketId(baseToken, quoteToken),
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: 5,
        mode: 'geom',
        totalBaseSize: 1000n,
        sideBias: 'both',
        geomRatio: GEOM_RATIO_SCALE, // 1.0 exactly
      });
      expect(error).toContain('geomRatio must be > 1.0');
    });

    it('should reject geomRatio > 2.0', () => {
      const error = validateGridParams({
        marketId: makeMarketId(baseToken, quoteToken),
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: 5,
        mode: 'geom',
        totalBaseSize: 1000n,
        sideBias: 'both',
        geomRatio: GEOM_RATIO_SCALE * 2n + 1n, // > 2.0
      });
      expect(error).toContain('geomRatio too large');
    });
  });

  // ============================================================================
  // Arithmetic Helpers
  // ============================================================================

  describe('Arithmetic Helpers', () => {
    it('should align price to tick correctly', () => {
      expect(alignToTick(1050n, 100n)).toBe(1000n);
      expect(alignToTick(1099n, 100n)).toBe(1000n);
      expect(alignToTick(1100n, 100n)).toBe(1100n);
      expect(alignToTick(1n, 10n)).toBe(0n);
      expect(alignToTick(15n, 10n)).toBe(10n);
    });

    it('should calculate quote amount correctly', () => {
      expect(calcQuoteAmount(100n, 50n)).toBe(5000n);
      expect(calcQuoteAmount(1000000n, 1000000n)).toBe(1000000000000n);
      expect(calcQuoteAmount(0n, 100n)).toBe(0n);
      expect(calcQuoteAmount(100n, 0n)).toBe(0n);
    });

    it('should calculate fee correctly', () => {
      // 30 bps = 0.3%
      expect(calcFee(10000n, 30)).toBe(30n);
      // 100 bps = 1%
      expect(calcFee(10000n, 100)).toBe(100n);
      // 10000 bps = 100%
      expect(calcFee(10000n, 10000)).toBe(10000n);
      // 0 bps
      expect(calcFee(10000n, 0)).toBe(0n);
    });
  });

  // ============================================================================
  // Trade Recording
  // ============================================================================

  describe('Trade Recording', () => {
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
      const market: Market = {
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      };
      await store.createMarket(market);
    });

    it('should record and retrieve trades', async () => {
      const tradeId = makeTradeId(marketId, 1n, 0);
      await store.recordTrade({
        tradeId,
        marketId,
        makerOrderId: makeOrderId(marketId, user1, 1n),
        makerAddress: user1,
        takerOrderId: makeOrderId(marketId, user2, 1n),
        takerAddress: user2,
        side: 'bid',
        price: 1000n,
        size: 100n,
        quoteAmount: 100000n,
        takerFee: 30n,
        makerFee: 0n,
        height: 1n,
        timestamp: 1000n,
      });

      const trade = await store.getTrade(tradeId);
      expect(trade).toBeDefined();
      expect(trade?.price).toBe(1000n);
      expect(trade?.size).toBe(100n);
    });

    it('should sort trades by height descending', async () => {
      for (let i = 0; i < 5; i++) {
        await store.recordTrade({
          tradeId: makeTradeId(marketId, BigInt(i), 0),
          marketId,
          makerOrderId: makeOrderId(marketId, user1, BigInt(i)),
          makerAddress: user1,
          takerOrderId: makeOrderId(marketId, user2, BigInt(i)),
          takerAddress: user2,
          side: 'bid',
          price: 1000n + BigInt(i),
          size: 100n,
          quoteAmount: 100000n,
          takerFee: 30n,
          makerFee: 0n,
          height: BigInt(i),
          timestamp: BigInt(1000 + i),
        });
      }

      const trades = await store.getTradesByMarket(marketId);
      expect(trades.length).toBe(5);
      // Should be sorted by height descending (newest first)
      expect(trades[0].height).toBe(4n);
      expect(trades[4].height).toBe(0n);
    });

    it('should filter trades by afterHeight', async () => {
      for (let i = 0; i < 5; i++) {
        await store.recordTrade({
          tradeId: makeTradeId(marketId, BigInt(i), 0),
          marketId,
          makerOrderId: makeOrderId(marketId, user1, BigInt(i)),
          makerAddress: user1,
          takerOrderId: makeOrderId(marketId, user2, BigInt(i)),
          takerAddress: user2,
          side: 'bid',
          price: 1000n,
          size: 100n,
          quoteAmount: 100000n,
          takerFee: 30n,
          makerFee: 0n,
          height: BigInt(i),
          timestamp: BigInt(1000 + i),
        });
      }

      const trades = await store.getTradesByMarket(marketId, undefined, 2n);
      expect(trades.length).toBe(2); // Only heights 3 and 4
      expect(trades[0].height).toBe(4n);
      expect(trades[1].height).toBe(3n);
    });
  });

  // ============================================================================
  // Grid Operations
  // ============================================================================

  describe('Grid Operations', () => {
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
      const market: Market = {
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      };
      await store.createMarket(market);
    });

    it('should create and retrieve grid', async () => {
      const gridId = makeGridId(marketId, user1, 1n);
      const grid: LiquidityGrid = {
        gridId,
        marketId,
        owner: user1,
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 1000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      };

      await store.createGrid(grid);

      const retrieved = await store.getGrid(gridId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.centerPrice).toBe(1000n);
      expect(retrieved?.levelsPerSide).toBe(5);
    });

    it('should list grids by market', async () => {
      await store.createGrid({
        gridId: makeGridId(marketId, user1, 1n),
        marketId,
        owner: user1,
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 1000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });

      await store.createGrid({
        gridId: makeGridId(marketId, user2, 1n),
        marketId,
        owner: user2,
        centerPrice: 2000n,
        halfWidth: 200n,
        levelsPerSide: 10,
        mode: 'geom',
        geomRatio: GEOM_RATIO_SCALE + 1000n,
        totalBaseSize: 2000n,
        sideBias: 'ask_only',
        status: 'active',
        orderIds: [],
        createdAt: 2n,
        version: 1n,
      });

      const grids = await store.getGridsByMarket(marketId);
      expect(grids.length).toBe(2);
    });

    it('should list grids by owner', async () => {
      const marketId2 = makeMarketId(quoteToken, baseToken);
      await store.createMarket({
        marketId: marketId2,
        baseTokenId: quoteToken,
        quoteTokenId: baseToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      });

      await store.createGrid({
        gridId: makeGridId(marketId, user1, 1n),
        marketId,
        owner: user1,
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 1000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });

      await store.createGrid({
        gridId: makeGridId(marketId2, user1, 1n),
        marketId: marketId2,
        owner: user1,
        centerPrice: 500n,
        halfWidth: 50n,
        levelsPerSide: 3,
        mode: 'arith',
        totalBaseSize: 500n,
        sideBias: 'bid_only',
        status: 'active',
        orderIds: [],
        createdAt: 2n,
        version: 1n,
      });

      const grids = await store.getGridsByOwner(user1);
      expect(grids.length).toBe(2);
    });
  });

  // ============================================================================
  // Not Found Cases
  // ============================================================================

  describe('Not Found Cases', () => {
    it('should return undefined for non-existent market', async () => {
      const market = await store.getMarket(makeMarketId(baseToken, quoteToken));
      expect(market).toBeUndefined();
    });

    it('should return undefined for non-existent order', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      const order = await store.getOrder(makeOrderId(marketId, user1, 1n));
      expect(order).toBeUndefined();
    });

    it('should return undefined for non-existent grid', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      const grid = await store.getGrid(makeGridId(marketId, user1, 1n));
      expect(grid).toBeUndefined();
    });

    it('should throw on update of non-existent market', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      await expect(
        store.updateMarket(marketId, { status: 'paused' }, 1n)
      ).rejects.toThrow(MarketNotFoundError);
    });

    it('should throw on update of non-existent order', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      const orderId = makeOrderId(marketId, user1, 1n);
      await expect(
        store.updateOrder(orderId, { remaining: 50n }, 1n)
      ).rejects.toThrow(OrderNotFoundError);
    });
  });

  // ============================================================================
  // Clone Isolation
  // ============================================================================

  describe('Clone Isolation', () => {
    it('should isolate returned markets from store', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      await store.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 100n,
        lotSize: 10n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      });

      const market1 = await store.getMarket(marketId);
      const market2 = await store.getMarket(marketId);

      // Modify one
      if (market1) {
        (market1 as any).feeBps = 999;
      }

      // Other should be unchanged
      expect(market2?.feeBps).toBe(30);
    });

    it('should isolate returned orders from store', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      await store.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      });

      const orderId = makeOrderId(marketId, user1, 1n);
      await store.createOrder({
        orderId,
        marketId,
        owner: user1,
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      });

      const order1 = await store.getOrder(orderId);
      const order2 = await store.getOrder(orderId);

      // Modify one
      if (order1) {
        (order1 as any).remaining = 0n;
      }

      // Other should be unchanged
      expect(order2?.remaining).toBe(100n);
    });
  });

  // ============================================================================
  // Stress: Many Orders at Same Price
  // ============================================================================

  describe('Stress Tests', () => {
    it('should handle many orders at same price level', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      await store.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      });

      const orderIds: OrderId[] = [];
      for (let i = 0; i < 100; i++) {
        const orderId = makeOrderId(marketId, user1, BigInt(i));
        orderIds.push(orderId);
        await store.createOrder({
          orderId,
          marketId,
          owner: user1,
          side: 'bid',
          price: 1000n, // Same price
          size: 10n,
          remaining: 10n,
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });
      }

      // Create a single level with all order IDs
      await store.setLevel({
        marketId,
        side: 'bid',
        price: 1000n,
        aggregate: 1000n, // 100 * 10
        orderIds,
        version: 1n,
      });

      const level = await store.getLevel(marketId, 'bid', 1000n);
      expect(level?.orderIds.length).toBe(100);
      expect(level?.aggregate).toBe(1000n);
    });

    it('should handle many price levels', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      await store.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      });

      // Create 200 price levels
      for (let i = 0; i < 200; i++) {
        await store.setLevel({
          marketId,
          side: 'bid',
          price: BigInt(1000 + i),
          aggregate: 10n,
          orderIds: [makeOrderId(marketId, user1, BigInt(i))],
          version: 1n,
        });
      }

      const allLevels = await store.getLevelsByMarket(marketId, 'bid');
      expect(allLevels.length).toBe(200);

      // Top 10 should be highest prices
      const top10 = await store.getLevelsByMarket(marketId, 'bid', 10);
      expect(top10.length).toBe(10);
      expect(top10[0].price).toBe(1199n); // Highest
    });
  });

  // ============================================================================
  // Clear State
  // ============================================================================

  describe('Clear State', () => {
    it('should clear all state', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      await store.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      });

      const orderId = makeOrderId(marketId, user1, 1n);
      await store.createOrder({
        orderId,
        marketId,
        owner: user1,
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      });

      store.clear();

      expect(await store.getMarket(marketId)).toBeUndefined();
      expect(await store.getOrder(orderId)).toBeUndefined();
      expect((await store.listMarkets()).length).toBe(0);
    });
  });
});
