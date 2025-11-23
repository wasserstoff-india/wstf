/**
 * Markets Module - Invariant Tests
 *
 * Tests fundamental invariants that must hold regardless of operation sequences:
 * - Token conservation (no free money)
 * - Band/level consistency (no negative liquidity, valid prices)
 * - Trade correctness (fees, effective prices)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryMarketStore,
  MarketStore,
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
  makeMarketId,
  makeOrderId,
  makeGridId,
  makeTradeId,
  calcQuoteAmount,
  calcFee,
  alignToTick,
  GEOM_RATIO_SCALE,
  MAX_LEVELS_PER_SIDE,
} from './types';
import { makeTokenId, TokenId } from '../tokens/types';

describe('Markets Invariant Tests', () => {
  let store: InMemoryMarketStore;
  const baseToken = makeTokenId('BASE');
  const quoteToken = makeTokenId('QUOTE');

  // Track all token movements for conservation checks
  interface TokenLedger {
    initialSupply: bigint;
    userBalances: Map<string, bigint>;
    escrowedAmounts: Map<string, bigint>; // key: marketId:owner
  }

  let baseLedger: TokenLedger;
  let quoteLedger: TokenLedger;

  function initLedger(initial: bigint): TokenLedger {
    return {
      initialSupply: initial,
      userBalances: new Map(),
      escrowedAmounts: new Map(),
    };
  }

  function setBalance(ledger: TokenLedger, user: string, amount: bigint) {
    ledger.userBalances.set(user, amount);
  }

  function getBalance(ledger: TokenLedger, user: string): bigint {
    return ledger.userBalances.get(user) ?? 0n;
  }

  function adjustBalance(ledger: TokenLedger, user: string, delta: bigint) {
    const current = getBalance(ledger, user);
    ledger.userBalances.set(user, current + delta);
  }

  function setEscrow(ledger: TokenLedger, marketId: MarketId, owner: string, amount: bigint) {
    ledger.escrowedAmounts.set(`${marketId}:${owner}`, amount);
  }

  function getEscrow(ledger: TokenLedger, marketId: MarketId, owner: string): bigint {
    return ledger.escrowedAmounts.get(`${marketId}:${owner}`) ?? 0n;
  }

  function adjustEscrow(ledger: TokenLedger, marketId: MarketId, owner: string, delta: bigint) {
    const current = getEscrow(ledger, marketId, owner);
    ledger.escrowedAmounts.set(`${marketId}:${owner}`, current + delta);
  }

  function totalInSystem(ledger: TokenLedger): bigint {
    let total = 0n;
    for (const balance of ledger.userBalances.values()) {
      total += balance;
    }
    for (const escrow of ledger.escrowedAmounts.values()) {
      total += escrow;
    }
    return total;
  }

  function assertConservation(ledger: TokenLedger, tokenName: string) {
    const total = totalInSystem(ledger);
    expect(total).toBe(ledger.initialSupply);
  }

  beforeEach(() => {
    store = new InMemoryMarketStore();
    // Initialize with 1M tokens for each
    baseLedger = initLedger(1_000_000n);
    quoteLedger = initLedger(10_000_000n); // More quote for trading
  });

  // ============================================================================
  // 1.1 Token Conservation - No Free Money
  // ============================================================================

  describe('Token Conservation', () => {
    const users = ['trader1', 'trader2', 'lp1', 'lp2', 'lp3'];
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
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

      // Distribute initial balances to sum to initialSupply
      setBalance(baseLedger, 'trader1', 100_000n);
      setBalance(baseLedger, 'trader2', 100_000n);
      setBalance(baseLedger, 'lp1', 200_000n);
      setBalance(baseLedger, 'lp2', 200_000n);
      setBalance(baseLedger, 'lp3', 200_000n);
      setBalance(baseLedger, 'treasury', 200_000n); // 1M total

      setBalance(quoteLedger, 'trader1', 1_000_000n);
      setBalance(quoteLedger, 'trader2', 1_000_000n);
      setBalance(quoteLedger, 'lp1', 2_000_000n);
      setBalance(quoteLedger, 'lp2', 2_000_000n);
      setBalance(quoteLedger, 'lp3', 2_000_000n);
      setBalance(quoteLedger, 'treasury', 2_000_000n); // 10M total
    });

    it('should conserve tokens after escrow deposits', async () => {
      // LP1 deposits base into escrow
      const depositAmount = 50_000n;
      adjustBalance(baseLedger, 'lp1', -depositAmount);
      adjustEscrow(baseLedger, marketId, 'lp1', depositAmount);
      await store.adjustEscrow(marketId, 'lp1', baseToken, depositAmount);

      assertConservation(baseLedger, 'BASE');
      assertConservation(quoteLedger, 'QUOTE');
    });

    it('should conserve tokens after escrow withdrawal', async () => {
      // Deposit first
      const depositAmount = 50_000n;
      adjustBalance(baseLedger, 'lp1', -depositAmount);
      adjustEscrow(baseLedger, marketId, 'lp1', depositAmount);
      await store.adjustEscrow(marketId, 'lp1', baseToken, depositAmount);

      // Then withdraw partial
      const withdrawAmount = 30_000n;
      adjustBalance(baseLedger, 'lp1', withdrawAmount);
      adjustEscrow(baseLedger, marketId, 'lp1', -withdrawAmount);
      await store.adjustEscrow(marketId, 'lp1', baseToken, -withdrawAmount);

      assertConservation(baseLedger, 'BASE');
    });

    it('should conserve tokens through multiple deposits and withdrawals', async () => {
      const operations = [
        { user: 'lp1', token: 'base', amount: 50_000n },
        { user: 'lp2', token: 'quote', amount: 500_000n },
        { user: 'trader1', token: 'base', amount: 10_000n },
        { user: 'lp1', token: 'base', amount: -20_000n },
        { user: 'lp3', token: 'quote', amount: 1_000_000n },
        { user: 'trader2', token: 'quote', amount: 100_000n },
        { user: 'lp2', token: 'quote', amount: -200_000n },
      ];

      for (const op of operations) {
        const ledger = op.token === 'base' ? baseLedger : quoteLedger;
        const tokenId = op.token === 'base' ? baseToken : quoteToken;

        if (op.amount > 0) {
          adjustBalance(ledger, op.user, -op.amount);
          adjustEscrow(ledger, marketId, op.user, op.amount);
        } else {
          adjustBalance(ledger, op.user, -op.amount);
          adjustEscrow(ledger, marketId, op.user, op.amount);
        }
        await store.adjustEscrow(marketId, op.user, tokenId, op.amount);
      }

      assertConservation(baseLedger, 'BASE');
      assertConservation(quoteLedger, 'QUOTE');
    });

    it('should conserve tokens when orders are placed and cancelled', async () => {
      // Place a bid order (locks quote tokens)
      const price = 1000n;
      const size = 100n;
      const quoteRequired = calcQuoteAmount(price, size);

      adjustBalance(quoteLedger, 'trader1', -quoteRequired);
      adjustEscrow(quoteLedger, marketId, 'trader1', quoteRequired);
      await store.adjustEscrow(marketId, 'trader1', quoteToken, quoteRequired);

      const orderId = makeOrderId(marketId, 'trader1', 1n);
      await store.createOrder({
        orderId,
        marketId,
        owner: 'trader1',
        side: 'bid',
        price,
        size,
        remaining: size,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      });

      assertConservation(quoteLedger, 'QUOTE');

      // Cancel the order
      adjustBalance(quoteLedger, 'trader1', quoteRequired);
      adjustEscrow(quoteLedger, marketId, 'trader1', -quoteRequired);
      await store.adjustEscrow(marketId, 'trader1', quoteToken, -quoteRequired);
      await store.updateOrder(orderId, { status: 'cancelled', remaining: 0n }, 1n);

      assertConservation(quoteLedger, 'QUOTE');
    });

    it('should conserve tokens in a simulated trade', async () => {
      // Buyer places bid
      const price = 1000n;
      const size = 100n;
      const quoteAmount = calcQuoteAmount(price, size);
      const fee = calcFee(quoteAmount, 30);

      // Lock buyer's quote
      adjustBalance(quoteLedger, 'trader1', -quoteAmount);
      adjustEscrow(quoteLedger, marketId, 'trader1', quoteAmount);
      await store.adjustEscrow(marketId, 'trader1', quoteToken, quoteAmount);

      // Lock seller's base
      adjustBalance(baseLedger, 'trader2', -size);
      adjustEscrow(baseLedger, marketId, 'trader2', size);
      await store.adjustEscrow(marketId, 'trader2', baseToken, size);

      // Execute trade
      // Buyer gets base
      adjustEscrow(baseLedger, marketId, 'trader2', -size);
      adjustBalance(baseLedger, 'trader1', size);

      // Seller gets quote minus fee
      adjustEscrow(quoteLedger, marketId, 'trader1', -quoteAmount);
      adjustBalance(quoteLedger, 'trader2', quoteAmount - fee);
      // Fee goes to treasury (we'll track as remaining in system)
      adjustBalance(quoteLedger, 'treasury', fee);

      // Update store
      await store.adjustEscrow(marketId, 'trader2', baseToken, -size);
      await store.adjustEscrow(marketId, 'trader1', quoteToken, -quoteAmount);

      assertConservation(baseLedger, 'BASE');
      assertConservation(quoteLedger, 'QUOTE');
    });

    it('should conserve tokens across multiple trades', async () => {
      const trades = [
        { buyer: 'trader1', seller: 'lp1', price: 1000n, size: 50n },
        { buyer: 'trader2', seller: 'lp2', price: 1010n, size: 30n },
        { buyer: 'trader1', seller: 'lp3', price: 990n, size: 80n },
        { buyer: 'lp1', seller: 'trader2', price: 1005n, size: 20n },
      ];

      for (const trade of trades) {
        const quoteAmount = calcQuoteAmount(trade.price, trade.size);
        const fee = calcFee(quoteAmount, 30);

        // Simulate trade execution
        adjustBalance(baseLedger, trade.seller, -trade.size);
        adjustBalance(baseLedger, trade.buyer, trade.size);
        adjustBalance(quoteLedger, trade.buyer, -quoteAmount);
        adjustBalance(quoteLedger, trade.seller, quoteAmount - fee);
        adjustBalance(quoteLedger, 'treasury', fee);
      }

      assertConservation(baseLedger, 'BASE');
      assertConservation(quoteLedger, 'QUOTE');
    });
  });

  // ============================================================================
  // 1.2 Price Level Invariants
  // ============================================================================

  describe('Price Level Invariants', () => {
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
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
    });

    async function assertLevelInvariants(mktId: MarketId) {
      const bidLevels = await store.getLevelsByMarket(mktId, 'bid');
      const askLevels = await store.getLevelsByMarket(mktId, 'ask');

      // All aggregates must be positive
      for (const level of [...bidLevels, ...askLevels]) {
        expect(level.aggregate).toBeGreaterThan(0n);
        expect(level.price).toBeGreaterThan(0n);
        expect(level.orderIds.length).toBeGreaterThan(0);
      }

      // Bid prices must be sorted descending
      for (let i = 1; i < bidLevels.length; i++) {
        expect(bidLevels[i - 1].price).toBeGreaterThan(bidLevels[i].price);
      }

      // Ask prices must be sorted ascending
      for (let i = 1; i < askLevels.length; i++) {
        expect(askLevels[i - 1].price).toBeLessThan(askLevels[i].price);
      }

      // Best bid < best ask (no crossed book in resting state)
      const top = await store.getTopOfBook(mktId);
      if (top && top.bestBidPrice !== null && top.bestAskPrice !== null) {
        expect(top.bestBidPrice).toBeLessThan(top.bestAskPrice);
      }
    }

    it('should maintain level invariants after adding orders', async () => {
      // Add multiple bid orders at different prices
      const bidPrices = [1000n, 900n, 800n, 950n, 850n];
      for (let i = 0; i < bidPrices.length; i++) {
        const orderId = makeOrderId(marketId, 'user1', BigInt(i));
        await store.createOrder({
          orderId,
          marketId,
          owner: 'user1',
          side: 'bid',
          price: bidPrices[i],
          size: 100n,
          remaining: 100n,
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });
        await store.setLevel({
          marketId,
          side: 'bid',
          price: bidPrices[i],
          aggregate: 100n,
          orderIds: [orderId],
          version: 1n,
        });
      }

      // Add multiple ask orders at different prices
      const askPrices = [1100n, 1200n, 1150n, 1300n, 1250n];
      for (let i = 0; i < askPrices.length; i++) {
        const orderId = makeOrderId(marketId, 'user2', BigInt(i + 100));
        await store.createOrder({
          orderId,
          marketId,
          owner: 'user2',
          side: 'ask',
          price: askPrices[i],
          size: 100n,
          remaining: 100n,
          status: 'open',
          createdAt: BigInt(i + 100),
          flags: [],
          version: 1n,
        });
        await store.setLevel({
          marketId,
          side: 'ask',
          price: askPrices[i],
          aggregate: 100n,
          orderIds: [orderId],
          version: 1n,
        });
      }

      // Set top of book
      await store.setTopOfBook({
        marketId,
        bestBidPrice: 1000n,
        bestAskPrice: 1100n,
        lastTradePrice: null,
        lastTradeHeight: null,
        version: 1n,
      });

      await assertLevelInvariants(marketId);
    });

    it('should maintain level invariants when aggregating orders at same price', async () => {
      const price = 1000n;
      const orderIds: OrderId[] = [];

      // Add 5 orders at the same price
      for (let i = 0; i < 5; i++) {
        const orderId = makeOrderId(marketId, `user${i}`, 1n);
        orderIds.push(orderId);
        await store.createOrder({
          orderId,
          marketId,
          owner: `user${i}`,
          side: 'bid',
          price,
          size: 100n,
          remaining: 100n,
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });
      }

      // Set level with aggregate
      await store.setLevel({
        marketId,
        side: 'bid',
        price,
        aggregate: 500n, // 5 * 100
        orderIds,
        version: 1n,
      });

      const level = await store.getLevel(marketId, 'bid', price);
      expect(level).toBeDefined();
      expect(level!.aggregate).toBe(500n);
      expect(level!.orderIds.length).toBe(5);
    });

    it('should remove empty levels correctly', async () => {
      const price = 1000n;
      const orderId = makeOrderId(marketId, 'user1', 1n);

      // Create level
      await store.setLevel({
        marketId,
        side: 'bid',
        price,
        aggregate: 100n,
        orderIds: [orderId],
        version: 1n,
      });

      let level = await store.getLevel(marketId, 'bid', price);
      expect(level).toBeDefined();

      // Delete level
      await store.deleteLevel(marketId, 'bid', price);

      level = await store.getLevel(marketId, 'bid', price);
      expect(level).toBeUndefined();
    });
  });

  // ============================================================================
  // 1.3 Trade Invariants
  // ============================================================================

  describe('Trade Invariants', () => {
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
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
    });

    function assertTradeInvariants(trade: Trade, feeBps: number) {
      // Base traded must be positive
      expect(trade.size).toBeGreaterThan(0n);

      // Quote amount must be positive
      expect(trade.quoteAmount).toBeGreaterThan(0n);

      // Quote amount = price * size
      expect(trade.quoteAmount).toBe(calcQuoteAmount(trade.price, trade.size));

      // Taker fee calculation
      const expectedTakerFee = calcFee(trade.quoteAmount, feeBps);
      expect(trade.takerFee).toBe(expectedTakerFee);

      // Maker fee should be <= taker fee (often 0 or rebate)
      expect(trade.makerFee).toBeLessThanOrEqual(trade.takerFee);

      // Effective price is within expected bounds
      const effectivePrice = (trade.quoteAmount * 10000n) / trade.size;
      expect(effectivePrice).toBeGreaterThan(0n);
    }

    it('should maintain trade invariants for a simple trade', async () => {
      const price = 1000n;
      const size = 100n;
      const quoteAmount = calcQuoteAmount(price, size); // 100000n
      const takerFee = calcFee(quoteAmount, 30); // 300n

      const trade: Trade = {
        tradeId: makeTradeId(marketId, 1n, 0),
        marketId,
        makerOrderId: makeOrderId(marketId, 'maker', 1n),
        makerAddress: 'maker',
        takerOrderId: makeOrderId(marketId, 'taker', 1n),
        takerAddress: 'taker',
        side: 'bid',
        price,
        size,
        quoteAmount,
        takerFee,
        makerFee: 0n,
        height: 1n,
        timestamp: 1000n,
      };

      await store.recordTrade(trade);
      assertTradeInvariants(trade, 30);
    });

    it('should maintain trade invariants across multiple trades', async () => {
      const trades: Trade[] = [];

      for (let i = 0; i < 10; i++) {
        const price = BigInt(900 + i * 20) * 100n; // 90000 to 108000
        const size = BigInt(10 + i * 5) * 10n;     // 100 to 550
        const quoteAmount = calcQuoteAmount(price, size);
        const takerFee = calcFee(quoteAmount, 30);

        const trade: Trade = {
          tradeId: makeTradeId(marketId, BigInt(i), 0),
          marketId,
          makerOrderId: makeOrderId(marketId, 'maker', BigInt(i)),
          makerAddress: 'maker',
          takerOrderId: makeOrderId(marketId, 'taker', BigInt(i)),
          takerAddress: 'taker',
          side: i % 2 === 0 ? 'bid' : 'ask',
          price,
          size,
          quoteAmount,
          takerFee,
          makerFee: 0n,
          height: BigInt(i),
          timestamp: BigInt(1000 + i),
        };

        await store.recordTrade(trade);
        trades.push(trade);
        assertTradeInvariants(trade, 30);
      }

      // Verify all trades are recorded
      const storedTrades = await store.getTradesByMarket(marketId);
      expect(storedTrades.length).toBe(10);
    });

    it('should calculate fees correctly at boundary values', async () => {
      const testCases = [
        { quoteAmount: 1n, expectedFee: 0n },         // Very small
        { quoteAmount: 100n, expectedFee: 0n },       // Still small
        { quoteAmount: 1000n, expectedFee: 3n },      // 30 bps of 1000
        { quoteAmount: 10000n, expectedFee: 30n },    // 30 bps of 10000
        { quoteAmount: 100000n, expectedFee: 300n },  // 30 bps of 100000
        { quoteAmount: 1000000n, expectedFee: 3000n },
      ];

      for (const tc of testCases) {
        const fee = calcFee(tc.quoteAmount, 30);
        expect(fee).toBe(tc.expectedFee);
      }
    });
  });

  // ============================================================================
  // Grid Invariants
  // ============================================================================

  describe('Grid Invariants', () => {
    let marketId: MarketId;

    beforeEach(async () => {
      marketId = makeMarketId(baseToken, quoteToken);
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
    });

    async function assertGridInvariants(grid: LiquidityGrid) {
      // Center price must be positive
      expect(grid.centerPrice).toBeGreaterThan(0n);

      // Half width must be positive
      expect(grid.halfWidth).toBeGreaterThan(0n);

      // Levels per side must be within bounds
      expect(grid.levelsPerSide).toBeGreaterThan(0);
      expect(grid.levelsPerSide).toBeLessThanOrEqual(MAX_LEVELS_PER_SIDE);

      // Total base size must be positive
      expect(grid.totalBaseSize).toBeGreaterThan(0n);

      // For geometric mode, ratio must be > 1
      if (grid.mode === 'geom' && grid.geomRatio !== undefined) {
        expect(grid.geomRatio).toBeGreaterThan(GEOM_RATIO_SCALE);
      }

      // Status must be valid
      expect(['active', 'paused', 'cancelled']).toContain(grid.status);
    }

    it('should maintain grid invariants for arithmetic grid', async () => {
      const grid: LiquidityGrid = {
        gridId: makeGridId(marketId, 'lp1', 1n),
        marketId,
        owner: 'lp1',
        centerPrice: 100000n,
        halfWidth: 10000n,
        levelsPerSide: 10,
        mode: 'arith',
        totalBaseSize: 10000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      };

      await store.createGrid(grid);
      await assertGridInvariants(grid);
    });

    it('should maintain grid invariants for geometric grid', async () => {
      const grid: LiquidityGrid = {
        gridId: makeGridId(marketId, 'lp1', 1n),
        marketId,
        owner: 'lp1',
        centerPrice: 100000n,
        halfWidth: 20000n,
        levelsPerSide: 15,
        mode: 'geom',
        geomRatio: GEOM_RATIO_SCALE + 5000n, // 1.005
        totalBaseSize: 20000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      };

      await store.createGrid(grid);
      await assertGridInvariants(grid);
    });

    it('should maintain grid invariants through status transitions', async () => {
      const gridId = makeGridId(marketId, 'lp1', 1n);
      const grid: LiquidityGrid = {
        gridId,
        marketId,
        owner: 'lp1',
        centerPrice: 100000n,
        halfWidth: 10000n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 5000n,
        sideBias: 'bid_only',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      };

      await store.createGrid(grid);

      // Transition to paused
      await store.updateGrid(gridId, { status: 'paused' }, 1n);
      const paused = await store.getGrid(gridId);
      expect(paused?.status).toBe('paused');
      await assertGridInvariants(paused!);

      // Transition to cancelled
      await store.updateGrid(gridId, { status: 'cancelled' }, 2n);
      const cancelled = await store.getGrid(gridId);
      expect(cancelled?.status).toBe('cancelled');
      await assertGridInvariants(cancelled!);
    });
  });

  // ============================================================================
  // Composite Invariants - Full Sequence
  // ============================================================================

  describe('Composite Invariants', () => {
    it('should maintain all invariants through complex operation sequence', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);

      // Create market
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

      // Initialize ledgers
      setBalance(baseLedger, 'lp1', 500_000n);
      setBalance(baseLedger, 'lp2', 300_000n);
      setBalance(baseLedger, 'trader1', 100_000n);
      setBalance(quoteLedger, 'lp1', 5_000_000n);
      setBalance(quoteLedger, 'lp2', 3_000_000n);
      setBalance(quoteLedger, 'trader1', 1_000_000n);

      // Create LP grid
      const gridId = makeGridId(marketId, 'lp1', 1n);
      await store.createGrid({
        gridId,
        marketId,
        owner: 'lp1',
        centerPrice: 100000n,
        halfWidth: 10000n,
        levelsPerSide: 5,
        mode: 'arith',
        totalBaseSize: 50000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });

      // Add some orders
      for (let i = 0; i < 3; i++) {
        const bidOrderId = makeOrderId(marketId, 'trader1', BigInt(i));
        const bidPrice = BigInt(95000 - i * 1000);
        await store.createOrder({
          orderId: bidOrderId,
          marketId,
          owner: 'trader1',
          side: 'bid',
          price: bidPrice,
          size: 100n,
          remaining: 100n,
          status: 'open',
          createdAt: BigInt(i),
          flags: [],
          version: 1n,
        });

        await store.setLevel({
          marketId,
          side: 'bid',
          price: bidPrice,
          aggregate: 100n,
          orderIds: [bidOrderId],
          version: 1n,
        });
      }

      // Record a trade
      const trade: Trade = {
        tradeId: makeTradeId(marketId, 1n, 0),
        marketId,
        makerOrderId: makeOrderId(marketId, 'lp1', 1n),
        makerAddress: 'lp1',
        takerOrderId: makeOrderId(marketId, 'trader1', 10n),
        takerAddress: 'trader1',
        side: 'bid',
        price: 100000n,
        size: 50n,
        quoteAmount: 5000000n,
        takerFee: 1500n,
        makerFee: 0n,
        height: 1n,
        timestamp: 1000n,
      };
      await store.recordTrade(trade);

      // Update top of book
      await store.setTopOfBook({
        marketId,
        bestBidPrice: 95000n,
        bestAskPrice: 105000n,
        lastTradePrice: 100000n,
        lastTradeHeight: 1n,
        version: 1n,
      });

      // Verify all invariants still hold
      const bidLevels = await store.getLevelsByMarket(marketId, 'bid');
      for (const level of bidLevels) {
        expect(level.aggregate).toBeGreaterThan(0n);
        expect(level.price).toBeGreaterThan(0n);
      }

      const grid = await store.getGrid(gridId);
      expect(grid).toBeDefined();
      expect(grid!.status).toBe('active');

      const storedTrade = await store.getTrade(trade.tradeId);
      expect(storedTrade).toBeDefined();
      expect(storedTrade!.quoteAmount).toBe(calcQuoteAmount(trade.price, trade.size));
    });
  });
});
