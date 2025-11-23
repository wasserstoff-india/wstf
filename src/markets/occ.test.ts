/**
 * Markets Module - OCC (Optimistic Concurrency Control) Stress Tests
 *
 * Tests race-like patterns and concurrent update scenarios:
 * - Double-spend prevention on grid updates
 * - Interleaved cancels and trades
 * - Stale version detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryMarketStore,
  MarketConcurrencyError,
  OrderNotFoundError,
  GridNotFoundError,
  InsufficientEscrowError,
} from './store';
import {
  MarketId,
  OrderId,
  GridId,
  Market,
  Order,
  LiquidityGrid,
  makeMarketId,
  makeOrderId,
  makeGridId,
  makeTradeId,
  calcQuoteAmount,
  calcFee,
  GEOM_RATIO_SCALE,
} from './types';
import { makeTokenId } from '../tokens/types';

describe('Markets OCC Stress Tests', () => {
  let store: InMemoryMarketStore;
  const baseToken = makeTokenId('BASE');
  const quoteToken = makeTokenId('QUOTE');

  beforeEach(() => {
    store = new InMemoryMarketStore();
  });

  async function createMarket(): Promise<MarketId> {
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

  // ============================================================================
  // 4.1 Double-spend on Grid Updates
  // ============================================================================

  describe('Double-spend Prevention on Grid Updates', () => {
    it('should reject second update with stale version', async () => {
      const marketId = await createMarket();
      const gridId = makeGridId(marketId, 'lp1', 1n);

      await store.createGrid({
        gridId,
        marketId,
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

      // Read state version V
      const grid = await store.getGrid(gridId);
      const versionV = grid!.version;

      // Client A: build update based on version V
      const updateA = { centerPrice: 110000n };

      // Client B: build update based on same version V
      const updateB = { centerPrice: 90000n };

      // Apply A → success, version becomes V+1
      await store.updateGrid(gridId, updateA, versionV);

      const afterA = await store.getGrid(gridId);
      expect(afterA?.centerPrice).toBe(110000n);
      expect(afterA?.version).toBe(versionV + 1n);

      // Apply B with stale version V → must fail
      await expect(
        store.updateGrid(gridId, updateB, versionV)
      ).rejects.toThrow(MarketConcurrencyError);

      // State should not have changed from A's update
      const afterB = await store.getGrid(gridId);
      expect(afterB?.centerPrice).toBe(110000n);
    });

    it('should allow sequential updates with correct versions', async () => {
      const marketId = await createMarket();
      const gridId = makeGridId(marketId, 'lp1', 1n);

      await store.createGrid({
        gridId,
        marketId,
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

      // Update 1
      await store.updateGrid(gridId, { centerPrice: 110000n }, 1n);
      let grid = await store.getGrid(gridId);
      expect(grid?.version).toBe(2n);

      // Update 2 with new version
      await store.updateGrid(gridId, { centerPrice: 120000n }, 2n);
      grid = await store.getGrid(gridId);
      expect(grid?.version).toBe(3n);

      // Update 3 with new version
      await store.updateGrid(gridId, { status: 'paused' }, 3n);
      grid = await store.getGrid(gridId);
      expect(grid?.version).toBe(4n);
      expect(grid?.status).toBe('paused');
    });
  });

  // ============================================================================
  // 4.2 Interleaved Cancels & Trades
  // ============================================================================

  describe('Interleaved Order Cancels and Fills', () => {
    it('should handle cancel vs fill race correctly', async () => {
      const marketId = await createMarket();
      const orderId = makeOrderId(marketId, 'user1', 1n);

      await store.createOrder({
        orderId,
        marketId,
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

      // Snapshot order state & version
      const order = await store.getOrder(orderId);
      const versionV = order!.version;

      // Op1: Fill that consumes some liquidity
      const fillUpdate = { remaining: 50n, status: 'partial' as const };

      // Op2: Cancel based on pre-fill snapshot
      const cancelUpdate = { remaining: 0n, status: 'cancelled' as const };

      // Apply fill first → success
      await store.updateOrder(orderId, fillUpdate, versionV);

      const afterFill = await store.getOrder(orderId);
      expect(afterFill?.remaining).toBe(50n);
      expect(afterFill?.status).toBe('partial');
      expect(afterFill?.version).toBe(versionV + 1n);

      // Cancel with stale version V → must fail
      await expect(
        store.updateOrder(orderId, cancelUpdate, versionV)
      ).rejects.toThrow(MarketConcurrencyError);

      // Order should still be partially filled, not cancelled
      const afterCancel = await store.getOrder(orderId);
      expect(afterCancel?.status).toBe('partial');
      expect(afterCancel?.remaining).toBe(50n);
    });

    it('should handle multiple concurrent fill attempts', async () => {
      const marketId = await createMarket();
      const orderId = makeOrderId(marketId, 'user1', 1n);

      await store.createOrder({
        orderId,
        marketId,
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

      // Three "concurrent" fill attempts, all reading version 1
      const v1 = 1n;

      // First fill succeeds
      await store.updateOrder(orderId, { remaining: 70n, status: 'partial' }, v1);

      // Second fill with stale version fails
      await expect(
        store.updateOrder(orderId, { remaining: 60n, status: 'partial' }, v1)
      ).rejects.toThrow(MarketConcurrencyError);

      // Third fill with stale version also fails
      await expect(
        store.updateOrder(orderId, { remaining: 50n, status: 'partial' }, v1)
      ).rejects.toThrow(MarketConcurrencyError);

      // Only first fill should have taken effect
      const order = await store.getOrder(orderId);
      expect(order?.remaining).toBe(70n);
      expect(order?.version).toBe(2n);
    });
  });

  // ============================================================================
  // Market Update Concurrency
  // ============================================================================

  describe('Market Update Concurrency', () => {
    it('should prevent double market status change', async () => {
      const marketId = await createMarket();

      // Read market version
      const market = await store.getMarket(marketId);
      const v1 = market!.version;

      // Two competing status changes
      // Change 1: pause
      await store.updateMarket(marketId, { status: 'paused' }, v1);

      // Change 2: close (with stale version)
      await expect(
        store.updateMarket(marketId, { status: 'closed' }, v1)
      ).rejects.toThrow(MarketConcurrencyError);

      const finalMarket = await store.getMarket(marketId);
      expect(finalMarket?.status).toBe('paused');
    });

    it('should handle sequential market updates correctly', async () => {
      const marketId = await createMarket();

      let market = await store.getMarket(marketId);
      expect(market?.version).toBe(1n);

      // Update fee
      await store.updateMarket(marketId, { feeBps: 50 }, 1n);
      market = await store.getMarket(marketId);
      expect(market?.feeBps).toBe(50);
      expect(market?.version).toBe(2n);

      // Pause
      await store.updateMarket(marketId, { status: 'paused' }, 2n);
      market = await store.getMarket(marketId);
      expect(market?.status).toBe('paused');
      expect(market?.version).toBe(3n);

      // Unpause
      await store.updateMarket(marketId, { status: 'active' }, 3n);
      market = await store.getMarket(marketId);
      expect(market?.status).toBe('active');
      expect(market?.version).toBe(4n);
    });
  });

  // ============================================================================
  // Escrow Race Conditions
  // ============================================================================

  describe('Escrow Race Conditions', () => {
    it('should prevent double-withdrawal via OCC', async () => {
      const marketId = await createMarket();

      // Deposit 1000
      await store.adjustEscrow(marketId, 'user1', baseToken, 1000n);

      let escrow = await store.getEscrow(marketId, 'user1', baseToken);
      expect(escrow?.lockedAmount).toBe(1000n);

      // Two "concurrent" withdrawals of 800 each
      // First succeeds
      await store.adjustEscrow(marketId, 'user1', baseToken, -800n);

      escrow = await store.getEscrow(marketId, 'user1', baseToken);
      expect(escrow?.lockedAmount).toBe(200n);

      // Second fails (insufficient)
      await expect(
        store.adjustEscrow(marketId, 'user1', baseToken, -800n)
      ).rejects.toThrow(InsufficientEscrowError);

      // Balance should still be 200
      escrow = await store.getEscrow(marketId, 'user1', baseToken);
      expect(escrow?.lockedAmount).toBe(200n);
    });

    it('should handle interleaved deposits and withdrawals', async () => {
      const marketId = await createMarket();

      // Sequence of operations
      const ops = [
        { amount: 500n },
        { amount: 300n },
        { amount: -200n },
        { amount: 100n },
        { amount: -600n },
        { amount: 400n },
        { amount: -500n },
      ];

      let expectedBalance = 0n;
      for (const op of ops) {
        const newExpected = expectedBalance + op.amount;

        if (newExpected < 0n) {
          // Should fail
          await expect(
            store.adjustEscrow(marketId, 'user1', baseToken, op.amount)
          ).rejects.toThrow(InsufficientEscrowError);
        } else {
          await store.adjustEscrow(marketId, 'user1', baseToken, op.amount);
          expectedBalance = newExpected;
        }
      }

      const escrow = await store.getEscrow(marketId, 'user1', baseToken);
      if (expectedBalance === 0n) {
        expect(escrow).toBeUndefined();
      } else {
        expect(escrow?.lockedAmount).toBe(expectedBalance);
      }
    });
  });

  // ============================================================================
  // Price Level Race Conditions
  // ============================================================================

  describe('Price Level Race Conditions', () => {
    it('should handle concurrent level updates via versioning', async () => {
      const marketId = await createMarket();
      const price = 1000n;

      // Create initial level
      await store.setLevel({
        marketId,
        side: 'bid',
        price,
        aggregate: 100n,
        orderIds: [makeOrderId(marketId, 'user1', 1n)],
        version: 1n,
      });

      // Read level
      let level = await store.getLevel(marketId, 'bid', price);
      expect(level?.aggregate).toBe(100n);

      // Update level (simulating two concurrent updates)
      // Update 1: add more liquidity
      await store.setLevel({
        marketId,
        side: 'bid',
        price,
        aggregate: 200n,
        orderIds: [makeOrderId(marketId, 'user1', 1n), makeOrderId(marketId, 'user2', 1n)],
        version: 2n,
      });

      // Update 2: would overwrite if not careful
      await store.setLevel({
        marketId,
        side: 'bid',
        price,
        aggregate: 150n,
        orderIds: [makeOrderId(marketId, 'user1', 1n)],
        version: 3n, // Must use correct version
      });

      level = await store.getLevel(marketId, 'bid', price);
      expect(level?.version).toBe(3n);
    });
  });

  // ============================================================================
  // Composite Race Scenarios
  // ============================================================================

  describe('Composite Race Scenarios', () => {
    it('should handle order-grid-escrow interaction race', async () => {
      const marketId = await createMarket();
      const gridId = makeGridId(marketId, 'lp1', 1n);

      // Setup initial state
      await store.adjustEscrow(marketId, 'lp1', baseToken, 10000n);

      await store.createGrid({
        gridId,
        marketId,
        owner: 'lp1',
        centerPrice: 100000n,
        halfWidth: 10000n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 5000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });

      // Create orders for the grid
      const orderIds: OrderId[] = [];
      for (let i = 0; i < 5; i++) {
        const orderId = makeOrderId(marketId, 'lp1', BigInt(i));
        orderIds.push(orderId);
        await store.createOrder({
          orderId,
          marketId,
          owner: 'lp1',
          side: 'bid',
          price: BigInt(95000 + i * 1000),
          size: 500n,
          remaining: 500n,
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          gridId,
          version: 1n,
        });
      }

      // Update grid with order IDs
      await store.updateGrid(gridId, { orderIds }, 1n);

      // Now simulate race: grid cancel vs order fill
      // Read grid and order versions
      const grid = await store.getGrid(gridId);
      const order0 = await store.getOrder(orderIds[0]);

      // Fill order 0 first
      await store.updateOrder(orderIds[0], { remaining: 250n, status: 'partial' }, order0!.version);

      // Grid version is still valid (not changed by order update)
      // This should succeed
      await store.updateGrid(gridId, { status: 'cancelled' }, grid!.version);

      const finalGrid = await store.getGrid(gridId);
      expect(finalGrid?.status).toBe('cancelled');
    });

    it('should handle multiple users competing for same price level', async () => {
      const marketId = await createMarket();
      const price = 1000n;

      // Multiple users trying to add orders at same price
      const users = ['user1', 'user2', 'user3', 'user4', 'user5'];
      const orderIds: OrderId[] = [];

      for (let i = 0; i < users.length; i++) {
        const orderId = makeOrderId(marketId, users[i], 1n);
        orderIds.push(orderId);

        await store.createOrder({
          orderId,
          marketId,
          owner: users[i],
          side: 'bid',
          price,
          size: BigInt(100 * (i + 1)),
          remaining: BigInt(100 * (i + 1)),
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });
      }

      // Update level with all orders
      const totalAggregate = 100n + 200n + 300n + 400n + 500n; // 1500
      await store.setLevel({
        marketId,
        side: 'bid',
        price,
        aggregate: totalAggregate,
        orderIds,
        version: 1n,
      });

      const level = await store.getLevel(marketId, 'bid', price);
      expect(level?.aggregate).toBe(1500n);
      expect(level?.orderIds.length).toBe(5);

      // Now simulate partial fills of individual orders
      // Each reduces the aggregate
      let currentAggregate = totalAggregate;
      let levelVersion = 1n;

      for (let i = 0; i < 3; i++) {
        const orderId = orderIds[i];
        const order = await store.getOrder(orderId);
        const fillAmount = BigInt(50 * (i + 1)); // 50, 100, 150

        await store.updateOrder(orderId, {
          remaining: order!.remaining - fillAmount,
          status: 'partial',
        }, order!.version);

        currentAggregate -= fillAmount;
        levelVersion += 1n;

        await store.setLevel({
          marketId,
          side: 'bid',
          price,
          aggregate: currentAggregate,
          orderIds,
          version: levelVersion,
        });
      }

      const finalLevel = await store.getLevel(marketId, 'bid', price);
      expect(finalLevel?.aggregate).toBe(totalAggregate - 50n - 100n - 150n);
    });
  });

  // ============================================================================
  // Version Overflow Tests
  // ============================================================================

  describe('Version Handling', () => {
    it('should handle many sequential version increments', async () => {
      const marketId = await createMarket();

      // Perform many updates to increment version
      for (let i = 1n; i <= 100n; i++) {
        await store.updateMarket(marketId, { feeBps: Number(i % 100n) }, i);
      }

      const market = await store.getMarket(marketId);
      expect(market?.version).toBe(101n);
    });

    it('should track versions independently per entity type', async () => {
      const marketId = await createMarket();
      const orderId = makeOrderId(marketId, 'user1', 1n);
      const gridId = makeGridId(marketId, 'lp1', 1n);

      await store.createOrder({
        orderId,
        marketId,
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

      await store.createGrid({
        gridId,
        marketId,
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

      // Update each independently
      await store.updateMarket(marketId, { feeBps: 50 }, 1n);
      await store.updateOrder(orderId, { remaining: 50n }, 1n);
      await store.updateGrid(gridId, { status: 'paused' }, 1n);

      const market = await store.getMarket(marketId);
      const order = await store.getOrder(orderId);
      const grid = await store.getGrid(gridId);

      // Each should have version 2
      expect(market?.version).toBe(2n);
      expect(order?.version).toBe(2n);
      expect(grid?.version).toBe(2n);

      // Update order again
      await store.updateOrder(orderId, { remaining: 25n }, 2n);
      expect((await store.getOrder(orderId))?.version).toBe(3n);

      // Market and grid versions unchanged
      expect((await store.getMarket(marketId))?.version).toBe(2n);
      expect((await store.getGrid(gridId))?.version).toBe(2n);
    });
  });
});
