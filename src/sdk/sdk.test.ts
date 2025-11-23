/**
 * SDK Unit Tests
 *
 * Tests for the WSTF SDK core functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// SDK imports
import {
  WSTFSDK,
  SigAlg,
  Side,
  SpreadMode,
  SideBias,
  OrderFlag,
  TrustTier,
  createSigner,
  importSigner,
  KeypairSigner,
  buildAuthToken,
  parseAuthToken,
  isAuthTokenExpired,
  getAuthTokenTTL,
  GEOM_RATIO_SCALE,
  MAX_LEVELS_PER_SIDE,
} from './index';

// Internal imports for testing
import { createSimpleRPC } from '../rpc/simple';

// ============================================================================
// Signer Tests
// ============================================================================

describe('Signer', () => {
  describe('KeypairSigner', () => {
    it('should generate Ed25519 keypair', () => {
      const signer = createSigner(SigAlg.ED25519);

      expect(signer.address).toMatch(/^gc/);
      expect(signer.sigAlg).toBe(SigAlg.ED25519);
    });

    it('should generate SECP256K1 keypair', () => {
      const signer = createSigner(SigAlg.SECP256K1);

      expect(signer.address).toMatch(/^gc/);
      expect(signer.sigAlg).toBe(SigAlg.SECP256K1);
    });

    it('should sign data', async () => {
      const signer = createSigner(SigAlg.ED25519);
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const signature = await signer.sign(data);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should export public key DER', () => {
      const signer = createSigner(SigAlg.ED25519);

      const pubDER = signer.getPublicKeyDER();

      expect(pubDER).toBeInstanceOf(Uint8Array);
      expect(pubDER.length).toBeGreaterThan(0);
    });

    it('should generate different addresses for different keypairs', () => {
      const signer1 = createSigner(SigAlg.ED25519);
      const signer2 = createSigner(SigAlg.ED25519);

      expect(signer1.address).not.toBe(signer2.address);
    });
  });

  describe('WSTFAuth Token', () => {
    let signer: ReturnType<typeof createSigner>;

    beforeEach(() => {
      signer = createSigner(SigAlg.ED25519);
    });

    it('should create auth token', () => {
      const token = signer.createAuthToken('test-program');

      expect(token).toBeTruthy();
      expect(token.includes('.')).toBe(true);
    });

    it('should create scoped token', () => {
      const token = signer.createScopedToken('test-program', ['read', 'write']);

      expect(token).toBeTruthy();

      const parsed = parseAuthToken(token);
      expect(parsed).toBeTruthy();
      expect(parsed?.scp).toEqual(['read', 'write']);
    });

    it('should parse auth token', () => {
      const token = signer.createAuthToken('test-program');
      const parsed = parseAuthToken(token);

      expect(parsed).toBeTruthy();
      expect(parsed?.sub).toBe(signer.address);
      expect(parsed?.aud).toBe('test-program');
      expect(parsed?.iat).toBeDefined();
      expect(parsed?.exp).toBeDefined();
    });

    it('should detect non-expired token', () => {
      const token = signer.createAuthToken('test-program', { ttlSeconds: 300 });

      expect(isAuthTokenExpired(token)).toBe(false);
    });

    it('should get token TTL', () => {
      const token = signer.createAuthToken('test-program', { ttlSeconds: 300 });
      const ttl = getAuthTokenTTL(token);

      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should build token with fluent API', () => {
      const token = buildAuthToken(signer)
        .audience('test-program')
        .scopes('read', 'write')
        .ttl(600)
        .jti()
        .claim('custom', 'value')
        .sign(signer);

      const parsed = parseAuthToken(token);
      expect(parsed?.aud).toBe('test-program');
      expect(parsed?.scp).toContain('read');
      expect(parsed?.jti).toBeDefined();
    });
  });
});

// ============================================================================
// SDK Integration Tests
// ============================================================================

describe('WSTFSDK', () => {
  let sdk: WSTFSDK;
  let rpc: ReturnType<typeof createSimpleRPC>;

  beforeEach(() => {
    rpc = createSimpleRPC();
    sdk = WSTFSDK.createForTesting(rpc);
  });

  describe('Initialization', () => {
    it('should create SDK instance', () => {
      expect(sdk).toBeDefined();
      expect(sdk.address).toMatch(/^gc/);
    });

    it('should have all modules', () => {
      expect(sdk.client).toBeDefined();
      expect(sdk.signer).toBeDefined();
      expect(sdk.tokens).toBeDefined();
      expect(sdk.markets).toBeDefined();
      expect(sdk.vars).toBeDefined();
    });

    it('should create auth tokens', () => {
      const token = sdk.createAuthToken('test-program');
      expect(token).toBeTruthy();
    });

    it('should create scoped tokens', () => {
      const token = sdk.createScopedToken('test-program', ['scope1', 'scope2']);
      expect(token).toBeTruthy();
    });
  });

  describe('Static Methods', () => {
    it('should generate signer', () => {
      const signer = WSTFSDK.generateSigner(SigAlg.ED25519);
      expect(signer.address).toMatch(/^gc/);
    });

    it('should create for testing', () => {
      const testSdk = WSTFSDK.createForTesting(rpc);
      expect(testSdk).toBeDefined();
    });
  });
});

// ============================================================================
// TokensSDK Tests
// ============================================================================

describe('TokensSDK', () => {
  let sdk: WSTFSDK;

  beforeEach(() => {
    const rpc = createSimpleRPC();
    sdk = WSTFSDK.createForTesting(rpc);
  });

  describe('Utility Methods', () => {
    it('should format amount with decimals', () => {
      const formatted = sdk.tokens.formatAmount(123456789n, 6);
      expect(formatted).toBe('123.456789');
    });

    it('should format whole amount', () => {
      const formatted = sdk.tokens.formatAmount(1000000n, 6);
      expect(formatted).toBe('1');
    });

    it('should format amount with trailing zeros trimmed', () => {
      const formatted = sdk.tokens.formatAmount(1500000n, 6);
      expect(formatted).toBe('1.5');
    });

    it('should parse amount string', () => {
      const parsed = sdk.tokens.parseAmount('123.456789', 6);
      expect(parsed).toBe(123456789n);
    });

    it('should parse whole amount', () => {
      const parsed = sdk.tokens.parseAmount('100', 6);
      expect(parsed).toBe(100000000n);
    });

    it('should parse amount with fewer decimals', () => {
      const parsed = sdk.tokens.parseAmount('1.5', 6);
      expect(parsed).toBe(1500000n);
    });
  });
});

// ============================================================================
// MarketsSDK Tests
// ============================================================================

describe('MarketsSDK', () => {
  let sdk: WSTFSDK;

  beforeEach(() => {
    const rpc = createSimpleRPC();
    sdk = WSTFSDK.createForTesting(rpc);
  });

  describe('Utility Methods', () => {
    it('should calculate order escrow for bid', () => {
      const { baseAmount, quoteAmount } = sdk.markets.calculateOrderEscrow(
        Side.BID,
        100n, // price
        10n,  // size
        30    // feeBps
      );

      // For a bid: need quote tokens
      expect(baseAmount).toBe(0n);
      // 100 * 10 = 1000 + 0.3% fee = 1003
      expect(quoteAmount).toBe(1003n);
    });

    it('should calculate order escrow for ask', () => {
      const { baseAmount, quoteAmount } = sdk.markets.calculateOrderEscrow(
        Side.ASK,
        100n, // price
        10n,  // size
        30    // feeBps
      );

      // For an ask: need base tokens
      expect(baseAmount).toBe(10n);
      expect(quoteAmount).toBe(0n);
    });

    it('should align price to tick', () => {
      const aligned = sdk.markets.alignToTick(12345n, 100n);
      expect(aligned).toBe(12300n);
    });

    it('should align size to lot', () => {
      const aligned = sdk.markets.alignToLot(12345n, 1000n);
      expect(aligned).toBe(12000n);
    });

    it('should calculate arithmetic grid levels', () => {
      const levels = sdk.markets.calculateGridLevels({
        marketId: 'mkt_test' as any,
        centerPrice: 10000n,
        halfWidth: 1000n,
        levelsPerSide: 5,
        mode: SpreadMode.ARITHMETIC,
        totalBaseSize: 100n,
        sideBias: SideBias.BOTH,
      });

      // Should have 10 levels (5 bids + 5 asks)
      expect(levels.length).toBe(10);

      // Check bid levels are below center
      const bids = levels.filter(l => l.side === Side.BID);
      expect(bids.every(b => b.price < 10000n)).toBe(true);

      // Check ask levels are above center
      const asks = levels.filter(l => l.side === Side.ASK);
      expect(asks.every(a => a.price > 10000n)).toBe(true);
    });

    it('should calculate bid-only grid levels', () => {
      const levels = sdk.markets.calculateGridLevels({
        marketId: 'mkt_test' as any,
        centerPrice: 10000n,
        halfWidth: 1000n,
        levelsPerSide: 5,
        mode: SpreadMode.ARITHMETIC,
        totalBaseSize: 100n,
        sideBias: SideBias.BID_ONLY,
      });

      // Should have 5 levels (bids only)
      expect(levels.length).toBe(5);
      expect(levels.every(l => l.side === Side.BID)).toBe(true);
    });
  });
});

// ============================================================================
// VarsSDK Tests
// ============================================================================

describe('VarsSDK', () => {
  let sdk: WSTFSDK;

  beforeEach(() => {
    const rpc = createSimpleRPC();
    sdk = WSTFSDK.createForTesting(rpc);
  });

  describe('Namespace Helpers', () => {
    it('should get my namespace', () => {
      const ns = sdk.vars.myNamespace();
      expect(ns).toBe(`account:${sdk.address}`);
    });

    it('should get org namespace', () => {
      const ns = sdk.vars.orgNamespace('org123');
      expect(ns).toBe('org:org123');
    });

    it('should get app namespace', () => {
      const ns = sdk.vars.appNamespace('app456');
      expect(ns).toBe('app:app456');
    });

    it('should get global namespace', () => {
      const ns = sdk.vars.globalNamespace();
      expect(ns).toBe('global');
    });
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('SDK Constants', () => {
  it('should export GEOM_RATIO_SCALE', () => {
    expect(GEOM_RATIO_SCALE).toBe(1000000n);
  });

  it('should export MAX_LEVELS_PER_SIDE', () => {
    expect(MAX_LEVELS_PER_SIDE).toBe(64);
  });

  it('should export TrustTier enum', () => {
    expect(TrustTier.PREFLIGHT).toBe(0);
    expect(TrustTier.ADMITTED).toBe(1);
    expect(TrustTier.INCLUDED).toBe(2);
    expect(TrustTier.K_DEPTH).toBe(3);
    expect(TrustTier.CROSS_CHAIN).toBe(4);
  });

  it('should export Side enum', () => {
    expect(Side.BID).toBe('bid');
    expect(Side.ASK).toBe('ask');
  });

  it('should export SpreadMode enum', () => {
    expect(SpreadMode.ARITHMETIC).toBe('arith');
    expect(SpreadMode.GEOMETRIC).toBe('geom');
  });

  it('should export SideBias enum', () => {
    expect(SideBias.BOTH).toBe('both');
    expect(SideBias.BID_ONLY).toBe('bid_only');
    expect(SideBias.ASK_ONLY).toBe('ask_only');
  });

  it('should export OrderFlag enum', () => {
    expect(OrderFlag.POST_ONLY).toBe('post_only');
    expect(OrderFlag.IOC).toBe('ioc');
    expect(OrderFlag.FOK).toBe('fok');
  });
});

// ============================================================================
// High-Level Helper Tests
// ============================================================================

describe('High-Level Helpers', () => {
  let sdk: WSTFSDK;

  beforeEach(() => {
    const rpc = createSimpleRPC();
    sdk = WSTFSDK.createForTesting(rpc);
  });

  describe('LPHelper', () => {
    it('should export GRID_PRESETS', async () => {
      const { GRID_PRESETS } = await import('./highlevel/lp');

      expect(GRID_PRESETS.STABLE_PAIR).toBeDefined();
      expect(GRID_PRESETS.MAJOR_PAIR).toBeDefined();
      expect(GRID_PRESETS.VOLATILE_PAIR).toBeDefined();
      expect(GRID_PRESETS.ACCUMULATE).toBeDefined();
      expect(GRID_PRESETS.DISTRIBUTE).toBeDefined();
    });

    it('should validate grid params', async () => {
      const { createLPHelper } = await import('./highlevel/lp');
      const helper = createLPHelper(sdk.markets, sdk.tokens);

      // Invalid center price
      let result = helper.validateGridParams({
        marketId: 'test' as any,
        centerPrice: 0n,
        halfWidth: 100n,
        levelsPerSide: 10,
        mode: SpreadMode.ARITHMETIC,
        totalBaseSize: 1000n,
        sideBias: SideBias.BOTH,
      });
      expect(result.valid).toBe(false);

      // Invalid half width
      result = helper.validateGridParams({
        marketId: 'test' as any,
        centerPrice: 1000n,
        halfWidth: 1000n, // >= center price
        levelsPerSide: 10,
        mode: SpreadMode.ARITHMETIC,
        totalBaseSize: 1000n,
        sideBias: SideBias.BOTH,
      });
      expect(result.valid).toBe(false);

      // Valid params
      result = helper.validateGridParams({
        marketId: 'test' as any,
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: 10,
        mode: SpreadMode.ARITHMETIC,
        totalBaseSize: 1000n,
        sideBias: SideBias.BOTH,
      });
      expect(result.valid).toBe(true);
    });

    it('should estimate fees', async () => {
      const { createLPHelper } = await import('./highlevel/lp');
      const helper = createLPHelper(sdk.markets, sdk.tokens);

      const fees = helper.estimateFees(
        1000000n, // grid value
        30,       // 0.3% fee
        2         // 2x turnover per day
      );

      expect(fees.dailyFees).toBe(6000n);  // 1M * 30bps * 2
      expect(fees.weeklyFees).toBe(42000n);
      expect(fees.monthlyFees).toBe(180000n);
      expect(fees.apyBps).toBeGreaterThan(0);
    });
  });

  describe('TradingHelper', () => {
    it('should create trading helper', async () => {
      const { createTradingHelper } = await import('./highlevel/trading');
      const helper = createTradingHelper(sdk.markets, sdk.tokens);

      expect(helper).toBeDefined();
    });
  });
});
