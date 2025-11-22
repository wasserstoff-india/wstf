/**
 * Markets + Authorization Integration Tests
 *
 * Tests cross-module integration between:
 * - Markets module (orderbook operations)
 * - WSTFAuth (token authentication)
 * - Org/RBAC (permission checks)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

// Crypto imports
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { deriveAddress } from '../crypto/address';
// Note: exportPubDER is used in createTestUser helper
import { SigAlgId, MappingAlgId } from '../crypto/algorithms';

// Auth imports
import { signToken, validateToken } from '../auth/wstf';
import { signBoundToken, validateBoundToken } from '../auth/binding';

// Markets imports
import {
  MarketId,
  makeMarketId,
  makeOrderId,
  makeGridId,
  Side,
} from '../markets/types';
import { makeTokenId } from '../tokens/types';
import { InMemoryMarketStore } from '../markets/store';

// ============================================================================
// Test Helpers
// ============================================================================

interface TestUser {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  address: string;
  sigAlg: SigAlgId;
}

function createTestUser(sigAlg: SigAlgId = SigAlgId.ED25519): TestUser {
  const kp = generateKeypair(sigAlg);
  const pubDER = exportPubDER(kp.publicKey);
  const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, sigAlg);
  return {
    privateKey: kp.privateKey,
    publicKey: kp.publicKey,
    address,
    sigAlg,
  };
}

function createAuthToken(user: TestUser, programId: string, ttl: number = 300): string {
  return signToken(user.privateKey, user.sigAlg, {
    sub: user.address,
    aud: programId,
  }, ttl);
}

function createBoundToken(
  user: TestUser,
  programId: string,
  scopes: string[],
  ttl: number = 300
): string {
  return signBoundToken(user.privateKey, user.sigAlg, {
    sub: user.address,
    aud: programId,
    scp: scopes,
  }, ttl);
}

// ============================================================================
// Tests
// ============================================================================

describe('Markets + Auth Integration', () => {
  let marketStore: InMemoryMarketStore;
  let admin: TestUser;
  let trader: TestUser;
  let marketMaker: TestUser;

  const PROGRAM_ID = 'markets-program';

  beforeEach(() => {
    marketStore = new InMemoryMarketStore();
    admin = createTestUser();
    trader = createTestUser();
    marketMaker = createTestUser();
  });

  describe('Token Authentication', () => {
    it('should create and validate auth tokens', () => {
      const token = createAuthToken(admin, PROGRAM_ID);

      const result = validateToken(token, admin.publicKey, admin.sigAlg, PROGRAM_ID);

      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe(admin.address);
      expect(result.payload?.aud).toBe(PROGRAM_ID);
    });

    it('should reject expired tokens', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(admin.privateKey, admin.sigAlg, {
        sub: admin.address,
        aud: PROGRAM_ID,
        iat: now - 1000, // Issued 1000 seconds ago
        exp: now - 100,  // Expired 100 seconds ago (well past clock skew)
      });

      const result = validateToken(token, admin.publicKey, admin.sigAlg, PROGRAM_ID);

      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('should reject tokens for wrong audience', () => {
      const token = createAuthToken(admin, PROGRAM_ID);

      const result = validateToken(token, admin.publicKey, admin.sigAlg, 'wrong-program');

      expect(result.valid).toBe(false);
      expect(result.code).toBe('WRONG_AUDIENCE');
    });

    it('should validate scoped tokens', () => {
      const token = createBoundToken(admin, PROGRAM_ID, ['market:create', 'order:place']);

      const result = validateBoundToken(token, admin.publicKey, admin.sigAlg, PROGRAM_ID, {
        requiredScopes: ['market:create'],
      });

      expect(result.valid).toBe(true);
    });

    it('should reject tokens missing required scopes', () => {
      const token = createBoundToken(trader, PROGRAM_ID, ['order:place']);

      const result = validateBoundToken(token, trader.publicKey, trader.sigAlg, PROGRAM_ID, {
        requiredScopes: ['market:create'],
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('Market Operations with Auth', () => {
    const baseToken = makeTokenId('BTC');
    const quoteToken = makeTokenId('USDT');

    it('should allow authenticated user to create markets', async () => {
      // Validate token first
      const token = createAuthToken(admin, PROGRAM_ID);
      const authResult = validateToken(token, admin.publicKey, admin.sigAlg, PROGRAM_ID);
      expect(authResult.valid).toBe(true);

      // Then create market
      const marketId = makeMarketId(baseToken, quoteToken);
      await marketStore.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 100n,
        lotSize: 100000n,
        feeBps: 30,
        status: 'active',
        creator: admin.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      const market = await marketStore.getMarket(marketId);
      expect(market).toBeDefined();
      expect(market!.status).toBe('active');
    });

    it('should allow authenticated user to place orders', async () => {
      const token = createAuthToken(trader, PROGRAM_ID);
      const authResult = validateToken(token, trader.publicKey, trader.sigAlg, PROGRAM_ID);
      expect(authResult.valid).toBe(true);

      const marketId = makeMarketId(baseToken, quoteToken);
      await marketStore.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 100n,
        lotSize: 100000n,
        feeBps: 30,
        status: 'active',
        creator: admin.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      const orderId = makeOrderId(marketId, trader.address, 1n);
      await marketStore.createOrder({
        orderId,
        marketId,
        owner: trader.address,
        side: 'bid' as Side,
        price: 50000_00n,
        size: 100000n,
        remaining: 100000n,
        status: 'open',
        flags: [],
        createdAt: 1n,
        version: 1n,
      });

      const order = await marketStore.getOrder(orderId);
      expect(order).toBeDefined();
      expect(order!.owner).toBe(trader.address);
    });

    it('should allow authenticated user to create grids', async () => {
      const token = createAuthToken(marketMaker, PROGRAM_ID);
      const authResult = validateToken(token, marketMaker.publicKey, marketMaker.sigAlg, PROGRAM_ID);
      expect(authResult.valid).toBe(true);

      const marketId = makeMarketId(baseToken, quoteToken);
      await marketStore.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 100n,
        lotSize: 100000n,
        feeBps: 30,
        status: 'active',
        creator: admin.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      const gridId = makeGridId(marketId, marketMaker.address, 1n);
      await marketStore.createGrid({
        gridId,
        marketId,
        owner: marketMaker.address,
        centerPrice: 50000_00n,
        halfWidth: 5000_00n,
        levelsPerSide: 10,
        mode: 'arith',
        totalBaseSize: 1_000_000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });

      const grid = await marketStore.getGrid(gridId);
      expect(grid).toBeDefined();
      expect(grid!.owner).toBe(marketMaker.address);
    });
  });

  describe('Escrow Integration', () => {
    const baseToken = makeTokenId('ETH');
    const quoteToken = makeTokenId('USDC');

    it('should track escrow per user per market', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);

      await marketStore.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1000000000000000n,
        feeBps: 25,
        status: 'active',
        creator: admin.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      await marketStore.adjustEscrow(marketId, trader.address, quoteToken, 10000_000000n);

      const escrow = await marketStore.getEscrow(marketId, trader.address, quoteToken);
      expect(escrow?.lockedAmount).toBe(10000_000000n);

      await marketStore.adjustEscrow(marketId, trader.address, quoteToken, -5000_000000n);

      const remaining = await marketStore.getEscrow(marketId, trader.address, quoteToken);
      expect(remaining?.lockedAmount).toBe(5000_000000n);
    });

    it('should isolate escrow between users', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);

      await marketStore.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1000000000000000n,
        feeBps: 25,
        status: 'active',
        creator: admin.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      await marketStore.adjustEscrow(marketId, trader.address, quoteToken, 10000_000000n);
      await marketStore.adjustEscrow(marketId, marketMaker.address, quoteToken, 50000_000000n);

      const traderEscrow = await marketStore.getEscrow(marketId, trader.address, quoteToken);
      const mmEscrow = await marketStore.getEscrow(marketId, marketMaker.address, quoteToken);

      expect(traderEscrow?.lockedAmount).toBe(10000_000000n);
      expect(mmEscrow?.lockedAmount).toBe(50000_000000n);
    });
  });

  describe('Order Ownership Enforcement', () => {
    const baseToken = makeTokenId('SOL');
    const quoteToken = makeTokenId('USDC');

    it('should track order ownership', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);
      await marketStore.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 1000000000n,
        feeBps: 20,
        status: 'active',
        creator: admin.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      const orderId = makeOrderId(marketId, trader.address, 1n);
      await marketStore.createOrder({
        orderId,
        marketId,
        owner: trader.address,
        side: 'ask' as Side,
        price: 100_00n,
        size: 10_000000000n,
        remaining: 10_000000000n,
        status: 'open',
        flags: [],
        createdAt: 1n,
        version: 1n,
      });

      const order = await marketStore.getOrder(orderId);
      expect(order!.owner).toBe(trader.address);
      expect(order!.owner === marketMaker.address).toBe(false);
    });
  });

  describe('Market Status', () => {
    const baseToken = makeTokenId('AVAX');
    const quoteToken = makeTokenId('USDT');

    it('should track market status', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);

      await marketStore.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 100000000n,
        feeBps: 30,
        status: 'paused',
        creator: admin.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      const market = await marketStore.getMarket(marketId);
      expect(market!.status).toBe('paused');
    });

    it('should allow status updates', async () => {
      const marketId = makeMarketId(baseToken, quoteToken);

      await marketStore.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 1n,
        lotSize: 100000000n,
        feeBps: 30,
        status: 'active',
        creator: admin.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      const market = await marketStore.getMarket(marketId);
      await marketStore.updateMarket(marketId, { status: 'paused' }, market!.version);

      const updated = await marketStore.getMarket(marketId);
      expect(updated!.status).toBe('paused');
    });
  });

  describe('Token Scope Validation', () => {
    it('should require matching scopes', () => {
      const user = createTestUser();
      const limitedToken = createBoundToken(user, PROGRAM_ID, ['order:view']);

      const result = validateBoundToken(limitedToken, user.publicKey, user.sigAlg, PROGRAM_ID, {
        requiredScopes: ['order:place'],
      });

      expect(result.valid).toBe(false);
    });

    it('should allow matching scopes', () => {
      const user = createTestUser();
      const fullToken = createBoundToken(user, PROGRAM_ID, ['order:place', 'order:cancel']);

      const result = validateBoundToken(fullToken, user.publicKey, user.sigAlg, PROGRAM_ID, {
        requiredScopes: ['order:place'],
      });

      expect(result.valid).toBe(true);
    });
  });
});

describe('Markets Determinism with Auth Context', () => {
  let marketStore1: InMemoryMarketStore;
  let marketStore2: InMemoryMarketStore;

  beforeEach(() => {
    marketStore1 = new InMemoryMarketStore();
    marketStore2 = new InMemoryMarketStore();
  });

  it('should produce identical state given same operations', async () => {
    const user = createTestUser();
    const baseToken = makeTokenId('BTC');
    const quoteToken = makeTokenId('USDC');
    const marketId = makeMarketId(baseToken, quoteToken);

    const operations = async (store: InMemoryMarketStore) => {
      await store.createMarket({
        marketId,
        baseTokenId: baseToken,
        quoteTokenId: quoteToken,
        tickSize: 100n,
        lotSize: 100000n,
        feeBps: 30,
        status: 'active',
        creator: user.address,
        createdAtHeight: 1n,
        version: 1n,
      });

      const orderId = makeOrderId(marketId, user.address, 1n);
      await store.createOrder({
        orderId,
        marketId,
        owner: user.address,
        side: 'bid' as Side,
        price: 50000_00n,
        size: 100000n,
        remaining: 100000n,
        status: 'open',
        flags: [],
        createdAt: 1n,
        version: 1n,
      });

      await store.adjustEscrow(marketId, user.address, quoteToken, 50000_00n);
    };

    await operations(marketStore1);
    await operations(marketStore2);

    const market1 = await marketStore1.getMarket(marketId);
    const market2 = await marketStore2.getMarket(marketId);
    expect(market1).toStrictEqual(market2);

    const order1 = await marketStore1.getOrder(makeOrderId(marketId, user.address, 1n));
    const order2 = await marketStore2.getOrder(makeOrderId(marketId, user.address, 1n));
    expect(order1).toStrictEqual(order2);

    const escrow1 = await marketStore1.getEscrow(marketId, user.address, quoteToken);
    const escrow2 = await marketStore2.getEscrow(marketId, user.address, quoteToken);
    expect(escrow1).toStrictEqual(escrow2);
  });
});
