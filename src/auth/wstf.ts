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
import { signPreimage, verifyPreimage } from '../crypto/sign';
import { SigAlgId } from '../crypto/algorithms';
import { publicKeyMatchesAddress } from '../crypto/address';

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
export type TokenErrorCode =
  | 'INVALID_FORMAT'
  | 'INVALID_JSON'
  | 'MISSING_FIELD'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'WRONG_AUDIENCE'
  | 'SIGNATURE_INVALID'
  | 'ADDRESS_MISMATCH';

/**
 * Default token TTL (5 minutes)
 */
export const DEFAULT_TOKEN_TTL_SECONDS = 300;

/**
 * Maximum allowed clock skew (30 seconds)
 */
export const MAX_CLOCK_SKEW_SECONDS = 30;

/**
 * Base64url encode
 */
export function base64urlEncode(data: Buffer | string): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.toString('base64url');
}

/**
 * Base64url decode
 */
export function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Create the preimage for signing
 * preimage = sha256(payload JSON)
 */
function createPreimage(payloadJson: string): Buffer {
  return crypto.createHash('sha256').update(payloadJson).digest();
}

/**
 * Sign a WSTFAuth token
 *
 * @param privateKey - Ed25519 or SECP256K1 private key
 * @param sigAlg - Signature algorithm
 * @param payload - Token payload (without iat/exp if using defaults)
 * @param ttlSeconds - Token TTL in seconds (default 5 minutes)
 * @returns Signed token string
 */
export function signToken(
  privateKey: crypto.KeyObject,
  sigAlg: SigAlgId,
  payload: Partial<WSTFAuthPayload> & { sub: string; aud: string },
  ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: WSTFAuthPayload = {
    sub: payload.sub,
    aud: payload.aud,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + ttlSeconds,
    ...(payload.jti && { jti: payload.jti }),
  };

  // Copy any additional claims
  for (const [key, value] of Object.entries(payload)) {
    if (!['sub', 'aud', 'iat', 'exp', 'jti'].includes(key)) {
      fullPayload[key] = value;
    }
  }

  const payloadJson = JSON.stringify(fullPayload);
  const payloadB64 = base64urlEncode(payloadJson);
  const preimage = createPreimage(payloadJson);
  const signature = signPreimage(sigAlg, privateKey, preimage);

  return `${payloadB64}.${signature.toString('hex')}`;
}

/**
 * Parse a WSTFAuth token (without verification)
 */
export function parseToken(token: string): WSTFAuthToken | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signatureHex] = parts;

  try {
    const payloadJson = base64urlDecode(payloadB64).toString('utf8');
    const payload = JSON.parse(payloadJson) as WSTFAuthPayload;
    const signature = Buffer.from(signatureHex, 'hex');

    return {
      payload,
      signature,
      raw: token,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a WSTFAuth token signature
 *
 * @param token - Token string or parsed token
 * @param publicKey - Public key to verify against
 * @param sigAlg - Signature algorithm
 * @returns true if signature is valid
 */
export function verifyTokenSignature(
  token: string | WSTFAuthToken,
  publicKey: crypto.KeyObject,
  sigAlg: SigAlgId
): boolean {
  const parsed = typeof token === 'string' ? parseToken(token) : token;
  if (!parsed) {
    return false;
  }

  const payloadJson = base64urlDecode(parsed.raw.split('.')[0]).toString('utf8');
  const preimage = createPreimage(payloadJson);

  return verifyPreimage(sigAlg, publicKey, preimage, parsed.signature);
}

/**
 * Validate a WSTFAuth token (full validation)
 *
 * @param token - Token string
 * @param publicKey - Public key to verify signature
 * @param sigAlg - Signature algorithm
 * @param expectedAudience - Expected audience (programId)
 * @param nowSeconds - Current time (for testing)
 */
export function validateToken(
  token: string,
  publicKey: crypto.KeyObject,
  sigAlg: SigAlgId,
  expectedAudience: string,
  nowSeconds?: number
): TokenValidationResult {
  // Parse token
  const parsed = parseToken(token);
  if (!parsed) {
    return { valid: false, error: 'Invalid token format', code: 'INVALID_FORMAT' };
  }

  const { payload } = parsed;

  // Validate required fields
  if (!payload.sub || typeof payload.sub !== 'string') {
    return { valid: false, error: 'Missing or invalid sub field', code: 'MISSING_FIELD' };
  }
  if (!payload.aud || typeof payload.aud !== 'string') {
    return { valid: false, error: 'Missing or invalid aud field', code: 'MISSING_FIELD' };
  }
  if (typeof payload.iat !== 'number') {
    return { valid: false, error: 'Missing or invalid iat field', code: 'MISSING_FIELD' };
  }
  if (typeof payload.exp !== 'number') {
    return { valid: false, error: 'Missing or invalid exp field', code: 'MISSING_FIELD' };
  }

  // Check audience
  if (payload.aud !== expectedAudience) {
    return { valid: false, error: `Wrong audience: expected ${expectedAudience}`, code: 'WRONG_AUDIENCE' };
  }

  // Check expiry
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.exp + MAX_CLOCK_SKEW_SECONDS < now) {
    return { valid: false, error: 'Token expired', code: 'EXPIRED' };
  }

  // Check not-before (iat - skew)
  if (payload.iat - MAX_CLOCK_SKEW_SECONDS > now) {
    return { valid: false, error: 'Token not yet valid', code: 'NOT_YET_VALID' };
  }

  // Verify that public key matches the sub address
  if (!publicKeyMatchesAddress(publicKey, payload.sub)) {
    return { valid: false, error: 'Public key does not match sub address', code: 'ADDRESS_MISMATCH' };
  }

  // Verify signature
  if (!verifyTokenSignature(parsed, publicKey, sigAlg)) {
    return { valid: false, error: 'Invalid signature', code: 'SIGNATURE_INVALID' };
  }

  return { valid: true, payload };
}

/**
 * Generate a unique token ID (jti)
 */
export function generateTokenId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Check if a token is expired (without full validation)
 */
export function isTokenExpired(token: string | WSTFAuthToken, nowSeconds?: number): boolean {
  const parsed = typeof token === 'string' ? parseToken(token) : token;
  if (!parsed) {
    return true;
  }

  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  return parsed.payload.exp + MAX_CLOCK_SKEW_SECONDS < now;
}

/**
 * Get remaining TTL in seconds (0 if expired)
 */
export function getRemainingTTL(token: string | WSTFAuthToken, nowSeconds?: number): number {
  const parsed = typeof token === 'string' ? parseToken(token) : token;
  if (!parsed) {
    return 0;
  }

  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  const remaining = parsed.payload.exp - now;
  return Math.max(0, remaining);
}
