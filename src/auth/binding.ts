/**
 * WSTFAuth Request Binding
 *
 * Extends WSTFAuth tokens with method/path/scope binding for stricter validation.
 * This ensures tokens can only be used for specific HTTP operations.
 *
 * Extended payload fields:
 * - mtd: HTTP method (GET, POST, PUT, DELETE, PATCH)
 * - pth: URL path pattern (exact or glob)
 * - scp: Required scopes (space-separated string or array)
 * - hsh: Optional request body hash (sha256)
 */

import crypto from 'crypto';
import {
  WSTFAuthPayload,
  WSTFAuthToken,
  parseToken,
  signToken,
  validateToken,
  TokenValidationResult,
  TokenErrorCode,
} from './wstf';
import { SigAlgId } from '../crypto/algorithms';

// ============================================================================
// Types
// ============================================================================

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * Extended WSTFAuth payload with request binding
 */
export interface BoundPayload extends WSTFAuthPayload {
  /** HTTP method (optional, if present must match) */
  mtd?: HttpMethod;
  /** URL path pattern (optional, if present must match) */
  pth?: string;
  /** Scopes (space-separated string or array) */
  scp?: string | string[];
  /** Request body hash (sha256 hex) */
  hsh?: string;
}

/**
 * Bound token validation options
 */
export interface BoundValidationOptions {
  /** HTTP method to match against mtd claim */
  method?: HttpMethod;
  /** URL path to match against pth claim */
  path?: string;
  /** Required scopes to validate against scp claim */
  requiredScopes?: string[];
  /** Request body to hash and match against hsh claim */
  body?: Buffer | string;
}

/**
 * Extended validation result
 */
export interface BoundValidationResult extends TokenValidationResult {
  /** Bound payload with extended claims */
  boundPayload?: BoundPayload;
}

/**
 * Extended error codes
 */
export type BoundTokenErrorCode = TokenErrorCode | 'METHOD_MISMATCH' | 'PATH_MISMATCH' | 'SCOPE_MISMATCH' | 'BODY_HASH_MISMATCH';

// ============================================================================
// Token Creation
// ============================================================================

/**
 * Sign a bound WSTFAuth token with method/path/scope binding
 */
export function signBoundToken(
  privateKey: crypto.KeyObject,
  sigAlg: SigAlgId,
  payload: Partial<BoundPayload> & { sub: string; aud: string },
  ttlSeconds?: number
): string {
  // Normalize scopes to string if array
  const normalizedPayload = { ...payload };
  if (Array.isArray(normalizedPayload.scp)) {
    normalizedPayload.scp = normalizedPayload.scp.join(' ');
  }

  return signToken(privateKey, sigAlg, normalizedPayload, ttlSeconds);
}

/**
 * Create a token bound to specific HTTP method
 */
export function bindMethod(
  payload: Partial<BoundPayload> & { sub: string; aud: string },
  method: HttpMethod
): Partial<BoundPayload> & { sub: string; aud: string } {
  return { ...payload, mtd: method };
}

/**
 * Create a token bound to specific URL path
 */
export function bindPath(
  payload: Partial<BoundPayload> & { sub: string; aud: string },
  path: string
): Partial<BoundPayload> & { sub: string; aud: string } {
  return { ...payload, pth: path };
}

/**
 * Create a token with required scopes
 */
export function bindScopes(
  payload: Partial<BoundPayload> & { sub: string; aud: string },
  scopes: string[]
): Partial<BoundPayload> & { sub: string; aud: string } {
  return { ...payload, scp: scopes.join(' ') };
}

/**
 * Create a token bound to specific request body
 */
export function bindBody(
  payload: Partial<BoundPayload> & { sub: string; aud: string },
  body: Buffer | string
): Partial<BoundPayload> & { sub: string; aud: string } {
  const hash = hashBody(body);
  return { ...payload, hsh: hash };
}

/**
 * Hash request body for binding
 */
