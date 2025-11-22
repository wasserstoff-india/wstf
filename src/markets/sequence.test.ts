/**
 * Markets Module - Sequence & Metamorphic Tests
 *
 * Tests that equivalent operation sequences produce consistent results:
 * - Commutative sequences give same final state
 * - Scaling all sizes maintains ratios
 * - Order independence where expected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryMarketStore,
} from './store';
import {
  MarketId,
  OrderId,
  GridId,
  Market,
  Order,
  PriceLevel,
  makeMarketId,
  makeOrderId,
  makeGridId,
  makeTradeId,
  calcQuoteAmount,
  calcFee,
} from './types';
import { makeTokenId } from '../tokens/types';

describe('Markets Sequence & Metamorphic Tests', () => {
  const baseToken = makeTokenId('BASE');
  const quoteToken = makeTokenId('QUOTE');

  // Helper to create a fresh market
  async function createMarket(store: InMemoryMarketStore): Promise<MarketId> {
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 100n,
      lotSize: 10n,
      feeBps: 30,
      status: 'active',
      creator: 'creator',
      createdAtHeight: 1n,
      version: 1n,
    });
    return marketId;
  }

  // Helper to compare store states
  async function getMarketState(store: InMemoryMarketStore, marketId: MarketId) {
    const market = await store.getMarket(marketId);
    const bidLevels = await store.getLevelsByMarket(marketId, 'bid');
    const askLevels = await store.getLevelsByMarket(marketId, 'ask');
    const top = await store.getTopOfBook(marketId);
    const grids = await store.getGridsByMarket(marketId);
    return { market, bidLevels, askLevels, top, grids };
  }

  // ============================================================================
  // 2.1 Commutativity Tests
  // ============================================================================

  describe('Commutativity - Cancel and Remove Order Sequences', () => {
    it('should produce same state regardless of cancel order sequence', async () => {
      // Run sequence A: cancel order 1, then order 2
      const storeA = new InMemoryMarketStore();
      const marketIdA = await createMarket(storeA);

      const order1A = makeOrderId(marketIdA, 'user1', 1n);
      const order2A = makeOrderId(marketIdA, 'user1', 2n);

      await storeA.createOrder({
        orderId: order1A,
        marketId: marketIdA,
        owner: 'user1',
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      });

      await storeA.createOrder({
        orderId: order2A,
        marketId: marketIdA,
        owner: 'user1',
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 2n,
        flags: [],
        version: 1n,
      });

      // Cancel in order 1, 2
      await storeA.updateOrder(order1A, { status: 'cancelled', remaining: 0n }, 1n);
      await storeA.updateOrder(order2A, { status: 'cancelled', remaining: 0n }, 1n);

      // Run sequence B: cancel order 2, then order 1
      const storeB = new InMemoryMarketStore();
      const marketIdB = await createMarket(storeB);

      const order1B = makeOrderId(marketIdB, 'user1', 1n);
      const order2B = makeOrderId(marketIdB, 'user1', 2n);

      await storeB.createOrder({
        orderId: order1B,
        marketId: marketIdB,
        owner: 'user1',
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      });

      await storeB.createOrder({
        orderId: order2B,
        marketId: marketIdB,
        owner: 'user1',
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 2n,
        flags: [],
        version: 1n,
      });

      // Cancel in order 2, 1
      await storeB.updateOrder(order2B, { status: 'cancelled', remaining: 0n }, 1n);
      await storeB.updateOrder(order1B, { status: 'cancelled', remaining: 0n }, 1n);

      // Compare: both orders should be cancelled in both stores
      const o1A = await storeA.getOrder(order1A);
      const o2A = await storeA.getOrder(order2A);
      const o1B = await storeB.getOrder(order1B);
      const o2B = await storeB.getOrder(order2B);

      expect(o1A?.status).toBe('cancelled');
      expect(o2A?.status).toBe('cancelled');
      expect(o1B?.status).toBe('cancelled');
      expect(o2B?.status).toBe('cancelled');
    });

    it('should produce same escrow state after same total deposit/withdrawal regardless of order', async () => {
      // Sequence A: +100, -30, +50, -70, -50
      const storeA = new InMemoryMarketStore();
      const marketIdA = await createMarket(storeA);

      await storeA.adjustEscrow(marketIdA, 'user1', baseToken, 100n);
      await storeA.adjustEscrow(marketIdA, 'user1', baseToken, -30n);
      await storeA.adjustEscrow(marketIdA, 'user1', baseToken, 50n);
      await storeA.adjustEscrow(marketIdA, 'user1', baseToken, -70n);
      await storeA.adjustEscrow(marketIdA, 'user1', baseToken, -50n);

      const escrowA = await storeA.getEscrow(marketIdA, 'user1', baseToken);

      // Sequence B: same operations, different order (preserving non-negative constraint)
      const storeB = new InMemoryMarketStore();
      const marketIdB = await createMarket(storeB);

      await storeB.adjustEscrow(marketIdB, 'user1', baseToken, 50n);
      await storeB.adjustEscrow(marketIdB, 'user1', baseToken, 100n);
      await storeB.adjustEscrow(marketIdB, 'user1', baseToken, -30n);
      await storeB.adjustEscrow(marketIdB, 'user1', baseToken, -50n);
      await storeB.adjustEscrow(marketIdB, 'user1', baseToken, -70n);

      const escrowB = await storeB.getEscrow(marketIdB, 'user1', baseToken);

      // Both should have final amount of 0 (100 - 30 + 50 - 70 - 50 = 0)
      expect(escrowA).toBeUndefined(); // Cleaned up when 0
      expect(escrowB).toBeUndefined();
    });
  });

  // ============================================================================
  // 2.2 Partial Removes Commutativity
  // ============================================================================

  describe('Partial Removes Commutativity', () => {
    it('should have same final escrow after equivalent partial removes', async () => {
      // Sequence A: +100, -30, -70
      const storeA = new InMemoryMarketStore();
      const marketIdA = await createMarket(storeA);

      await storeA.adjustEscrow(marketIdA, 'lp1', baseToken, 100n);
      await storeA.adjustEscrow(marketIdA, 'lp1', baseToken, -30n);
      await storeA.adjustEscrow(marketIdA, 'lp1', baseToken, -70n);

      // Sequence B: +100, -70, -30
      const storeB = new InMemoryMarketStore();
      const marketIdB = await createMarket(storeB);

      await storeB.adjustEscrow(marketIdB, 'lp1', baseToken, 100n);
      await storeB.adjustEscrow(marketIdB, 'lp1', baseToken, -70n);
      await storeB.adjustEscrow(marketIdB, 'lp1', baseToken, -30n);

      const escrowA = await storeA.getEscrow(marketIdA, 'lp1', baseToken);
      const escrowB = await storeB.getEscrow(marketIdB, 'lp1', baseToken);

      // Both should be cleaned up (final = 0)
      expect(escrowA).toBeUndefined();
      expect(escrowB).toBeUndefined();
    });

    it('should have same final order state after equivalent partial fills', async () => {
      // Sequence A: fill 30, fill 70
      const storeA = new InMemoryMarketStore();
      const marketIdA = await createMarket(storeA);

      const orderIdA = makeOrderId(marketIdA, 'user1', 1n);
      await storeA.createOrder({
        orderId: orderIdA,
        marketId: marketIdA,
        owner: 'user1',
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      });

      await storeA.updateOrder(orderIdA, { remaining: 70n, status: 'partial' }, 1n);
      await storeA.updateOrder(orderIdA, { remaining: 0n, status: 'filled' }, 2n);

      // Sequence B: fill 70, fill 30
      const storeB = new InMemoryMarketStore();
      const marketIdB = await createMarket(storeB);

      const orderIdB = makeOrderId(marketIdB, 'user1', 1n);
      await storeB.createOrder({
        orderId: orderIdB,
        marketId: marketIdB,
        owner: 'user1',
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      });

      await storeB.updateOrder(orderIdB, { remaining: 30n, status: 'partial' }, 1n);
      await storeB.updateOrder(orderIdB, { remaining: 0n, status: 'filled' }, 2n);

      const orderA = await storeA.getOrder(orderIdA);
      const orderB = await storeB.getOrder(orderIdB);

      expect(orderA?.remaining).toBe(0n);
      expect(orderA?.status).toBe('filled');
      expect(orderB?.remaining).toBe(0n);
      expect(orderB?.status).toBe('filled');
    });
  });

  // ============================================================================
  // 2.3 Metamorphic "Double Everything" Test
  // ============================================================================

  describe('Metamorphic Scaling Tests', () => {
    it('should maintain fee percentage ratio when scaling amounts', async () => {
      const baseAmount = 10000n;
      const scaledAmount = 100000n; // 10x

      const baseFee = calcFee(baseAmount, 30);
      const scaledFee = calcFee(scaledAmount, 30);

      // Fee ratio should match amount ratio
      const amountRatio = Number(scaledAmount) / Number(baseAmount);
      const feeRatio = Number(scaledFee) / Number(baseFee);

      expect(feeRatio).toBeCloseTo(amountRatio, 1);
    });

    it('should maintain quote amount ratio when scaling sizes', async () => {
      const price = 1000n;
      const baseSize = 100n;
      const scaledSize = 1000n; // 10x

      const baseQuote = calcQuoteAmount(price, baseSize);
      const scaledQuote = calcQuoteAmount(price, scaledSize);

      expect(scaledQuote).toBe(baseQuote * 10n);
    });

    it('should maintain proportional level aggregates when scaling order sizes', async () => {
      const store = new InMemoryMarketStore();
      const marketId = await createMarket(store);

      // Create base scenario: 5 orders of 100 each
      const baseOrderSize = 100n;
      const numOrders = 5;
      const orderIds: OrderId[] = [];

      for (let i = 0; i < numOrders; i++) {
        const orderId = makeOrderId(marketId, `user${i}`, 1n);
        orderIds.push(orderId);
        await store.createOrder({
          orderId,
          marketId,
          owner: `user${i}`,
          side: 'bid',
          price: 1000n,
          size: baseOrderSize,
          remaining: baseOrderSize,
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });
      }

      await store.setLevel({
        marketId,
        side: 'bid',
        price: 1000n,
        aggregate: baseOrderSize * BigInt(numOrders),
        orderIds,
        version: 1n,
      });

      const baseLevel = await store.getLevel(marketId, 'bid', 1000n);
      expect(baseLevel?.aggregate).toBe(500n); // 5 * 100

      // Create scaled scenario: 5 orders of 1000 each (10x)
      const storeScaled = new InMemoryMarketStore();
      const marketIdScaled = await createMarket(storeScaled);

      const scaledOrderSize = 1000n;
      const scaledOrderIds: OrderId[] = [];

      for (let i = 0; i < numOrders; i++) {
        const orderId = makeOrderId(marketIdScaled, `user${i}`, 1n);
        scaledOrderIds.push(orderId);
        await storeScaled.createOrder({
          orderId,
          marketId: marketIdScaled,
          owner: `user${i}`,
          side: 'bid',
          price: 1000n,
          size: scaledOrderSize,
          remaining: scaledOrderSize,
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });
      }

      await storeScaled.setLevel({
        marketId: marketIdScaled,
        side: 'bid',
        price: 1000n,
        aggregate: scaledOrderSize * BigInt(numOrders),
        orderIds: scaledOrderIds,
        version: 1n,
      });

      const scaledLevel = await storeScaled.getLevel(marketIdScaled, 'bid', 1000n);
      expect(scaledLevel?.aggregate).toBe(5000n); // 5 * 1000

      // Ratio should be 10x
      expect(scaledLevel!.aggregate).toBe(baseLevel!.aggregate * 10n);
    });
  });

  // ============================================================================
  // Grid Order Independence
  // ============================================================================

  describe('Grid Operations Independence', () => {
    it('should produce same grid state regardless of order creation sequence', async () => {
      // Scenario A: Create grid 1, then grid 2
      const storeA = new InMemoryMarketStore();
      const marketIdA = await createMarket(storeA);

      const grid1A = makeGridId(marketIdA, 'lp1', 1n);
      const grid2A = makeGridId(marketIdA, 'lp2', 1n);

      await storeA.createGrid({
        gridId: grid1A,
        marketId: marketIdA,
        owner: 'lp1',
        centerPrice: 100000n,
        halfWidth: 10000n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 10000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });

      await storeA.createGrid({
        gridId: grid2A,
        marketId: marketIdA,
        owner: 'lp2',
        centerPrice: 105000n,
        halfWidth: 5000n,
        levelsPerSide: 3,
        mode: 'geom',
        geomRatio: 1005000n,
        totalBaseSize: 5000n,
        sideBias: 'ask_only',
        status: 'active',
        orderIds: [],
        createdAt: 2n,
        version: 1n,
      });

      // Scenario B: Create grid 2, then grid 1
      const storeB = new InMemoryMarketStore();
      const marketIdB = await createMarket(storeB);

      const grid1B = makeGridId(marketIdB, 'lp1', 1n);
      const grid2B = makeGridId(marketIdB, 'lp2', 1n);

      await storeB.createGrid({
        gridId: grid2B,
        marketId: marketIdB,
        owner: 'lp2',
        centerPrice: 105000n,
        halfWidth: 5000n,
        levelsPerSide: 3,
        mode: 'geom',
        geomRatio: 1005000n,
        totalBaseSize: 5000n,
        sideBias: 'ask_only',
        status: 'active',
        orderIds: [],
        createdAt: 2n,
        version: 1n,
      });

      await storeB.createGrid({
        gridId: grid1B,
        marketId: marketIdB,
        owner: 'lp1',
        centerPrice: 100000n,
        halfWidth: 10000n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 10000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });

      // Both markets should have same grids
      const gridsA = await storeA.getGridsByMarket(marketIdA);
      const gridsB = await storeB.getGridsByMarket(marketIdB);

      expect(gridsA.length).toBe(2);
      expect(gridsB.length).toBe(2);

      // Find corresponding grids and compare
      const g1A = gridsA.find(g => g.owner === 'lp1');
      const g1B = gridsB.find(g => g.owner === 'lp1');
      const g2A = gridsA.find(g => g.owner === 'lp2');
      const g2B = gridsB.find(g => g.owner === 'lp2');

      expect(g1A?.centerPrice).toBe(g1B?.centerPrice);
      expect(g1A?.levelsPerSide).toBe(g1B?.levelsPerSide);
      expect(g2A?.centerPrice).toBe(g2B?.centerPrice);
      expect(g2A?.mode).toBe(g2B?.mode);
    });
  });

  // ============================================================================
  // Trade Sequence Tests
  // ============================================================================

  describe('Trade Recording Sequence', () => {
    it('should maintain consistent trade history regardless of recording order', async () => {
      const store = new InMemoryMarketStore();
      const marketId = await createMarket(store);

      // Record trades
      const trades = [
        { height: 1n, price: 1000n, size: 100n },
        { height: 2n, price: 1010n, size: 50n },
        { height: 3n, price: 990n, size: 75n },
      ];

      for (let i = 0; i < trades.length; i++) {
        const t = trades[i];
        await store.recordTrade({
          tradeId: makeTradeId(marketId, t.height, 0),
          marketId,
          makerOrderId: makeOrderId(marketId, 'maker', BigInt(i)),
          makerAddress: 'maker',
          takerOrderId: makeOrderId(marketId, 'taker', BigInt(i)),
          takerAddress: 'taker',
          side: 'bid',
          price: t.price,
          size: t.size,
          quoteAmount: calcQuoteAmount(t.price, t.size),
          takerFee: calcFee(calcQuoteAmount(t.price, t.size), 30),
          makerFee: 0n,
          height: t.height,
          timestamp: t.height * 1000n,
        });
      }

      // Get trades - should be sorted by height descending
      const storedTrades = await store.getTradesByMarket(marketId);
      expect(storedTrades.length).toBe(3);
      expect(storedTrades[0].height).toBe(3n); // Most recent first
      expect(storedTrades[1].height).toBe(2n);
      expect(storedTrades[2].height).toBe(1n);
    });
  });

  // ============================================================================
  // Level Aggregation Consistency
  // ============================================================================

  describe('Level Aggregation Consistency', () => {
    it('should maintain consistent aggregate when adding orders at same price', async () => {
      const store = new InMemoryMarketStore();
      const marketId = await createMarket(store);

      const price = 1000n;
      const orderSizes = [100n, 50n, 75n, 125n];
      const orderIds: OrderId[] = [];
      let runningAggregate = 0n;

      for (let i = 0; i < orderSizes.length; i++) {
        const orderId = makeOrderId(marketId, `user${i}`, 1n);
        orderIds.push(orderId);

        await store.createOrder({
          orderId,
          marketId,
          owner: `user${i}`,
          side: 'bid',
          price,
          size: orderSizes[i],
          remaining: orderSizes[i],
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });

        runningAggregate += orderSizes[i];

        await store.setLevel({
          marketId,
          side: 'bid',
          price,
          aggregate: runningAggregate,
          orderIds: [...orderIds],
          version: BigInt(i + 1),
        });

        const level = await store.getLevel(marketId, 'bid', price);
        expect(level?.aggregate).toBe(runningAggregate);
        expect(level?.orderIds.length).toBe(i + 1);
      }

      const finalLevel = await store.getLevel(marketId, 'bid', price);
      const expectedTotal = orderSizes.reduce((a, b) => a + b, 0n);
      expect(finalLevel?.aggregate).toBe(expectedTotal);
    });

    it('should maintain aggregate consistency when removing orders', async () => {
      const store = new InMemoryMarketStore();
      const marketId = await createMarket(store);

      const price = 1000n;
      const orderIds: OrderId[] = [];
      const orderSizes: bigint[] = [];

      // Create 5 orders
      for (let i = 0; i < 5; i++) {
        const orderId = makeOrderId(marketId, `user${i}`, 1n);
        const size = BigInt(100 + i * 10);
        orderIds.push(orderId);
        orderSizes.push(size);

        await store.createOrder({
          orderId,
          marketId,
          owner: `user${i}`,
          side: 'bid',
          price,
          size,
          remaining: size,
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });
      }

      const totalSize = orderSizes.reduce((a, b) => a + b, 0n);
      await store.setLevel({
        marketId,
        side: 'bid',
        price,
        aggregate: totalSize,
        orderIds,
        version: 1n,
      });

      // Remove orders one by one and verify aggregate
      let remainingTotal = totalSize;
      for (let i = 0; i < 3; i++) {
        remainingTotal -= orderSizes[i];
        const remainingOrderIds = orderIds.slice(i + 1);

        if (remainingOrderIds.length > 0) {
          await store.setLevel({
            marketId,
            side: 'bid',
            price,
            aggregate: remainingTotal,
            orderIds: remainingOrderIds,
            version: BigInt(i + 2),
          });

          const level = await store.getLevel(marketId, 'bid', price);
          expect(level?.aggregate).toBe(remainingTotal);
          expect(level?.orderIds.length).toBe(remainingOrderIds.length);
        }
      }
    });
  });

  // ============================================================================
  // Top of Book Update Consistency
  // ============================================================================

  describe('Top of Book Consistency', () => {
    it('should maintain consistent top of book through level changes', async () => {
      const store = new InMemoryMarketStore();
      const marketId = await createMarket(store);

      // Add bid levels at different prices
      const bidPrices = [900n, 950n, 1000n];
      for (let i = 0; i < bidPrices.length; i++) {
        await store.setLevel({
          marketId,
          side: 'bid',
          price: bidPrices[i],
          aggregate: 100n,
          orderIds: [makeOrderId(marketId, 'user1', BigInt(i))],
          version: 1n,
        });
      }

      // Add ask levels
      const askPrices = [1100n, 1050n, 1150n];
      for (let i = 0; i < askPrices.length; i++) {
        await store.setLevel({
          marketId,
          side: 'ask',
          price: askPrices[i],
          aggregate: 100n,
          orderIds: [makeOrderId(marketId, 'user2', BigInt(i + 100))],
          version: 1n,
        });
      }

      // Get best bid and ask
      const bidLevels = await store.getLevelsByMarket(marketId, 'bid', 1);
      const askLevels = await store.getLevelsByMarket(marketId, 'ask', 1);

      expect(bidLevels[0].price).toBe(1000n); // Highest bid
      expect(askLevels[0].price).toBe(1050n); // Lowest ask

      // Update top of book
      await store.setTopOfBook({
        marketId,
        bestBidPrice: bidLevels[0].price,
        bestAskPrice: askLevels[0].price,
        lastTradePrice: null,
        lastTradeHeight: null,
        version: 1n,
      });

      const top = await store.getTopOfBook(marketId);
      expect(top?.bestBidPrice).toBe(1000n);
      expect(top?.bestAskPrice).toBe(1050n);

      // Remove best bid level
      await store.deleteLevel(marketId, 'bid', 1000n);

      // Verify new best bid
      const newBidLevels = await store.getLevelsByMarket(marketId, 'bid', 1);
      expect(newBidLevels[0].price).toBe(950n); // New best bid
    });
  });
});
