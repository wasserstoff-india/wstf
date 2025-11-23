/**
 * WSTF Chain SDK
 *
 * High-level SDK for interacting with the WSTF blockchain.
 *
 * @example
 * ```typescript
 * import { WSTFSDK, SigAlg } from '@wasserstoff/wstf-sdk';
 *
 * // Create SDK instance
 * const sdk = WSTFSDK.create({
 *   rpc: 'http://localhost:8545',
 *   signer: WSTFSDK.generateSigner(SigAlg.ED25519),
 * });
 *
 * // Use tokens API
 * const balance = await sdk.tokens.getBalance('tok_btc', sdk.address);
 *
 * // Use markets API
 * const order = await sdk.markets.placeOrder({
 *   marketId: 'mkt_btc_usdt',
 *   side: Side.BID,
 *   price: 50000_00n,
 *   size: 100000n,
 * });
 *
 * // Use vars API
 * await sdk.vars.setMyJson('settings', { theme: 'dark' });
 * ```
 */

// Re-export all core types and utilities
export * from './core';

// Re-export high-level helpers
export * from './highlevel';

// Import for SDK class
import {
  RpcClient,
  createClient,
  createTestClient,
  ClientConfig,
  Signer,
  KeypairSigner,
  createSigner,
  importSigner,
  TokensSDK,
  createTokensSDK,
  MarketsSDK,
  createMarketsSDK,
  VarsSDK,
  createVarsSDK,
  SigAlg,
  Address,
  SdkError,
} from './core';

/**
 * Extract error message from SdkResult error field.
 */
function getErrorMessage(error: string | SdkError | undefined): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') return error.message;
  return 'Unknown error';
}

import type { SimpleRPCService } from '../rpc/types';

// ============================================================================
// SDK Configuration
// ============================================================================

/**
 * SDK configuration options.
 */
export interface WSTFSDKConfig {
  /** RPC endpoint URL or in-memory service for testing */
  rpc: string | SimpleRPCService;
  /** Signer for transactions */
  signer: Signer;
  /** Program IDs (optional, uses defaults) */
  programs?: {
    tokens?: string;
    markets?: string;
    vars?: string;
  };
  /** Client configuration overrides */
  clientConfig?: Partial<ClientConfig>;
}

// ============================================================================
// Main SDK Class
// ============================================================================

/**
 * WSTF Chain SDK - Main entry point.
 *
 * Provides unified access to all chain functionality:
 * - `tokens` - Token operations (FT, NFT, SFT)
 * - `markets` - Orderbook operations
 * - `vars` - Key/value storage
 * - `client` - Raw RPC access
 */
export class WSTFSDK {
  /** RPC client for chain queries */
  readonly client: RpcClient;

  /** Signer for transactions */
  readonly signer: Signer;

  /** Tokens SDK */
  readonly tokens: TokensSDK;

  /** Markets SDK */
  readonly markets: MarketsSDK;

  /** Vars SDK */
  readonly vars: VarsSDK;

  private constructor(config: WSTFSDKConfig) {
    // Create RPC client
    this.client = typeof config.rpc === 'string'
      ? createClient({ rpc: config.rpc, ...config.clientConfig })
      : createTestClient(config.rpc);

    this.signer = config.signer;

    // Create module SDKs
    this.tokens = createTokensSDK(
      this.client,
      this.signer,
      config.programs?.tokens
    );

    this.markets = createMarketsSDK(
      this.client,
      this.signer,
      config.programs?.markets
    );

    this.vars = createVarsSDK(
      this.client,
      this.signer,
      config.programs?.vars
    );
  }

  /**
   * Create a new SDK instance.
   */
  static create(config: WSTFSDKConfig): WSTFSDK {
    return new WSTFSDK(config);
  }

  /**
   * Create an SDK instance for testing with in-memory RPC.
   */
  static createForTesting(rpc: SimpleRPCService, signer?: Signer): WSTFSDK {
    return new WSTFSDK({
      rpc,
      signer: signer ?? createSigner(SigAlg.ED25519),
    });
  }

  /**
   * Generate a new random signer.
   */
  static generateSigner(sigAlg: SigAlg = SigAlg.ED25519): Signer {
    return createSigner(sigAlg);
  }

  /**
   * Import a signer from a private key.
   */
  static importSigner(privateKey: string | Uint8Array, sigAlg: SigAlg): Signer {
    return importSigner(privateKey, sigAlg);
  }

  /**
   * Get the signer's address.
   */
  get address(): Address {
    return this.signer.address;
  }

  /**
   * Create a WSTFAuth token for a program.
   */
  createAuthToken(programId: string, ttlSeconds?: number): string {
    return this.signer.createAuthToken(programId, { ttlSeconds });
  }

  /**
   * Create a scoped WSTFAuth token.
   */
  createScopedToken(
    programId: string,
    scopes: string[],
    ttlSeconds?: number
  ): string {
    return this.signer.createScopedToken(programId, scopes, { ttlSeconds });
  }

  /**
   * Get current chain height.
   */
  async getHeight(): Promise<bigint> {
    const result = await this.client.getHeight();
    if (!result.success || result.data === undefined) {
      throw new Error(getErrorMessage(result.error) || 'Failed to get chain height');
    }
    return result.data;
  }

  /**
   * Get native token balance.
   */
  async getNativeBalance(address?: Address): Promise<bigint> {
    const result = await this.client.getNativeBalance(address ?? this.address);
    if (!result.success || result.data === undefined) {
      throw new Error(getErrorMessage(result.error) || 'Failed to get balance');
    }
    return result.data;
  }

  /**
   * Get account nonce.
   */
  async getNonce(address?: Address): Promise<bigint> {
    const result = await this.client.getNonce(address ?? this.address);
    if (!result.success || result.data === undefined) {
      throw new Error(getErrorMessage(result.error) || 'Failed to get nonce');
    }
    return result.data;
  }
}

// Default export
export default WSTFSDK;
