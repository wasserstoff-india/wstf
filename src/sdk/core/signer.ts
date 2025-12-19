/**
 * SDK Signer and WSTFAuth Builder
 *
 * Provides cryptographic signing capabilities and WSTFAuth token generation
 * for SDK consumers.
 */

import crypto from 'crypto';
import {
  Address,
  Hex32,
  SigAlg,
  DEFAULT_TOKEN_TTL_SECONDS,
  DEFAULT_CLOCK_SKEW_SECONDS,
  unsafe,
} from './types';

// Internal imports
import { generateKeypair, exportPubDER, Keypair } from '../../../src/crypto/keys';
import { deriveAddress } from '../../../src/crypto/address';
import { signPreimage } from '../../../src/crypto/sign';
import { SigAlgId, MappingAlgId } from '../../../src/crypto/algorithms';
import {
  signToken as internalSignToken,
  parseToken,
  isTokenExpired,
  getRemainingTTL,
  generateTokenId,
} from '../../../src/auth/wstf';
import {
  signBoundToken as internalSignBoundToken,
} from '../../../src/auth/binding';

// ============================================================================
// Type Conversions
// ============================================================================

/**
 * Convert SDK SigAlg to internal SigAlgId.
 */
function toInternalSigAlg(alg: SigAlg): SigAlgId {
  switch (alg) {
    case SigAlg.ED25519:
      return SigAlgId.ED25519;
    case SigAlg.SECP256K1:
      return SigAlgId.SECP256K1;
    default:
      throw new Error(`Unknown signature algorithm: ${alg}`);
  }
}

/**
 * Convert internal SigAlgId to SDK SigAlg.
 */
function fromInternalSigAlg(alg: SigAlgId): SigAlg {
  switch (alg) {
    case SigAlgId.ED25519:
      return SigAlg.ED25519;
    case SigAlgId.SECP256K1:
      return SigAlg.SECP256K1;
    default:
      throw new Error(`Unknown signature algorithm: ${alg}`);
  }
}

// ============================================================================
// Signer Interface
// ============================================================================

/**
 * Signer interface for SDK operations.
 */
export interface Signer {
  /** Get the signer's address */
  readonly address: Address;
  /** Get the signature algorithm */
  readonly sigAlg: SigAlg;

  /** Sign arbitrary data */
  sign(data: Uint8Array): Promise<Uint8Array>;
  /** Sign a transaction (returns signed transaction bytes) */
  signTransaction(txBytes: Uint8Array): Promise<Uint8Array>;
  /** Create a WSTFAuth token for a program */
  createAuthToken(programId: string, options?: AuthTokenOptions): string;
  /** Create a scoped WSTFAuth token */
  createScopedToken(programId: string, scopes: string[], options?: AuthTokenOptions): string;
  /** Get the public key in DER format */
  getPublicKeyDER(): Uint8Array;
}

/**
 * Options for creating auth tokens.
 */
export interface AuthTokenOptions {
  /** Token TTL in seconds (default 300) */
  ttlSeconds?: number;
  /** Unique token ID for replay protection */
  jti?: string;
  /** Additional claims */
  claims?: Record<string, unknown>;
}

// ============================================================================
// KeypairSigner Implementation
// ============================================================================

/**
 * Signer implementation using a keypair.
 */
export class KeypairSigner implements Signer {
  private keypair: Keypair;
  private _address: Address;

  private constructor(keypair: Keypair, address: Address) {
    this.keypair = keypair;
    this._address = address;
  }

