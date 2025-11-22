/**
 * Mood Game - Test Harness
 *
 * A tiny local "API" that returns happy/sad/angry based on:
 * - Auth success/failure
 * - Trust tier check
 * - Balance/paywall check
 * - External service availability
 *
 * Moods:
 * - happy: All checks pass, external call succeeds
 * - sad: Auth or trust check failed (access denied)
 * - angry: Auth OK but paywall, rate limit, or external call fails
 */

import crypto from 'crypto';
import {
  authorizeRequest,
  RequestContext,
  ConnectorOptions,
  AuthorizationResult,
} from './connector';
import { ConfirmationTier } from '../../trust/types';

// ============================================
// Types
// ============================================

export type Mood = 'happy' | 'sad' | 'angry';

export interface MoodRequest {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** HTTP headers */
  headers: Record<string, string | undefined>;
}

export interface MoodResponse {
  /** The resulting mood */
  mood: Mood;
  /** HTTP status code */
  status: number;
  /** Error/reason code */
  code?: string;
  /** Human-readable message */
  message?: string;
}

export interface BalanceClient {
  /** Check if address has sufficient balance */
  hasBalance(addr: string, cost: bigint): Promise<boolean>;
  /** Optional: deduct balance */
  deduct?(addr: string, cost: bigint): Promise<boolean>;
}

export interface ExternalClient {
  /** Call external service */
  call(url: string): Promise<{ status: number; data?: unknown }>;
}

export interface RateLimiter {
  /** Check if request is within rate limits */
  consume(addr: string): Promise<boolean>;
}

export interface TrustClient {
  /** Get trust tier for address */
  getTrustTier(addr: string): Promise<ConfirmationTier>;
}

export interface MoodGameConfig {
  /** Minimum trust tier required */
  minTrustTier: ConfirmationTier;
  /** Cost per call */
  callCost: bigint;
  /** External service URL */
  externalUrl: string;
  /** Enable rate limiting */
  enableRateLimit: boolean;
}

