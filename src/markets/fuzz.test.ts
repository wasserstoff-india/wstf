/**
 * Markets Module - Fuzz/Chaos Tests
 *
 * Random operation sequences to stress test the markets module:
 * - Random op sequences with seeded RNG
 * - No crash, only structured errors + invariants hold
 * - Determinism verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryMarketStore,
  MarketNotFoundError,
  OrderNotFoundError,
  GridNotFoundError,
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
  Trade,
  Side,
  OrderStatus,
  makeMarketId,
  makeOrderId,
  makeGridId,
  makeTradeId,
  validateMarketParams,
  validateOrderParams,
  validateGridParams,
  calcQuoteAmount,
  calcFee,
  GEOM_RATIO_SCALE,
  MAX_LEVELS_PER_SIDE,
} from './types';
import { makeTokenId, TokenId } from '../tokens/types';

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

class SeededRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Simple LCG PRNG
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 0x100000000;
    return this.seed / 0x100000000;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextBigInt(min: bigint, max: bigint): bigint {
    const range = Number(max - min);
    return min + BigInt(Math.floor(this.next() * range));
  }

  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// ============================================================================
// Operation Types
// ============================================================================

type MarketOp =
  | { type: 'createMarket'; baseIndex: number; quoteIndex: number }
  | { type: 'createOrder'; marketIndex: number; user: string; side: Side; price: bigint; size: bigint }
  | { type: 'cancelOrder'; marketIndex: number; orderIndex: number }
  | { type: 'updateOrder'; marketIndex: number; orderIndex: number; fillAmount: bigint }
  | { type: 'createGrid'; marketIndex: number; user: string; levelsPerSide: number; mode: 'arith' | 'geom' }
  | { type: 'cancelGrid'; marketIndex: number; gridIndex: number }
  | { type: 'adjustEscrow'; marketIndex: number; user: string; token: 'base' | 'quote'; amount: bigint }
  | { type: 'recordTrade'; marketIndex: number; price: bigint; size: bigint }
  | { type: 'setLevel'; marketIndex: number; side: Side; price: bigint; aggregate: bigint }
  | { type: 'deleteLevel'; marketIndex: number; side: Side; price: bigint };

// ============================================================================
// Test State Tracker
// ============================================================================

interface TestState {
  store: InMemoryMarketStore;
  markets: MarketId[];
  orders: Map<MarketId, OrderId[]>;
  grids: Map<MarketId, GridId[]>;
  tokens: TokenId[];
  users: string[];
  orderNonce: bigint;
  gridNonce: bigint;
  tradeCount: number;
}

function createTestState(seed: number): TestState {
  const rng = new SeededRNG(seed);
  const tokens: TokenId[] = [];
  for (let i = 0; i < 5; i++) {
    tokens.push(makeTokenId(`TOKEN${i}`));
  }

  const users: string[] = [];
  for (let i = 0; i < 10; i++) {
    users.push(`user${i}`);
  }

  return {
    store: new InMemoryMarketStore(),
    markets: [],
    orders: new Map(),
    grids: new Map(),
    tokens,
    users,
    orderNonce: 0n,
    gridNonce: 0n,
    tradeCount: 0,
  };
}

// ============================================================================
// Operation Generators
// ============================================================================

function generateOp(rng: SeededRNG, state: TestState): MarketOp {
  const opTypes = ['createMarket', 'createOrder', 'cancelOrder', 'updateOrder',
                   'createGrid', 'cancelGrid', 'adjustEscrow', 'recordTrade',
                   'setLevel', 'deleteLevel'];

  // Weight towards creation ops when state is empty
  let weights = state.markets.length === 0
    ? { createMarket: 10, createOrder: 1, cancelOrder: 0, updateOrder: 0,
        createGrid: 0, cancelGrid: 0, adjustEscrow: 0, recordTrade: 0,
        setLevel: 0, deleteLevel: 0 }
    : { createMarket: 2, createOrder: 5, cancelOrder: 3, updateOrder: 2,
        createGrid: 3, cancelGrid: 2, adjustEscrow: 4, recordTrade: 3,
        setLevel: 4, deleteLevel: 2 };

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;

  for (const [op, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) {
      return generateSpecificOp(rng, state, op as keyof typeof weights);
    }
  }

  return generateSpecificOp(rng, state, 'createMarket');
}

function generateSpecificOp(rng: SeededRNG, state: TestState, opType: string): MarketOp {
  switch (opType) {
    case 'createMarket': {
      const baseIndex = rng.nextInt(0, state.tokens.length - 1);
      let quoteIndex = rng.nextInt(0, state.tokens.length - 1);
      while (quoteIndex === baseIndex) {
        quoteIndex = (quoteIndex + 1) % state.tokens.length;
      }
      return { type: 'createMarket', baseIndex, quoteIndex };
    }

    case 'createOrder': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      return {
        type: 'createOrder',
        marketIndex: rng.nextInt(0, state.markets.length - 1),
        user: rng.pick(state.users),
        side: rng.pick(['bid', 'ask']) as Side,
        price: rng.nextBigInt(100n, 10000n) * 100n, // Aligned to tick
        size: rng.nextBigInt(1n, 100n) * 10n,       // Aligned to lot
      };
    }

    case 'cancelOrder': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      const marketIndex = rng.nextInt(0, state.markets.length - 1);
      const marketId = state.markets[marketIndex];
      const orders = state.orders.get(marketId) || [];
      if (orders.length === 0) {
        return generateSpecificOp(rng, state, 'createOrder');
      }
      return {
        type: 'cancelOrder',
        marketIndex,
        orderIndex: rng.nextInt(0, orders.length - 1),
      };
    }

    case 'updateOrder': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      const marketIndex = rng.nextInt(0, state.markets.length - 1);
      const marketId = state.markets[marketIndex];
      const orders = state.orders.get(marketId) || [];
      if (orders.length === 0) {
        return generateSpecificOp(rng, state, 'createOrder');
      }
      return {
        type: 'updateOrder',
        marketIndex,
        orderIndex: rng.nextInt(0, orders.length - 1),
        fillAmount: rng.nextBigInt(1n, 50n) * 10n,
      };
    }

    case 'createGrid': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      return {
        type: 'createGrid',
        marketIndex: rng.nextInt(0, state.markets.length - 1),
        user: rng.pick(state.users),
        levelsPerSide: rng.nextInt(1, 20),
        mode: rng.pick(['arith', 'geom']) as 'arith' | 'geom',
      };
    }

    case 'cancelGrid': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      const marketIndex = rng.nextInt(0, state.markets.length - 1);
      const marketId = state.markets[marketIndex];
      const grids = state.grids.get(marketId) || [];
      if (grids.length === 0) {
        return generateSpecificOp(rng, state, 'createGrid');
      }
      return {
        type: 'cancelGrid',
        marketIndex,
        gridIndex: rng.nextInt(0, grids.length - 1),
      };
    }

    case 'adjustEscrow': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      return {
        type: 'adjustEscrow',
        marketIndex: rng.nextInt(0, state.markets.length - 1),
        user: rng.pick(state.users),
        token: rng.pick(['base', 'quote']) as 'base' | 'quote',
        amount: rng.nextBigInt(-100n, 1000n) * 100n,
      };
    }

    case 'recordTrade': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      return {
        type: 'recordTrade',
        marketIndex: rng.nextInt(0, state.markets.length - 1),
        price: rng.nextBigInt(100n, 10000n) * 100n,
        size: rng.nextBigInt(1n, 100n) * 10n,
      };
    }

    case 'setLevel': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      return {
        type: 'setLevel',
        marketIndex: rng.nextInt(0, state.markets.length - 1),
        side: rng.pick(['bid', 'ask']) as Side,
        price: rng.nextBigInt(100n, 10000n) * 100n,
        aggregate: rng.nextBigInt(100n, 10000n),
      };
    }

    case 'deleteLevel': {
      if (state.markets.length === 0) {
        return generateSpecificOp(rng, state, 'createMarket');
      }
      return {
        type: 'deleteLevel',
        marketIndex: rng.nextInt(0, state.markets.length - 1),
        side: rng.pick(['bid', 'ask']) as Side,
        price: rng.nextBigInt(100n, 10000n) * 100n,
      };
    }

    default:
      return generateSpecificOp(rng, state, 'createMarket');
  }
}

// ============================================================================
// Operation Executor
// ============================================================================

async function executeOp(state: TestState, op: MarketOp): Promise<{ success: boolean; error?: string }> {
  try {
    switch (op.type) {
      case 'createMarket': {
        const baseToken = state.tokens[op.baseIndex];
        const quoteToken = state.tokens[op.quoteIndex];
        const marketId = makeMarketId(baseToken, quoteToken);

        // Check if already exists
        const existing = await state.store.getMarket(marketId);
        if (existing) {
          return { success: false, error: 'Market already exists' };
        }

        await state.store.createMarket({
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

        state.markets.push(marketId);
        state.orders.set(marketId, []);
        state.grids.set(marketId, []);
        return { success: true };
      }

      case 'createOrder': {
        const marketId = state.markets[op.marketIndex];
        const orderId = makeOrderId(marketId, op.user, state.orderNonce++);

        await state.store.createOrder({
          orderId,
          marketId,
          owner: op.user,
          side: op.side,
          price: op.price,
          size: op.size,
          remaining: op.size,
          status: 'open',
          createdAt: state.orderNonce,
          flags: [],
          version: 1n,
        });

        const orders = state.orders.get(marketId) || [];
        orders.push(orderId);
        state.orders.set(marketId, orders);
        return { success: true };
      }

      case 'cancelOrder': {
        const marketId = state.markets[op.marketIndex];
        const orders = state.orders.get(marketId) || [];
        if (op.orderIndex >= orders.length) {
          return { success: false, error: 'Order index out of bounds' };
        }

        const orderId = orders[op.orderIndex];
        const order = await state.store.getOrder(orderId);
        if (!order) {
          return { success: false, error: 'Order not found' };
        }
        if (order.status === 'cancelled' || order.status === 'filled') {
          return { success: false, error: 'Order already finalized' };
        }

        await state.store.updateOrder(orderId, { status: 'cancelled', remaining: 0n }, order.version);
        return { success: true };
      }

      case 'updateOrder': {
        const marketId = state.markets[op.marketIndex];
        const orders = state.orders.get(marketId) || [];
        if (op.orderIndex >= orders.length) {
          return { success: false, error: 'Order index out of bounds' };
        }

        const orderId = orders[op.orderIndex];
        const order = await state.store.getOrder(orderId);
        if (!order) {
          return { success: false, error: 'Order not found' };
        }
        if (order.status === 'cancelled' || order.status === 'filled') {
          return { success: false, error: 'Order already finalized' };
        }

        const newRemaining = order.remaining - op.fillAmount;
        if (newRemaining < 0n) {
          return { success: false, error: 'Fill exceeds remaining' };
        }

        const newStatus: OrderStatus = newRemaining === 0n ? 'filled' : 'partial';
        await state.store.updateOrder(orderId, { remaining: newRemaining, status: newStatus }, order.version);
        return { success: true };
      }

      case 'createGrid': {
        const marketId = state.markets[op.marketIndex];
        const gridId = makeGridId(marketId, op.user, state.gridNonce++);

        const geomRatio = op.mode === 'geom' ? GEOM_RATIO_SCALE + 5000n : undefined;

        await state.store.createGrid({
          gridId,
          marketId,
          owner: op.user,
          centerPrice: 500000n,
          halfWidth: 100000n,
          levelsPerSide: op.levelsPerSide,
          mode: op.mode,
          geomRatio,
          totalBaseSize: 10000n,
          sideBias: 'both',
          status: 'active',
          orderIds: [],
          createdAt: state.gridNonce,
          version: 1n,
        });

        const grids = state.grids.get(marketId) || [];
        grids.push(gridId);
        state.grids.set(marketId, grids);
        return { success: true };
      }

      case 'cancelGrid': {
        const marketId = state.markets[op.marketIndex];
        const grids = state.grids.get(marketId) || [];
        if (op.gridIndex >= grids.length) {
          return { success: false, error: 'Grid index out of bounds' };
        }

        const gridId = grids[op.gridIndex];
        const grid = await state.store.getGrid(gridId);
        if (!grid) {
          return { success: false, error: 'Grid not found' };
        }
        if (grid.status === 'cancelled') {
          return { success: false, error: 'Grid already cancelled' };
        }

        await state.store.updateGrid(gridId, { status: 'cancelled' }, grid.version);
        return { success: true };
      }

      case 'adjustEscrow': {
        const marketId = state.markets[op.marketIndex];
        const market = await state.store.getMarket(marketId);
        if (!market) {
          return { success: false, error: 'Market not found' };
        }

        const tokenId = op.token === 'base' ? market.baseTokenId : market.quoteTokenId;

        // For negative adjustments, check if there's enough escrow
        if (op.amount < 0n) {
          const current = await state.store.getEscrow(marketId, op.user, tokenId);
          if (!current || current.lockedAmount < -op.amount) {
            return { success: false, error: 'Insufficient escrow' };
          }
        }

        await state.store.adjustEscrow(marketId, op.user, tokenId, op.amount);
        return { success: true };
      }

      case 'recordTrade': {
        const marketId = state.markets[op.marketIndex];
        const tradeId = makeTradeId(marketId, BigInt(state.tradeCount), 0);

        await state.store.recordTrade({
          tradeId,
          marketId,
          makerOrderId: makeOrderId(marketId, 'maker', BigInt(state.tradeCount)),
          makerAddress: 'maker',
          takerOrderId: makeOrderId(marketId, 'taker', BigInt(state.tradeCount)),
          takerAddress: 'taker',
          side: 'bid',
          price: op.price,
          size: op.size,
          quoteAmount: calcQuoteAmount(op.price, op.size),
          takerFee: calcFee(calcQuoteAmount(op.price, op.size), 30),
          makerFee: 0n,
          height: BigInt(state.tradeCount),
          timestamp: BigInt(Date.now()),
        });

        state.tradeCount++;
        return { success: true };
      }

      case 'setLevel': {
        const marketId = state.markets[op.marketIndex];
        await state.store.setLevel({
          marketId,
          side: op.side,
          price: op.price,
          aggregate: op.aggregate,
          orderIds: [makeOrderId(marketId, 'user', BigInt(Date.now()))],
          version: 1n,
        });
        return { success: true };
      }

      case 'deleteLevel': {
        const marketId = state.markets[op.marketIndex];
        await state.store.deleteLevel(marketId, op.side, op.price);
        return { success: true };
      }

      default:
        return { success: false, error: 'Unknown operation type' };
    }
  } catch (error: any) {
    // Expected errors should not crash
    if (error instanceof MarketNotFoundError ||
        error instanceof OrderNotFoundError ||
        error instanceof GridNotFoundError ||
        error instanceof MarketConcurrencyError ||
        error instanceof InsufficientEscrowError) {
      return { success: false, error: error.message };
    }
    // Unexpected errors
    throw error;
  }
}

// ============================================================================
// Invariant Checker
// ============================================================================

async function checkInvariants(state: TestState): Promise<string[]> {
  const violations: string[] = [];

  for (const marketId of state.markets) {
    // Check levels have positive aggregates
    const bidLevels = await state.store.getLevelsByMarket(marketId, 'bid');
    const askLevels = await state.store.getLevelsByMarket(marketId, 'ask');

    for (const level of [...bidLevels, ...askLevels]) {
      if (level.aggregate <= 0n) {
        violations.push(`Level at ${level.price} has non-positive aggregate: ${level.aggregate}`);
      }
      if (level.orderIds.length === 0) {
        violations.push(`Level at ${level.price} has no order IDs`);
      }
    }

    // Check bid levels are sorted descending
    for (let i = 1; i < bidLevels.length; i++) {
      if (bidLevels[i - 1].price <= bidLevels[i].price) {
        violations.push(`Bid levels not sorted: ${bidLevels[i - 1].price} <= ${bidLevels[i].price}`);
      }
    }

    // Check ask levels are sorted ascending
    for (let i = 1; i < askLevels.length; i++) {
      if (askLevels[i - 1].price >= askLevels[i].price) {
        violations.push(`Ask levels not sorted: ${askLevels[i - 1].price} >= ${askLevels[i].price}`);
      }
    }

    // Check orders have valid status
    const orders = state.orders.get(marketId) || [];
    for (const orderId of orders) {
      const order = await state.store.getOrder(orderId);
      if (order) {
        if (!['open', 'partial', 'filled', 'cancelled'].includes(order.status)) {
          violations.push(`Order ${orderId} has invalid status: ${order.status}`);
        }
        if (order.remaining < 0n) {
          violations.push(`Order ${orderId} has negative remaining: ${order.remaining}`);
        }
        if (order.remaining > order.size) {
          violations.push(`Order ${orderId} remaining > size: ${order.remaining} > ${order.size}`);
        }
      }
    }

    // Check grids have valid configuration
    const grids = state.grids.get(marketId) || [];
    for (const gridId of grids) {
      const grid = await state.store.getGrid(gridId);
      if (grid) {
        if (grid.levelsPerSide <= 0 || grid.levelsPerSide > MAX_LEVELS_PER_SIDE) {
          violations.push(`Grid ${gridId} has invalid levelsPerSide: ${grid.levelsPerSide}`);
        }
        if (grid.centerPrice <= 0n) {
          violations.push(`Grid ${gridId} has non-positive centerPrice: ${grid.centerPrice}`);
        }
      }
    }
  }

  return violations;
}

// ============================================================================
// Fuzz Tests
// ============================================================================

describe('Markets Fuzz Tests', () => {
  describe('Random Operation Sequences', () => {
    const TEST_SEEDS = [12345, 67890, 11111, 22222, 33333];
    const OPS_PER_TEST = 100;

    for (const seed of TEST_SEEDS) {
      it(`should maintain invariants through ${OPS_PER_TEST} random ops (seed: ${seed})`, async () => {
        const rng = new SeededRNG(seed);
        const state = createTestState(seed);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < OPS_PER_TEST; i++) {
          const op = generateOp(rng, state);
          const result = await executeOp(state, op);

          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }

          // Check invariants periodically
          if (i % 20 === 0) {
            const violations = await checkInvariants(state);
            expect(violations).toHaveLength(0);
          }
        }

        // Final invariant check
        const violations = await checkInvariants(state);
        expect(violations).toHaveLength(0);

        // Should have at least some successful operations
        expect(successCount).toBeGreaterThan(0);
      });
    }
  });

  describe('Determinism Verification', () => {
    it('should produce identical state from same seed', async () => {
      const seed = 54321;
      const ops = 50;

      // Run 1
      const rng1 = new SeededRNG(seed);
      const state1 = createTestState(seed);
      for (let i = 0; i < ops; i++) {
        const op = generateOp(rng1, state1);
        await executeOp(state1, op);
      }

      // Run 2
      const rng2 = new SeededRNG(seed);
      const state2 = createTestState(seed);
      for (let i = 0; i < ops; i++) {
        const op = generateOp(rng2, state2);
        await executeOp(state2, op);
      }

      // Compare states
      expect(state1.markets.length).toBe(state2.markets.length);

      for (let i = 0; i < state1.markets.length; i++) {
        const marketId1 = state1.markets[i];
        const marketId2 = state2.markets[i];

        expect(marketId1).toBe(marketId2);

        const market1 = await state1.store.getMarket(marketId1);
        const market2 = await state2.store.getMarket(marketId2);

        expect(market1?.status).toBe(market2?.status);
        expect(market1?.feeBps).toBe(market2?.feeBps);
      }
    });
  });

  describe('Geometric Parameter Fuzzing', () => {
    it('should handle various geometric ratios correctly', async () => {
      const store = new InMemoryMarketStore();
      const baseToken = makeTokenId('BASE');
      const quoteToken = makeTokenId('QUOTE');
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

      // Test various geomRatios
      const testRatios = [
        GEOM_RATIO_SCALE + 100n,    // 1.0001 - very small spread
        GEOM_RATIO_SCALE + 1000n,   // 1.001
        GEOM_RATIO_SCALE + 5000n,   // 1.005
        GEOM_RATIO_SCALE + 10000n,  // 1.01
        GEOM_RATIO_SCALE + 50000n,  // 1.05
        GEOM_RATIO_SCALE + 100000n, // 1.1
        GEOM_RATIO_SCALE + 500000n, // 1.5
        GEOM_RATIO_SCALE + 999999n, // ~2.0 (max)
      ];

      for (let i = 0; i < testRatios.length; i++) {
        const ratio = testRatios[i];
        const gridId = makeGridId(marketId, 'lp', BigInt(i));

        // Validate params
        const error = validateGridParams({
          marketId,
          centerPrice: 100000n,
          halfWidth: 50000n,
          levelsPerSide: 10,
          mode: 'geom',
          geomRatio: ratio,
          totalBaseSize: 10000n,
          sideBias: 'both',
        });

        if (error) {
          // Some extreme ratios should be rejected
          expect(ratio).toBeGreaterThan(GEOM_RATIO_SCALE * 2n);
          continue;
        }

        await store.createGrid({
          gridId,
          marketId,
          owner: 'lp',
          centerPrice: 100000n,
          halfWidth: 50000n,
          levelsPerSide: 10,
          mode: 'geom',
          geomRatio: ratio,
          totalBaseSize: 10000n,
          sideBias: 'both',
          status: 'active',
          orderIds: [],
          createdAt: BigInt(i),
          version: 1n,
        });

        const grid = await store.getGrid(gridId);
        expect(grid).toBeDefined();
        expect(grid?.geomRatio).toBe(ratio);
      }
    });

    it('should reject invalid geometric parameters', async () => {
      const invalidCases = [
        { geomRatio: GEOM_RATIO_SCALE, error: 'must be > 1.0' },        // Exactly 1.0
        { geomRatio: GEOM_RATIO_SCALE - 1n, error: 'must be > 1.0' },   // < 1.0
        { geomRatio: GEOM_RATIO_SCALE * 2n + 1n, error: 'too large' },  // > 2.0
        { geomRatio: 0n, error: 'geomRatio required' },                   // Zero (falsy)
      ];

      for (const tc of invalidCases) {
        const error = validateGridParams({
          marketId: makeMarketId(makeTokenId('A'), makeTokenId('B')),
          centerPrice: 100000n,
          halfWidth: 50000n,
          levelsPerSide: 10,
          mode: 'geom',
          geomRatio: tc.geomRatio,
          totalBaseSize: 10000n,
          sideBias: 'both',
        });

        expect(error).not.toBeNull();
        expect(error).toContain(tc.error);
      }
    });
  });

  describe('Edge Case Parameter Fuzzing', () => {
    it('should handle boundary tick and lot sizes', async () => {
      const testCases = [
        { tickSize: 1n, lotSize: 1n },           // Minimum
        { tickSize: 1000000n, lotSize: 1000n },  // Large
        { tickSize: 100n, lotSize: 10n },        // Standard
      ];

      for (const tc of testCases) {
        const store = new InMemoryMarketStore();
        const marketId = makeMarketId(makeTokenId('A'), makeTokenId('B'));

        await store.createMarket({
          marketId,
          baseTokenId: makeTokenId('A'),
          quoteTokenId: makeTokenId('B'),
          tickSize: tc.tickSize,
          lotSize: tc.lotSize,
          feeBps: 30,
          status: 'active',
          creator: 'creator',
          createdAtHeight: 1n,
          version: 1n,
        });

        const market = await store.getMarket(marketId);
        expect(market?.tickSize).toBe(tc.tickSize);
        expect(market?.lotSize).toBe(tc.lotSize);
      }
    });

    it('should handle maximum levels per side', async () => {
      const store = new InMemoryMarketStore();
      const baseToken = makeTokenId('BASE');
      const quoteToken = makeTokenId('QUOTE');
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

      // Should succeed at max
      const gridId = makeGridId(marketId, 'lp', 1n);
      await store.createGrid({
        gridId,
        marketId,
        owner: 'lp',
        centerPrice: 100000n,
        halfWidth: 50000n,
        levelsPerSide: MAX_LEVELS_PER_SIDE,
        mode: 'arith',
        totalBaseSize: 64000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });

      const grid = await store.getGrid(gridId);
      expect(grid?.levelsPerSide).toBe(MAX_LEVELS_PER_SIDE);

      // Should reject above max
      const error = validateGridParams({
        marketId,
        centerPrice: 100000n,
        halfWidth: 50000n,
        levelsPerSide: MAX_LEVELS_PER_SIDE + 1,
        mode: 'arith',
        totalBaseSize: 65000n,
        sideBias: 'both',
      });

      expect(error).toContain('exceeds max');
    });
  });
});