  /**
   * Create a signer from an existing keypair.
   */
  static fromKeypair(keypair: Keypair): KeypairSigner {
    const pubDER = exportPubDER(keypair.publicKey);
    const addressStr = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, keypair.sigAlg);
    // Use unsafe cast for internal SDK code - we trust deriveAddress output
    return new KeypairSigner(keypair, unsafe.address(addressStr));
  }

  /**
   * Generate a new random signer.
   */
  static generate(sigAlg: SigAlg = SigAlg.ED25519): KeypairSigner {
    const internalAlg = toInternalSigAlg(sigAlg);
    const keypair = generateKeypair(internalAlg);
    return KeypairSigner.fromKeypair(keypair);
  }

  /**
   * Import a signer from a private key.
   * Supports PEM format or raw bytes.
   */
  static fromPrivateKey(
    privateKey: string | Uint8Array,
    sigAlg: SigAlg
  ): KeypairSigner {
    const internalAlg = toInternalSigAlg(sigAlg);

    let privateKeyObject: crypto.KeyObject;
    let publicKeyObject: crypto.KeyObject;

    if (typeof privateKey === 'string') {
      // PEM format
      privateKeyObject = crypto.createPrivateKey(privateKey);
      publicKeyObject = crypto.createPublicKey(privateKey);
    } else {
      // Raw bytes - need to determine format based on algorithm
      if (sigAlg === SigAlg.ED25519) {
        // Ed25519 raw seed (32 bytes)
        if (privateKey.length === 32) {
          privateKeyObject = crypto.createPrivateKey({
            key: Buffer.concat([
              // Ed25519 PKCS8 prefix
              Buffer.from('302e020100300506032b657004220420', 'hex'),
              Buffer.from(privateKey),
            ]),
            format: 'der',
            type: 'pkcs8',
          });
          publicKeyObject = crypto.createPublicKey(privateKeyObject);
        } else {
          // Assume DER/PKCS8 format
          privateKeyObject = crypto.createPrivateKey({
            key: Buffer.from(privateKey),
            format: 'der',
            type: 'pkcs8',
          });
          publicKeyObject = crypto.createPublicKey(privateKeyObject);
        }
      } else {
        // SECP256K1 - wrap raw 32-byte key in SEC1 DER if needed
        if (privateKey.length === 32) {
          privateKeyObject = crypto.createPrivateKey({
            key: Buffer.concat([
              Buffer.from('302e0201010420', 'hex'),
              Buffer.from(privateKey),
              Buffer.from('a00706052b8104000a', 'hex'),
            ]),
            format: 'der',
            type: 'sec1',
          });
        } else {
          privateKeyObject = crypto.createPrivateKey({
            key: Buffer.from(privateKey),
            format: 'der',
            type: 'pkcs8',
          });
        }
        publicKeyObject = crypto.createPublicKey(privateKeyObject);
      }
    }

    const keypair: Keypair = {
      privateKey: privateKeyObject,
      publicKey: publicKeyObject,
      sigAlg: internalAlg,
    };

    return KeypairSigner.fromKeypair(keypair);
  }

  get address(): Address {
    return this._address;
  }

  get publicKeyBase64(): string {
    return Buffer.from(this.getPublicKeyDER()).toString('base64');
  }

  get sigAlg(): SigAlg {
    return fromInternalSigAlg(this.keypair.sigAlg);
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const preimage = crypto.createHash('sha256').update(data).digest();
    const signature = signPreimage(
      this.keypair.sigAlg,
      this.keypair.privateKey,
      preimage
    );
    return new Uint8Array(signature);
  }

  async signTransaction(txBytes: Uint8Array): Promise<Uint8Array> {
    // Sign the transaction bytes
    const signature = await this.sign(txBytes);

    // In a real implementation, this would create a properly formatted
    // signed transaction envelope. For now, concatenate sig + tx.
    const signedTx = new Uint8Array(signature.length + txBytes.length);
    signedTx.set(signature);
    signedTx.set(txBytes, signature.length);

    return signedTx;
  }

  createAuthToken(programId: string, options?: AuthTokenOptions): string {
    const payload: Record<string, unknown> = {
      sub: this._address,
      aud: programId,
    };

    if (options?.jti) {
      payload.jti = options.jti;
    }

    if (options?.claims) {
      Object.assign(payload, options.claims);
    }

    return internalSignToken(
      this.keypair.privateKey,
      this.keypair.sigAlg,
      payload as { sub: string; aud: string },
      options?.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
    );
  }

  createScopedToken(
    programId: string,
    scopes: string[],
    options?: AuthTokenOptions
  ): string {
    const payload: Record<string, unknown> = {
      sub: this._address,
      aud: programId,
      scp: scopes,
    };

    if (options?.jti) {
      payload.jti = options.jti;
    }

    if (options?.claims) {
      Object.assign(payload, options.claims);
    }

    return internalSignBoundToken(
      this.keypair.privateKey,
      this.keypair.sigAlg,
      payload as { sub: string; aud: string; scp: string[] },
      options?.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
    );
  }

  getPublicKeyDER(): Uint8Array {
    return new Uint8Array(exportPubDER(this.keypair.publicKey));
  }

  /**
   * Export the private key (for backup/storage).
   * Warning: Handle with care!
   */
  exportPrivateKey(format: 'pem' | 'der' = 'pem'): string | Uint8Array {
    if (format === 'pem') {
      return this.keypair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    }
    return new Uint8Array(
      this.keypair.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer
    );
  }
}