export interface MoodGameDeps {
  /** Authorization options */
  authOptions: ConnectorOptions;
  /** Trust client */
  trust: TrustClient;
  /** Balance client */
  balance: BalanceClient;
  /** External service client */
  external: ExternalClient;
  /** Optional rate limiter */
  rateLimiter?: RateLimiter;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_MOOD_CONFIG: MoodGameConfig = {
  minTrustTier: ConfirmationTier.INCLUDED,
  callCost: 10n,
  externalUrl: '/api/ping',
  enableRateLimit: false,
};

// ============================================
// Mood Handler
// ============================================

/**
 * Process a mood request through auth, trust, balance, and external checks.
 *
 * Flow:
 * 1. Authorize request (WSTFAuth or header-based)
 * 2. Check trust tier meets minimum
 * 3. Check rate limit (if enabled)
 * 4. Check balance/paywall
 * 5. Call external service
 * 6. Return mood based on results
 */
export async function moodHandler(
  req: MoodRequest,
  deps: MoodGameDeps,
  config: MoodGameConfig = DEFAULT_MOOD_CONFIG
): Promise<MoodResponse> {
  // Extract context from request headers
  const context: RequestContext = {
    authorization: req.headers['authorization'] || req.headers['Authorization'],
    callId: req.headers['x-wstf-call-id'],
    programId: req.headers['x-wstf-program-id'],
    caller: req.headers['x-wstf-caller'],
  };

  // Step 1: Authorize request
  const authResult = await authorizeRequest(context, deps.authOptions);

  if (!authResult.authorized) {
    return {
      mood: 'sad',
      status: getHttpStatus(authResult.code),
      code: authResult.code,
      message: authResult.error ?? 'Authorization failed',
    };
  }

  const caller = authResult.caller!;

  // Step 2: Check trust tier
  try {
    const trustTier = await deps.trust.getTrustTier(caller);
    if (trustTier < config.minTrustTier) {
      return {
        mood: 'sad',
        status: 403,
        code: 'TRUST_TIER_TOO_LOW',
        message: `Required tier ${config.minTrustTier}, got ${trustTier}`,
      };
    }
  } catch (err: any) {
    return {
      mood: 'sad',
      status: 500,
      code: 'TRUST_CHECK_ERROR',
      message: err.message,
    };
  }

  // Step 3: Check rate limit (if enabled)
  if (config.enableRateLimit && deps.rateLimiter) {
    try {
      const allowed = await deps.rateLimiter.consume(caller);
      if (!allowed) {
        return {
          mood: 'angry',
          status: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
        };
      }
    } catch (err: any) {
      return {
        mood: 'angry',
        status: 500,
        code: 'RATE_LIMIT_ERROR',
        message: err.message,
      };
    }
  }

  // Step 4: Check balance/paywall
  try {
    const hasBalance = await deps.balance.hasBalance(caller, config.callCost);
    if (!hasBalance) {
      return {
        mood: 'angry',
        status: 402,
        code: 'INSUFFICIENT_FUNDS',
        message: `Required ${config.callCost} units`,
      };
    }
  } catch (err: any) {
    return {
      mood: 'angry',
      status: 500,
      code: 'BALANCE_CHECK_ERROR',
      message: err.message,
    };
  }

  // Step 5: Call external service
  try {
    const extResponse = await deps.external.call(config.externalUrl);
    if (extResponse.status !== 200) {
      return {
        mood: 'angry',
        status: 502,
        code: 'UPSTREAM_ERROR',
        message: `External service returned ${extResponse.status}`,
      };
    }
  } catch (err: any) {
    return {
      mood: 'angry',
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
      message: err.message,
    };
  }

  // All checks passed!
  return {
    mood: 'happy',
    status: 200,
    message: 'All systems go!',
  };
}

// ============================================
// Helpers
// ============================================

/**
 * Map error codes to HTTP status codes
 */
function getHttpStatus(code?: string): number {
  switch (code) {
    case 'NO_TOKEN':
    case 'INVALID_FORMAT':
    case 'MISSING_FIELD':
      return 401;
    case 'EXPIRED':
    case 'NOT_YET_VALID':
      return 401;
    case 'SIGNATURE_INVALID':
    case 'ADDRESS_MISMATCH':
      return 401;
    case 'WRONG_AUDIENCE':
    case 'PROGRAM_MISMATCH':
      return 403;
    case 'PUBKEY_FETCH_FAILED':
      return 500;
    default:
      return 401;
  }
}

// ============================================
// Mock Implementations for Testing
// ============================================

/**
 * Create a mock trust client
 */
export function createMockTrustClient(
  tierMap: Map<string, ConfirmationTier> | ConfirmationTier = ConfirmationTier.INCLUDED
): TrustClient {
  return {
    async getTrustTier(addr: string): Promise<ConfirmationTier> {
      if (typeof tierMap === 'number') {
        return tierMap;
      }
      return tierMap.get(addr) ?? ConfirmationTier.PREFLIGHT;
    },
  };
}

/**
 * Create a mock balance client
 */
export function createMockBalanceClient(
  balanceMap: Map<string, bigint> | bigint = 1000n
): BalanceClient {
  return {
    async hasBalance(addr: string, cost: bigint): Promise<boolean> {
      const balance = typeof balanceMap === 'bigint'
        ? balanceMap
        : balanceMap.get(addr) ?? 0n;
      return balance >= cost;
    },
  };
}

/**
 * Create a mock external client
 */
export function createMockExternalClient(
  shouldSucceed: boolean = true,
  failureStatus: number = 500
): ExternalClient {
  return {
    async call(): Promise<{ status: number }> {
      if (!shouldSucceed) {
        return { status: failureStatus };
      }
      return { status: 200 };
    },
  };
}

/**
 * Create a mock rate limiter
 */
export function createMockRateLimiter(
  allowedCalls: number = Infinity
): RateLimiter {
  const callCounts = new Map<string, number>();

  return {
    async consume(addr: string): Promise<boolean> {
      const count = callCounts.get(addr) ?? 0;
      if (count >= allowedCalls) {
        return false;
      }
      callCounts.set(addr, count + 1);
      return true;
    },
  };
}