export function hashBody(body: Buffer | string): string {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Validate a bound WSTFAuth token with method/path/scope checks
 */
export function validateBoundToken(
  token: string,
  publicKey: crypto.KeyObject,
  sigAlg: SigAlgId,
  expectedAudience: string,
  options: BoundValidationOptions = {},
  nowSeconds?: number
): BoundValidationResult {
  // First validate base token
  const baseResult = validateToken(token, publicKey, sigAlg, expectedAudience, nowSeconds);
  if (!baseResult.valid) {
    return baseResult as BoundValidationResult;
  }

  const payload = baseResult.payload as BoundPayload;

  // Validate method binding
  if (payload.mtd && options.method) {
    if (!matchMethod(payload.mtd, options.method)) {
      return {
        valid: false,
        error: `Method mismatch: token bound to ${payload.mtd}, request is ${options.method}`,
        code: 'METHOD_MISMATCH' as TokenErrorCode,
      };
    }
  }

  // Validate path binding
  if (payload.pth && options.path) {
    if (!matchPath(payload.pth, options.path)) {
      return {
        valid: false,
        error: `Path mismatch: token bound to ${payload.pth}, request is ${options.path}`,
        code: 'PATH_MISMATCH' as TokenErrorCode,
      };
    }
  }

  // Validate scopes
  if (options.requiredScopes && options.requiredScopes.length > 0) {
    const tokenScopes = extractScopes(payload);
    const missingScopes = options.requiredScopes.filter((s) => !tokenScopes.has(s));
    if (missingScopes.length > 0) {
      return {
        valid: false,
        error: `Missing required scopes: ${missingScopes.join(', ')}`,
        code: 'SCOPE_MISMATCH' as TokenErrorCode,
      };
    }
  }

  // Validate body hash
  if (payload.hsh && options.body !== undefined) {
    const bodyHash = hashBody(options.body);
    if (payload.hsh !== bodyHash) {
      return {
        valid: false,
        error: 'Body hash mismatch',
        code: 'BODY_HASH_MISMATCH' as TokenErrorCode,
      };
    }
  }

  return {
    valid: true,
    payload,
    boundPayload: payload,
  };
}

// ============================================================================
// Path Matching
// ============================================================================

/**
 * Match HTTP method (case-insensitive)
 */
export function matchMethod(pattern: HttpMethod, actual: string): boolean {
  return pattern.toUpperCase() === actual.toUpperCase();
}

/**
 * Match URL path against pattern
 *
 * Supports:
 * - Exact match: /users/123
 * - Wildcard segment: /users/* (matches /users/123)
 * - Glob: /users/** (matches /users/123/profile)
 * - Parameter placeholder: /users/:id (matches /users/123)
 */
export function matchPath(pattern: string, actual: string): boolean {
  // Normalize paths
  const normalizedPattern = normalizePath(pattern);
  const normalizedActual = normalizePath(actual);

  // Exact match
  if (normalizedPattern === normalizedActual) {
    return true;
  }

  // Split into segments
  const patternParts = normalizedPattern.split('/');
  const actualParts = normalizedActual.split('/');

  // Handle glob patterns
  let pi = 0;
  let ai = 0;

  while (pi < patternParts.length && ai < actualParts.length) {
    const pp = patternParts[pi];
    const ap = actualParts[ai];

    if (pp === '**') {
      // Glob matches rest of path
      return true;
    }

    if (pp === '*' || pp.startsWith(':')) {
      // Single segment wildcard or parameter
      pi++;
      ai++;
      continue;
    }

    if (pp !== ap) {
      return false;
    }

    pi++;
    ai++;
  }

  // Check if all parts consumed
  if (pi < patternParts.length) {
    // Only remaining pattern is **
    return patternParts[pi] === '**';
  }

  return ai >= actualParts.length;
}

/**
 * Normalize path (remove trailing slash, ensure leading slash)
 */
export function normalizePath(path: string): string {
  let normalized = path.trim();
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

// ============================================================================
// Scope Utilities
// ============================================================================

/**
 * Extract scopes from token payload
 */
export function extractScopes(payload: BoundPayload): Set<string> {
  const scp = payload.scp;
  if (!scp) {
    return new Set();
  }

  if (typeof scp === 'string') {
    return new Set(scp.split(' ').filter(Boolean));
  }

  if (Array.isArray(scp)) {
    return new Set(scp.filter((s) => typeof s === 'string'));
  }

  return new Set();
}

/**
 * Check if token has required scopes
 */
export function hasScopes(payload: BoundPayload, required: string[]): boolean {
  const tokenScopes = extractScopes(payload);
  return required.every((scope) => tokenScopes.has(scope));
}

/**
 * Check if token has any of the specified scopes
 */
export function hasAnyScope(payload: BoundPayload, anyOf: string[]): boolean {
  const tokenScopes = extractScopes(payload);
  return anyOf.some((scope) => tokenScopes.has(scope));
}

// ============================================================================
// Builder Pattern
// ============================================================================

/**
 * Fluent builder for bound tokens
 */
export class BoundTokenBuilder {
  private payload: Partial<BoundPayload> & { sub: string; aud: string };
  private ttl: number | undefined;

  constructor(sub: string, aud: string) {
    this.payload = { sub, aud };
  }

  /**
   * Bind to HTTP method
   */
  method(method: HttpMethod): this {
    this.payload.mtd = method;
    return this;
  }

  /**
   * Bind to URL path
   */
  path(path: string): this {
    this.payload.pth = path;
    return this;
  }

  /**
   * Add scopes
   */
  scopes(...scopes: string[]): this {
    const existing = extractScopes(this.payload as BoundPayload);
    for (const scope of scopes) {
      existing.add(scope);
    }
    this.payload.scp = Array.from(existing).join(' ');
    return this;
  }

  /**
   * Bind to request body hash
   */
  body(body: Buffer | string): this {
    this.payload.hsh = hashBody(body);
    return this;
  }

  /**
   * Set token TTL in seconds
   */
  ttlSeconds(seconds: number): this {
    this.ttl = seconds;
    return this;
  }

  /**
   * Add custom claim
   */
  claim(key: string, value: unknown): this {
    this.payload[key] = value;
    return this;
  }

  /**
   * Set unique token ID
   */
  tokenId(jti: string): this {
    this.payload.jti = jti;
    return this;
  }

  /**
   * Sign the token
   */
  sign(privateKey: crypto.KeyObject, sigAlg: SigAlgId): string {
    return signBoundToken(privateKey, sigAlg, this.payload, this.ttl);
  }

  /**
   * Get the payload (for inspection)
   */
  getPayload(): Partial<BoundPayload> & { sub: string; aud: string } {
    return { ...this.payload };
  }
}

/**
 * Create a bound token builder
 */
export function boundToken(sub: string, aud: string): BoundTokenBuilder {
  return new BoundTokenBuilder(sub, aud);
}

// ============================================================================
// Route Binding Validation
// ============================================================================

/**
 * Route binding specification
 */
export interface RouteBinding {
  method: HttpMethod;
  path: string;
  requiredScopes?: string[];
  requireBodyHash?: boolean;
}

/**
 * Validate token against route binding
 */
export function validateRouteBinding(
  token: string,
  publicKey: crypto.KeyObject,
  sigAlg: SigAlgId,
  expectedAudience: string,
  binding: RouteBinding,
  requestBody?: Buffer | string,
  nowSeconds?: number
): BoundValidationResult {
  return validateBoundToken(
    token,
    publicKey,
    sigAlg,
    expectedAudience,
    {
      method: binding.method,
      path: binding.path,
      requiredScopes: binding.requiredScopes,
      body: binding.requireBodyHash ? requestBody : undefined,
    },
    nowSeconds
  );
}

/**
 * Create a route binding validator
 */
export function createRouteValidator(bindings: RouteBinding[]) {
  const routeMap = new Map<string, RouteBinding>();

  for (const binding of bindings) {
    const key = `${binding.method}:${binding.path}`;
    routeMap.set(key, binding);
  }

  return {
    /**
     * Find binding for a route
     */
    findBinding(method: HttpMethod, path: string): RouteBinding | undefined {
      // Try exact match first
      const exactKey = `${method}:${path}`;
      if (routeMap.has(exactKey)) {
        return routeMap.get(exactKey);
      }

      // Try pattern matching
      for (const [key, binding] of routeMap) {
        if (matchMethod(binding.method, method) && matchPath(binding.path, path)) {
          return binding;
        }
      }

      return undefined;
    },

    /**
     * Validate token against route
     */
    validate(
      token: string,
      publicKey: crypto.KeyObject,
      sigAlg: SigAlgId,
      expectedAudience: string,
      method: HttpMethod,
      path: string,
      requestBody?: Buffer | string,
      nowSeconds?: number
    ): BoundValidationResult {
      const binding = this.findBinding(method, path);
      if (!binding) {
        return {
          valid: false,
          error: `No route binding found for ${method} ${path}`,
          code: 'PATH_MISMATCH' as TokenErrorCode,
        };
      }

      return validateRouteBinding(
        token,
        publicKey,
        sigAlg,
        expectedAudience,
        binding,
        requestBody,
        nowSeconds
      );
    },
  };
}