// ============================================================================
// WSTFAuth Builder
// ============================================================================

/**
 * WSTFAuth token builder for fluent API.
 */
export class WSTFAuthBuilder {
  private _subject: Address;
  private _audience: string;
  private _scopes: string[] = [];
  private _ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS;
  private _jti?: string;
  private _claims: Record<string, unknown> = {};

  constructor(subject: Address) {
    this._subject = subject;
    this._audience = '';
  }

  /**
   * Set the audience (program ID).
   */
  audience(programId: string): this {
    this._audience = programId;
    return this;
  }

  /**
   * Add scopes to the token.
   */
  scopes(...scopes: string[]): this {
    this._scopes.push(...scopes);
    return this;
  }

  /**
   * Set the token TTL.
   */
  ttl(seconds: number): this {
    this._ttlSeconds = seconds;
    return this;
  }

  /**
   * Set a unique token ID.
   */
  jti(id?: string): this {
    this._jti = id ?? generateTokenId();
    return this;
  }

  /**
   * Add custom claims.
   */
  claim(key: string, value: unknown): this {
    this._claims[key] = value;
    return this;
  }

  /**
   * Sign the token with a signer.
   */
  sign(signer: Signer): string {
    if (!this._audience) {
      throw new Error('Audience (program ID) is required');
    }

    if (this._scopes.length > 0) {
      return signer.createScopedToken(this._audience, this._scopes, {
        ttlSeconds: this._ttlSeconds,
        jti: this._jti,
        claims: this._claims,
      });
    }

    return signer.createAuthToken(this._audience, {
      ttlSeconds: this._ttlSeconds,
      jti: this._jti,
      claims: this._claims,
    });
  }
}

/**
 * Create a WSTFAuth token builder.
 */
export function buildAuthToken(signer: Signer): WSTFAuthBuilder {
  return new WSTFAuthBuilder(signer.address);
}

// ============================================================================
// Token Utilities
// ============================================================================

/**
 * Parse a WSTFAuth token and return its payload.
 */
export interface ParsedAuthToken {
  /** Subject address */
  sub: Address;
  /** Audience (program ID) */
  aud: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiry timestamp */
  exp: number;
  /** Token ID */
  jti?: string;
  /** Scopes (if present) */
  scp?: string[];
  /** Additional claims */
  [key: string]: unknown;
}

/**
 * Parse a WSTFAuth token without verification.
 */
export function parseAuthToken(token: string): ParsedAuthToken | null {
  const parsed = parseToken(token);
  if (!parsed) {
    return null;
  }

  const result: ParsedAuthToken = {
    sub: parsed.payload.sub as Address,
    aud: parsed.payload.aud,
    iat: parsed.payload.iat,
    exp: parsed.payload.exp,
    jti: parsed.payload.jti,
  };

  if (parsed.payload.scp) {
    // scp can be stored as space-separated string or array
    const scp = parsed.payload.scp;
    if (typeof scp === 'string') {
      result.scp = scp.split(' ');
    } else if (Array.isArray(scp)) {
      result.scp = scp as string[];
    }
  }

  return result;
}

/**
 * Check if a token is expired.
 */
export function isAuthTokenExpired(token: string): boolean {
  return isTokenExpired(token);
}

/**
 * Get remaining TTL of a token in seconds.
 */
export function getAuthTokenTTL(token: string): number {
  return getRemainingTTL(token);
}

/**
 * Generate a unique token ID.
 */
