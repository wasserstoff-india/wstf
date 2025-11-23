/**
 * WSTFAuth - Service Authentication Tokens
 *
 * Token format: `<base64url(json)>.<signatureHex>`
 *
 * The JSON payload contains:
 * - sub: Subject (gc1... address)
 * - aud: Audience (programId)
 * - iat: Issued at (Unix seconds)
 * - exp: Expiry (Unix seconds)
 * - jti: Optional unique token ID
 */
import crypto from 'crypto';
import { SigAlgId } from '../crypto/algorithms';
/**
 * WSTFAuth token payload
 */
export interface WSTFAuthPayload {
    /** Subject - the gc1... address */
    sub: string;
    /** Audience - the programId this token is for */
    aud: string;
    /** Issued at - Unix timestamp in seconds */
    iat: number;
    /** Expiry - Unix timestamp in seconds */
    exp: number;
    /** Optional unique token ID for replay protection */
    jti?: string;
    /** Optional additional claims */
    [key: string]: unknown;
}
/**
 * Parsed WSTFAuth token
 */
export interface WSTFAuthToken {
    payload: WSTFAuthPayload;
    signature: Buffer;
    raw: string;
}
/**
 * Token validation result
 */
export interface TokenValidationResult {
    valid: boolean;
    payload?: WSTFAuthPayload;
    error?: string;
    code?: TokenErrorCode;
}
/**
 * Token error codes
 */
export type TokenErrorCode = 'INVALID_FORMAT' | 'INVALID_JSON' | 'MISSING_FIELD' | 'EXPIRED' | 'NOT_YET_VALID' | 'WRONG_AUDIENCE' | 'SIGNATURE_INVALID' | 'ADDRESS_MISMATCH';
/**
 * Default token TTL (5 minutes)
 */
export declare const DEFAULT_TOKEN_TTL_SECONDS = 300;
/**
 * Maximum allowed clock skew (30 seconds)
 */
export declare const MAX_CLOCK_SKEW_SECONDS = 30;
/**
 * Base64url encode
 */
export declare function base64urlEncode(data: Buffer | string): string;
/**
 * Base64url decode
 */
export declare function base64urlDecode(str: string): Buffer;
/**
 * Sign a WSTFAuth token
 *
 * @param privateKey - Ed25519 or SECP256K1 private key
 * @param sigAlg - Signature algorithm
 * @param payload - Token payload (without iat/exp if using defaults)
 * @param ttlSeconds - Token TTL in seconds (default 5 minutes)
 * @returns Signed token string
 */
export declare function signToken(privateKey: crypto.KeyObject, sigAlg: SigAlgId, payload: Partial<WSTFAuthPayload> & {
    sub: string;
    aud: string;
}, ttlSeconds?: number): string;
/**
 * Parse a WSTFAuth token (without verification)
 */
export declare function parseToken(token: string): WSTFAuthToken | null;
/**
 * Verify a WSTFAuth token signature
 *
 * @param token - Token string or parsed token
 * @param publicKey - Public key to verify against
 * @param sigAlg - Signature algorithm
 * @returns true if signature is valid
 */
export declare function verifyTokenSignature(token: string | WSTFAuthToken, publicKey: crypto.KeyObject, sigAlg: SigAlgId): boolean;
/**
 * Validate a WSTFAuth token (full validation)
 *
 * @param token - Token string
 * @param publicKey - Public key to verify signature
 * @param sigAlg - Signature algorithm
 * @param expectedAudience - Expected audience (programId)
 * @param nowSeconds - Current time (for testing)
 */
export declare function validateToken(token: string, publicKey: crypto.KeyObject, sigAlg: SigAlgId, expectedAudience: string, nowSeconds?: number): TokenValidationResult;
/**
 * Generate a unique token ID (jti)
 */
export declare function generateTokenId(): string;
/**
 * Check if a token is expired (without full validation)
 */
export declare function isTokenExpired(token: string | WSTFAuthToken, nowSeconds?: number): boolean;
/**
 * Get remaining TTL in seconds (0 if expired)
 */
export declare function getRemainingTTL(token: string | WSTFAuthToken, nowSeconds?: number): number;
//# sourceMappingURL=wstf.d.ts.map