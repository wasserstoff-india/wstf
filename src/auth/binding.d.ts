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
import { WSTFAuthPayload, TokenValidationResult, TokenErrorCode } from './wstf';
import { SigAlgId } from '../crypto/algorithms';
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
/**
 * Sign a bound WSTFAuth token with method/path/scope binding
 */
export declare function signBoundToken(privateKey: crypto.KeyObject, sigAlg: SigAlgId, payload: Partial<BoundPayload> & {
    sub: string;
    aud: string;
}, ttlSeconds?: number): string;
/**
 * Create a token bound to specific HTTP method
 */
export declare function bindMethod(payload: Partial<BoundPayload> & {
    sub: string;
    aud: string;
}, method: HttpMethod): Partial<BoundPayload> & {
    sub: string;
    aud: string;
};
/**
 * Create a token bound to specific URL path
 */
export declare function bindPath(payload: Partial<BoundPayload> & {
    sub: string;
    aud: string;
}, path: string): Partial<BoundPayload> & {
    sub: string;
    aud: string;
};
/**
 * Create a token with required scopes
 */
export declare function bindScopes(payload: Partial<BoundPayload> & {
    sub: string;
    aud: string;
}, scopes: string[]): Partial<BoundPayload> & {
    sub: string;
    aud: string;
};
/**
 * Create a token bound to specific request body
 */
export declare function bindBody(payload: Partial<BoundPayload> & {
    sub: string;
    aud: string;
}, body: Buffer | string): Partial<BoundPayload> & {
    sub: string;
    aud: string;
};
/**
 * Hash request body for binding
 */
export declare function hashBody(body: Buffer | string): string;
/**
 * Validate a bound WSTFAuth token with method/path/scope checks
 */
export declare function validateBoundToken(token: string, publicKey: crypto.KeyObject, sigAlg: SigAlgId, expectedAudience: string, options?: BoundValidationOptions, nowSeconds?: number): BoundValidationResult;
/**
 * Match HTTP method (case-insensitive)
 */
export declare function matchMethod(pattern: HttpMethod, actual: string): boolean;
/**
 * Match URL path against pattern
 *
 * Supports:
 * - Exact match: /users/123
 * - Wildcard segment: /users/* (matches /users/123)
 * - Glob: /users/** (matches /users/123/profile)
 * - Parameter placeholder: /users/:id (matches /users/123)
 */
export declare function matchPath(pattern: string, actual: string): boolean;
/**
 * Normalize path (remove trailing slash, ensure leading slash)
 */
export declare function normalizePath(path: string): string;
/**
 * Extract scopes from token payload
 */
export declare function extractScopes(payload: BoundPayload): Set<string>;
/**
 * Check if token has required scopes
 */
export declare function hasScopes(payload: BoundPayload, required: string[]): boolean;
/**
 * Check if token has any of the specified scopes
 */
export declare function hasAnyScope(payload: BoundPayload, anyOf: string[]): boolean;
/**
 * Fluent builder for bound tokens
 */
export declare class BoundTokenBuilder {
    private payload;
    private ttl;
    constructor(sub: string, aud: string);
    /**
     * Bind to HTTP method
     */
    method(method: HttpMethod): this;
    /**
     * Bind to URL path
     */
    path(path: string): this;
    /**
     * Add scopes
     */
    scopes(...scopes: string[]): this;
    /**
     * Bind to request body hash
     */
    body(body: Buffer | string): this;
    /**
     * Set token TTL in seconds
     */
    ttlSeconds(seconds: number): this;
    /**
     * Add custom claim
     */
    claim(key: string, value: unknown): this;
    /**
     * Set unique token ID
     */
    tokenId(jti: string): this;
    /**
     * Sign the token
     */
    sign(privateKey: crypto.KeyObject, sigAlg: SigAlgId): string;
    /**
     * Get the payload (for inspection)
     */
    getPayload(): Partial<BoundPayload> & {
        sub: string;
        aud: string;
    };
}
/**
 * Create a bound token builder
 */
export declare function boundToken(sub: string, aud: string): BoundTokenBuilder;
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
export declare function validateRouteBinding(token: string, publicKey: crypto.KeyObject, sigAlg: SigAlgId, expectedAudience: string, binding: RouteBinding, requestBody?: Buffer | string, nowSeconds?: number): BoundValidationResult;
/**
 * Create a route binding validator
 */
export declare function createRouteValidator(bindings: RouteBinding[]): {
    /**
     * Find binding for a route
     */
    findBinding(method: HttpMethod, path: string): RouteBinding | undefined;
    /**
     * Validate token against route
     */
    validate(token: string, publicKey: crypto.KeyObject, sigAlg: SigAlgId, expectedAudience: string, method: HttpMethod, path: string, requestBody?: Buffer | string, nowSeconds?: number): BoundValidationResult;
};
//# sourceMappingURL=binding.d.ts.map