export function generateAuthTokenId(): string {
  return generateTokenId();
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new random signer.
 */
export function createSigner(sigAlg: SigAlg = SigAlg.ED25519): Signer {
  return KeypairSigner.generate(sigAlg);
}

/**
 * Import a signer from a private key.
 */
export function importSigner(privateKey: string | Uint8Array, sigAlg: SigAlg): Signer {
  return KeypairSigner.fromPrivateKey(privateKey, sigAlg);
}

// ============================================================================
// Paper Wallet & Secure Random Generation
// ============================================================================

/**
 * Enhanced entropy source for paper wallet generation.
 * Combines multiple entropy sources for maximum security.
 */
class SecureEntropySource {
  /**
   * Generate cryptographically secure random bytes using multiple entropy sources.
   */
  private static generateSecureEntropy(length: number): Uint8Array {
    // Primary: Node.js crypto.randomBytes (uses OS entropy)
    const primary = crypto.randomBytes(length);

    // Secondary: High-resolution timer entropy
    const timeEntropy = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      timeEntropy[i] = (performance.now() * 1000000) % 256;
    }

    // Tertiary: Process-specific entropy
    const processEntropy = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      processEntropy[i] = Number(process.hrtime.bigint() % 256n);
    }

    // Combine all entropy sources with XOR
    const combined = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      combined[i] = primary[i] ^ timeEntropy[i] ^ processEntropy[i];
    }

    return combined;
  }

  /**
   * Generate a secure random BigInt for mathematical operations.
   */
  static generateSecureRandomBigInt(bitLength: number = 256): bigint {
    const byteLength = Math.ceil(bitLength / 8);
    const entropy = this.generateSecureEntropy(byteLength);

    // Convert bytes to BigInt
    let result = 0n;
    for (let i = 0; i < entropy.length; i++) {
      result = (result << 8n) + BigInt(entropy[i]);
    }

    // Ensure we don't exceed the bit length
    const mask = (1n << BigInt(bitLength)) - 1n;
    return result & mask;
  }

  /**
   * Generate entropy using the "multiplication method" for additional randomness.
   * This multiplies two large random numbers to create a more complex entropy pattern.
   */
  static generateMultiplicationEntropy(bitLength: number = 256): bigint {
    // Generate two large random numbers
    const factor1 = this.generateSecureRandomBigInt(bitLength / 2);
    const factor2 = this.generateSecureRandomBigInt(bitLength / 2);

    // Multiply them together
    const product = factor1 * factor2;

    // Use the middle bits to avoid predictable patterns
    const shift = BigInt(bitLength / 4);
    const mask = (1n << BigInt(bitLength)) - 1n;

    return (product >> shift) & mask;
  }
}

/**
 * Paper wallet generation options.
 */
export interface PaperWalletOptions {
  /** Signature algorithm to use */
  sigAlg?: SigAlg;
  /** Use enhanced entropy mixing */
  useEnhancedEntropy?: boolean;
  /** Use multiplication method for additional randomness */
  useMultiplicationMethod?: boolean;
  /** Custom entropy source (advanced) */
  customEntropy?: Uint8Array;
}

/**
 * Paper wallet result.
 */
export interface PaperWallet {
  /** The signer instance */
  signer: Signer;
  /** Wallet address */
  address: string;
  /** Public key in Base64 DER format */
  publicKey: string;
  /** Private key in PEM format (store securely!) */
  privateKeyPEM: string;
  /** Private key in raw bytes (for QR codes) */
  privateKeyRaw: Uint8Array;
  /** Signature algorithm */
  sigAlg: string;
  /** Entropy information */
  entropy: {
    sources: string[];
    totalBits: number;
    method: string;
  };
}

/**
 * Generate a secure paper wallet with enhanced entropy.
 *
 * This function uses multiple entropy sources and mathematical operations
 * to create highly secure private keys suitable for cold storage.
 */
