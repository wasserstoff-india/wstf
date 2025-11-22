/**
 * Mood Game Tests
 *
 * End-to-end test harness that proves:
 * - WSTFAuth cryptography is sound (tampering fails)
 * - Binding between token and HTTP request is enforced
 * - Trust tiers genuinely gate high-value actions
 * - Balance/fees logic can be layered on top
 * - Service only "reaches the URL" when all factors are satisfied
 *
 * Scoreboard:
 * | Scenario          | Auth | Tier | Balance | External | Mood   | Status |
 * |-------------------|------|------|---------|----------|--------|--------|
 * | Happy path        | OK   | OK   | OK      | OK       | happy  | 200    |
 * | Bad signature     | FAIL | -    | -       | -        | sad    | 401    |
 * | Tier too low      | OK   | FAIL | -       | -        | sad    | 403    |
 * | No balance        | OK   | OK   | FAIL    | -        | angry  | 402    |
 * | Upstream down     | OK   | OK   | OK      | FAIL     | angry  | 502    |
 * | Rate limited      | OK   | OK   | OK      | OK       | angry  | 429    |
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  moodHandler,
  createMockTrustClient,
  createMockBalanceClient,
  createMockExternalClient,
  createMockRateLimiter,
  MoodRequest,
  MoodGameDeps,
  MoodGameConfig,
  DEFAULT_MOOD_CONFIG,
} from './moodGame';
import { createMockKeyResolver, ConnectorOptions } from './connector';
import { signToken } from '../../auth/wstf';
import { generateKeypair, exportPubDER } from '../../crypto/keys';
import { deriveAddress } from '../../crypto/address';
import { SigAlgId, MappingAlgId } from '../../crypto/algorithms';
import { ConfirmationTier } from '../../trust/types';

// ============================================
// Test Helpers
// ============================================

function mkKeypair() {
  const keypair = generateKeypair(SigAlgId.ED25519);
  const pubDER = exportPubDER(keypair.publicKey);
  const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
  return { ...keypair, address };
}

function mkToken(kp: ReturnType<typeof mkKeypair>, overrides: Record<string, unknown> = {}): string {
  return signToken(kp.privateKey, SigAlgId.ED25519, {
    sub: kp.address,
    aud: 'mood.game/v1',
    ...overrides,
  });
}

function mkRequest(token: string): MoodRequest {
  return {
    method: 'GET',
    path: '/mood',
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
}

function mkHeaderRequest(caller: string): MoodRequest {
  return {
    method: 'GET',
    path: '/mood',
    headers: {
      'x-wstf-caller': caller,
      'x-wstf-program-id': 'mood.game/v1',
      'x-wstf-call-id': '0x' + crypto.randomBytes(32).toString('hex'),
    },
  };
}

// ============================================
// Happy Path Tests
// ============================================

describe('Mood Game: Happy Path', () => {
  let kp: ReturnType<typeof mkKeypair>;
  let keyMap: Map<string, crypto.KeyObject>;
  let deps: MoodGameDeps;
  let config: MoodGameConfig;

  beforeEach(() => {
    kp = mkKeypair();
    keyMap = new Map();
    keyMap.set(kp.address, kp.publicKey);

    const authOptions: ConnectorOptions = {
      programId: 'mood.game/v1',
      resolvePublicKey: createMockKeyResolver(keyMap),
    };

    deps = {
      authOptions,
      trust: createMockTrustClient(ConfirmationTier.K_DEPTH),
      balance: createMockBalanceClient(1000n),
      external: createMockExternalClient(true),
    };

    config = {
      minTrustTier: ConfirmationTier.INCLUDED,
      callCost: 10n,
      externalUrl: '/api/ping',
      enableRateLimit: false,
    };
  });

  it('returns happy when all checks pass', async () => {
    const token = mkToken(kp);
    const req = mkRequest(token);

    const res = await moodHandler(req, deps, config);

    expect(res.mood).toBe('happy');
    expect(res.status).toBe(200);
    expect(res.message).toBe('All systems go!');
  });

  it('returns happy with header-based auth', async () => {
    const req = mkHeaderRequest(kp.address);

    const res = await moodHandler(req, deps, config);

    expect(res.mood).toBe('happy');
    expect(res.status).toBe(200);
  });

  it('returns happy with minimum required tier', async () => {
    deps.trust = createMockTrustClient(ConfirmationTier.INCLUDED);
    config.minTrustTier = ConfirmationTier.INCLUDED;

    const token = mkToken(kp);
    const req = mkRequest(token);

    const res = await moodHandler(req, deps, config);

    expect(res.mood).toBe('happy');
    expect(res.status).toBe(200);
  });

  it('returns happy with exactly enough balance', async () => {
    deps.balance = createMockBalanceClient(10n);
    config.callCost = 10n;

    const token = mkToken(kp);
    const req = mkRequest(token);

    const res = await moodHandler(req, deps, config);

    expect(res.mood).toBe('happy');
    expect(res.status).toBe(200);
  });
});

// ============================================
// Sad Path Tests (Auth/Trust Failures)
// ============================================

describe('Mood Game: Sad Path (Access Denied)', () => {
  let kp: ReturnType<typeof mkKeypair>;
  let keyMap: Map<string, crypto.KeyObject>;
  let deps: MoodGameDeps;
  let config: MoodGameConfig;

  beforeEach(() => {
    kp = mkKeypair();
    keyMap = new Map();
    keyMap.set(kp.address, kp.publicKey);

    const authOptions: ConnectorOptions = {
      programId: 'mood.game/v1',
      resolvePublicKey: createMockKeyResolver(keyMap),
    };

    deps = {
      authOptions,
      trust: createMockTrustClient(ConfirmationTier.K_DEPTH),
      balance: createMockBalanceClient(1000n),
      external: createMockExternalClient(true),
    };

    config = DEFAULT_MOOD_CONFIG;
  });

  describe('Auth failures', () => {
    it('returns sad on missing token', async () => {
      const req: MoodRequest = {
        method: 'GET',
        path: '/mood',
        headers: {},
      };

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('sad');
      expect(res.status).toBe(401);
      expect(res.code).toBe('NO_TOKEN');
    });

    it('returns sad on malformed token', async () => {
      const req: MoodRequest = {
        method: 'GET',
        path: '/mood',
        headers: {
          authorization: 'Bearer not-a-valid-token',
        },
      };

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('sad');
      expect(res.status).toBe(401);
      expect(res.code).toBe('INVALID_FORMAT');
    });

    it('returns sad on tampered signature', async () => {
      const token = mkToken(kp);
      const [payload, sig] = token.split('.');
      const tamperedSig = sig.replace(/[a-f]/g, '0');
      const tamperedToken = `${payload}.${tamperedSig}`;

      const req = mkRequest(tamperedToken);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('sad');
      expect(res.status).toBe(401);
      expect(res.code).toBe('SIGNATURE_INVALID');
    });

    it('returns sad on expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'mood.game/v1',
        iat: now - 3600,
        exp: now - 1800,
      });

      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('sad');
      expect(res.status).toBe(401);
      expect(res.code).toBe('EXPIRED');
    });

    it('returns sad on wrong audience', async () => {
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'wrong.program/v1',
      });

      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('sad');
      expect(res.status).toBe(403);
      expect(res.code).toBe('WRONG_AUDIENCE');
    });

    it('returns sad on unknown address (pubkey not found)', async () => {
      const otherKp = mkKeypair();
      const token = signToken(otherKp.privateKey, SigAlgId.ED25519, {
        sub: otherKp.address,
        aud: 'mood.game/v1',
      });

      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('sad');
      expect(res.status).toBe(500);
      expect(res.code).toBe('PUBKEY_FETCH_FAILED');
    });
  });

  describe('Trust tier failures', () => {
    it('returns sad when tier too low', async () => {
      deps.trust = createMockTrustClient(ConfirmationTier.PREFLIGHT);
      config.minTrustTier = ConfirmationTier.K_DEPTH;

      const token = mkToken(kp);
      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('sad');
      expect(res.status).toBe(403);
      expect(res.code).toBe('TRUST_TIER_TOO_LOW');
    });

    it('returns sad when tier is one below required', async () => {
      deps.trust = createMockTrustClient(ConfirmationTier.INCLUDED);
      config.minTrustTier = ConfirmationTier.K_DEPTH;

      const token = mkToken(kp);
      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('sad');
      expect(res.status).toBe(403);
      expect(res.code).toBe('TRUST_TIER_TOO_LOW');
    });
  });
});

// ============================================
// Angry Path Tests (Auth OK, but blocked)
// ============================================

describe('Mood Game: Angry Path (Blocked)', () => {
  let kp: ReturnType<typeof mkKeypair>;
  let keyMap: Map<string, crypto.KeyObject>;
  let deps: MoodGameDeps;
  let config: MoodGameConfig;

  beforeEach(() => {
    kp = mkKeypair();
    keyMap = new Map();
    keyMap.set(kp.address, kp.publicKey);

    const authOptions: ConnectorOptions = {
      programId: 'mood.game/v1',
      resolvePublicKey: createMockKeyResolver(keyMap),
    };

    deps = {
      authOptions,
      trust: createMockTrustClient(ConfirmationTier.K_DEPTH),
      balance: createMockBalanceClient(1000n),
      external: createMockExternalClient(true),
    };

    config = {
      minTrustTier: ConfirmationTier.INCLUDED,
      callCost: 10n,
      externalUrl: '/api/ping',
      enableRateLimit: false,
    };
  });

  describe('Balance/paywall failures', () => {
    it('returns angry when balance is zero', async () => {
      deps.balance = createMockBalanceClient(0n);

      const token = mkToken(kp);
      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('angry');
      expect(res.status).toBe(402);
      expect(res.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('returns angry when balance is one below cost', async () => {
      deps.balance = createMockBalanceClient(9n);
      config.callCost = 10n;

      const token = mkToken(kp);
      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('angry');
      expect(res.status).toBe(402);
      expect(res.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('External service failures', () => {
    it('returns angry when upstream returns 500', async () => {
      deps.external = createMockExternalClient(false, 500);

      const token = mkToken(kp);
      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('angry');
      expect(res.status).toBe(502);
      expect(res.code).toBe('UPSTREAM_ERROR');
    });

    it('returns angry when upstream returns 404', async () => {
      deps.external = createMockExternalClient(false, 404);

      const token = mkToken(kp);
      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('angry');
      expect(res.status).toBe(502);
      expect(res.code).toBe('UPSTREAM_ERROR');
    });

    it('returns angry when upstream throws', async () => {
      deps.external = {
        async call() {
          throw new Error('Connection refused');
        },
      };

      const token = mkToken(kp);
      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('angry');
      expect(res.status).toBe(503);
      expect(res.code).toBe('UPSTREAM_UNAVAILABLE');
    });
  });

  describe('Rate limit failures', () => {
    it('returns angry when rate limited', async () => {
      deps.rateLimiter = createMockRateLimiter(0);
      config.enableRateLimit = true;

      const token = mkToken(kp);
      const req = mkRequest(token);

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe('angry');
      expect(res.status).toBe(429);
      expect(res.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('allows first N requests then rate limits', async () => {
      deps.rateLimiter = createMockRateLimiter(2);
      config.enableRateLimit = true;

      const token = mkToken(kp);

      // First two should succeed
      const res1 = await moodHandler(mkRequest(token), deps, config);
      expect(res1.mood).toBe('happy');

      const res2 = await moodHandler(mkRequest(token), deps, config);
      expect(res2.mood).toBe('happy');

      // Third should be rate limited
      const res3 = await moodHandler(mkRequest(token), deps, config);
      expect(res3.mood).toBe('angry');
      expect(res3.status).toBe(429);
      expect(res3.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});

// ============================================
// Edge Cases & Order of Operations
// ============================================

describe('Mood Game: Edge Cases', () => {
  let kp: ReturnType<typeof mkKeypair>;
  let keyMap: Map<string, crypto.KeyObject>;
  let deps: MoodGameDeps;
  let config: MoodGameConfig;

  beforeEach(() => {
    kp = mkKeypair();
    keyMap = new Map();
    keyMap.set(kp.address, kp.publicKey);

    const authOptions: ConnectorOptions = {
      programId: 'mood.game/v1',
      resolvePublicKey: createMockKeyResolver(keyMap),
    };

    deps = {
      authOptions,
      trust: createMockTrustClient(ConfirmationTier.K_DEPTH),
      balance: createMockBalanceClient(1000n),
      external: createMockExternalClient(true),
    };

    config = {
      minTrustTier: ConfirmationTier.INCLUDED,
      callCost: 10n,
      externalUrl: '/api/ping',
      enableRateLimit: false,
    };
  });

  it('auth failure takes precedence over tier failure', async () => {
    deps.trust = createMockTrustClient(ConfirmationTier.PREFLIGHT);
    config.minTrustTier = ConfirmationTier.K_DEPTH;

    const req: MoodRequest = {
      method: 'GET',
      path: '/mood',
      headers: {
        authorization: 'Bearer invalid',
      },
    };

    const res = await moodHandler(req, deps, config);

    // Should be auth failure, not tier failure
    expect(res.mood).toBe('sad');
    expect(res.code).toBe('INVALID_FORMAT');
  });

  it('tier failure takes precedence over balance failure', async () => {
    deps.trust = createMockTrustClient(ConfirmationTier.PREFLIGHT);
    deps.balance = createMockBalanceClient(0n);
    config.minTrustTier = ConfirmationTier.K_DEPTH;

    const token = mkToken(kp);
    const req = mkRequest(token);

    const res = await moodHandler(req, deps, config);

    // Should be tier failure, not balance failure
    expect(res.mood).toBe('sad');
    expect(res.code).toBe('TRUST_TIER_TOO_LOW');
  });

  it('balance failure takes precedence over external failure', async () => {
    deps.balance = createMockBalanceClient(0n);
    deps.external = createMockExternalClient(false, 500);

    const token = mkToken(kp);
    const req = mkRequest(token);

    const res = await moodHandler(req, deps, config);

    // Should be balance failure, not external failure
    expect(res.mood).toBe('angry');
    expect(res.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('rate limit failure takes precedence over balance failure', async () => {
    deps.rateLimiter = createMockRateLimiter(0);
    deps.balance = createMockBalanceClient(0n);
    config.enableRateLimit = true;

    const token = mkToken(kp);
    const req = mkRequest(token);

    const res = await moodHandler(req, deps, config);

    // Should be rate limit failure, not balance failure
    expect(res.mood).toBe('angry');
    expect(res.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('zero call cost should always pass balance check', async () => {
    deps.balance = createMockBalanceClient(0n);
    config.callCost = 0n;

    const token = mkToken(kp);
    const req = mkRequest(token);

    const res = await moodHandler(req, deps, config);

    expect(res.mood).toBe('happy');
    expect(res.status).toBe(200);
  });
});

// ============================================
// Scoreboard Summary Test
// ============================================

describe('Mood Game: Scoreboard', () => {
  let kp: ReturnType<typeof mkKeypair>;
  let keyMap: Map<string, crypto.KeyObject>;

  beforeEach(() => {
    kp = mkKeypair();
    keyMap = new Map();
    keyMap.set(kp.address, kp.publicKey);
  });

  const scenarios = [
    {
      name: 'Happy path',
      auth: true,
      tier: ConfirmationTier.K_DEPTH,
      balance: 1000n,
      external: true,
      rateLimit: Infinity,
      expectedMood: 'happy' as const,
      expectedStatus: 200,
    },
    {
      name: 'Bad signature',
      auth: false, // Will use tampered token
      tier: ConfirmationTier.K_DEPTH,
      balance: 1000n,
      external: true,
      rateLimit: Infinity,
      expectedMood: 'sad' as const,
      expectedStatus: 401,
    },
    {
      name: 'Tier too low',
      auth: true,
      tier: ConfirmationTier.PREFLIGHT,
      balance: 1000n,
      external: true,
      rateLimit: Infinity,
      expectedMood: 'sad' as const,
      expectedStatus: 403,
    },
    {
      name: 'No balance',
      auth: true,
      tier: ConfirmationTier.K_DEPTH,
      balance: 0n,
      external: true,
      rateLimit: Infinity,
      expectedMood: 'angry' as const,
      expectedStatus: 402,
    },
    {
      name: 'Upstream down',
      auth: true,
      tier: ConfirmationTier.K_DEPTH,
      balance: 1000n,
      external: false,
      rateLimit: Infinity,
      expectedMood: 'angry' as const,
      expectedStatus: 502,
    },
    {
      name: 'Rate limited',
      auth: true,
      tier: ConfirmationTier.K_DEPTH,
      balance: 1000n,
      external: true,
      rateLimit: 0,
      expectedMood: 'angry' as const,
      expectedStatus: 429,
    },
  ];

  for (const scenario of scenarios) {
    it(`Scenario: ${scenario.name}`, async () => {
      const authOptions: ConnectorOptions = {
        programId: 'mood.game/v1',
        resolvePublicKey: createMockKeyResolver(keyMap),
      };

      const deps: MoodGameDeps = {
        authOptions,
        trust: createMockTrustClient(scenario.tier),
        balance: createMockBalanceClient(scenario.balance),
        external: createMockExternalClient(scenario.external),
        rateLimiter: createMockRateLimiter(scenario.rateLimit),
      };

      const config: MoodGameConfig = {
        minTrustTier: ConfirmationTier.INCLUDED,
        callCost: 10n,
        externalUrl: '/api/ping',
        enableRateLimit: scenario.rateLimit !== Infinity,
      };

      let req: MoodRequest;
      if (scenario.auth) {
        const token = mkToken(kp);
        req = mkRequest(token);
      } else {
        // Tampered token
        const token = mkToken(kp);
        const [payload, sig] = token.split('.');
        const tamperedSig = sig.replace(/[a-f]/g, '0');
        req = mkRequest(`${payload}.${tamperedSig}`);
      }

      const res = await moodHandler(req, deps, config);

      expect(res.mood).toBe(scenario.expectedMood);
      expect(res.status).toBe(scenario.expectedStatus);
    });
  }
});