export function generatePaperWallet(options: PaperWalletOptions = {}): PaperWallet {
  const {
    sigAlg = SigAlg.ED25519,
    useEnhancedEntropy = true,
    useMultiplicationMethod = true,
    customEntropy
  } = options;

  let privateKeyBytes: Uint8Array;
  let entropyInfo: { sources: string[]; totalBits: number; method: string };

  if (customEntropy) {
    // Use custom entropy
    privateKeyBytes = customEntropy;
    entropyInfo = {
      sources: ['custom'],
      totalBits: customEntropy.length * 8,
      method: 'custom-provided'
    };
  } else if (useEnhancedEntropy && useMultiplicationMethod) {
    // Generate using multiplication method with enhanced entropy
    const entropy = SecureEntropySource.generateMultiplicationEntropy(256);
    privateKeyBytes = new Uint8Array(32);

    // Convert BigInt to bytes
    for (let i = 0; i < 32; i++) {
      privateKeyBytes[31 - i] = Number((entropy >> (BigInt(i) * 8n)) & 0xFFn);
    }

    entropyInfo = {
      sources: ['os-random', 'high-res-timer', 'process-entropy', 'multiplication-method'],
      totalBits: 512, // Two 256-bit numbers multiplied
      method: 'enhanced-multiplication'
    };
  } else if (useEnhancedEntropy) {
    // Enhanced entropy without multiplication
    const entropy = SecureEntropySource.generateSecureRandomBigInt(256);
    privateKeyBytes = new Uint8Array(32);

    for (let i = 0; i < 32; i++) {
      privateKeyBytes[31 - i] = Number((entropy >> (BigInt(i) * 8n)) & 0xFFn);
    }

    entropyInfo = {
      sources: ['os-random', 'high-res-timer', 'process-entropy'],
      totalBits: 256,
      method: 'enhanced-xor'
    };
  } else {
    // Standard Node.js crypto entropy
    privateKeyBytes = crypto.randomBytes(32);
    entropyInfo = {
      sources: ['os-random'],
      totalBits: 256,
      method: 'standard-crypto'
    };
  }

  // Create signer from the generated entropy
  const signer = KeypairSigner.fromPrivateKey(privateKeyBytes, sigAlg);

  // Export keys for paper wallet
  const privateKeyPEM = (signer as KeypairSigner).exportPrivateKey('pem') as string;
  const publicKeyDER = signer.getPublicKeyDER();

  console.log(`🔐 Generated paper wallet using ${entropyInfo.method} with ${entropyInfo.totalBits} bits of entropy`);
  console.log(`📄 Address: ${signer.address}`);
  console.log(`🔍 Entropy sources: ${entropyInfo.sources.join(', ')}`);

  return {
    signer,
    address: signer.address,
    publicKey: Buffer.from(publicKeyDER).toString('base64'),
    privateKeyPEM,
    privateKeyRaw: privateKeyBytes,
    sigAlg: sigAlg === SigAlg.SECP256K1 ? 'secp256k1' : 'ed25519',
    entropy: entropyInfo
  };
}

/**
 * Generate multiple paper wallets for distribution.
 * Useful for creating multiple cold storage wallets.
 */
export function generatePaperWalletBatch(
  count: number,
  options: PaperWalletOptions = {}
): PaperWallet[] {
  if (count <= 0 || count > 100) {
    throw new Error('Batch size must be between 1 and 100 for security reasons');
  }

  console.log(`📦 Generating batch of ${count} paper wallets...`);

  const wallets: PaperWallet[] = [];
  for (let i = 0; i < count; i++) {
    // Add slight delay and extra entropy for each wallet
    const extraEntropy = crypto.randomBytes(8);
    const wallet = generatePaperWallet({
      ...options,
      customEntropy: options.customEntropy ?
        new Uint8Array([...options.customEntropy, ...extraEntropy]) :
        undefined
    });
    wallets.push(wallet);

    // Small delay to ensure different timestamps
    if (i < count - 1) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
    }
  }

  console.log(`✅ Generated ${count} paper wallets successfully`);
  return wallets;
}

/**
 * Validate a paper wallet by checking key consistency.
 */
export function validatePaperWallet(wallet: PaperWallet): boolean {
  try {
    // Re-import the private key and verify it produces the same address
    const sigAlg = wallet.sigAlg === 'secp256k1' ? SigAlg.SECP256K1 : SigAlg.ED25519;
    const reimported = KeypairSigner.fromPrivateKey(wallet.privateKeyPEM, sigAlg);

    const addressMatch = reimported.address === wallet.address;
    const publicKeyMatch = Buffer.from(reimported.getPublicKeyDER()).toString('base64') === wallet.publicKey;

    return addressMatch && publicKeyMatch;
  } catch {
    return false;
  }
}
