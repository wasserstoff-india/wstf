/**
 * SDK Tokens Module
 *
 * High-level API for token operations (FT, NFT, SFT).
 */

import {
  Address,
  TokenId,
  SdkResult,
  TxReceipt,
  TokenMeta,
  Balance,
  WaitOptions,
} from './types';
import { RpcClient } from './client';
import { Signer } from './signer';

// Internal token types
import type {
  FungibleToken,
  NFTCollection,
  SFTCollection,
  FTBalance,
  NFTInstance,
  SFTBalance,
  TransferRequest,
  MintRequest,
  BurnRequest,
  ApprovalRequest,
} from '../../../src/tokens/types';

// ============================================================================
// Token Types for SDK
// ============================================================================

/**
 * Token type discriminator.
 */
export type TokenType = 'FT' | 'NFT' | 'SFT';

/**
 * Fungible token metadata.
 */
export interface FungibleTokenInfo {
  tokenId: TokenId;
  type: 'FT';
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  maxSupply: bigint;
  creator: Address;
  owner: Address;
  mintable: boolean;
  burnable: boolean;
  paused: boolean;
}

/**
 * NFT collection info.
 */
export interface NFTCollectionInfo {
  tokenId: TokenId;
  type: 'NFT';
  name: string;
  symbol: string;
  totalSupply: bigint;
  maxSupply: bigint;
  creator: Address;
  owner: Address;
  baseUri?: string;
  mintable: boolean;
  burnable: boolean;
  paused: boolean;
  royaltyBps: number;
  royaltyReceiver?: Address;
}

/**
 * SFT collection info.
 */
export interface SFTCollectionInfo {
  tokenId: TokenId;
  type: 'SFT';
  name: string;
  symbol: string;
  creator: Address;
  owner: Address;
  baseUri?: string;
  mintable: boolean;
  burnable: boolean;
  paused: boolean;
}

/**
 * Union of all token info types.
 */
export type AnyTokenInfo = FungibleTokenInfo | NFTCollectionInfo | SFTCollectionInfo;

/**
 * Token balance info.
 */
export interface TokenBalance {
  tokenId: TokenId;
  holder: Address;
  balance: bigint;
  locked: bigint;
  available: bigint;
}

/**
 * NFT instance info.
 */
export interface NFTInstanceInfo {
  tokenId: TokenId;
  instanceId: string;
  owner: Address;
  tokenUri?: string;
  mintedAt: bigint;
  mintedBy: Address;
  locked: boolean;
}

/**
 * Allowance info.
 */
export interface AllowanceInfo {
  tokenId: TokenId;
  owner: Address;
  spender: Address;
  amount: bigint;
  expiresAt: bigint;
}

// ============================================================================
// Token Operations Params
// ============================================================================

/**
 * Parameters for creating a fungible token.
 */
export interface CreateFTParams {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply?: bigint;
  maxSupply?: bigint;
  mintable?: boolean;
  burnable?: boolean;
}

/**
 * Parameters for creating an NFT collection.
 */
export interface CreateNFTParams {
  name: string;
  symbol: string;
  maxSupply?: bigint;
  baseUri?: string;
  mintable?: boolean;
  burnable?: boolean;
  royaltyBps?: number;
  royaltyReceiver?: Address;
}

/**
 * Parameters for creating an SFT collection.
 */
export interface CreateSFTParams {
  name: string;
  symbol: string;
  baseUri?: string;
  mintable?: boolean;
  burnable?: boolean;
}

/**
 * Parameters for transferring tokens.
 */
export interface TransferParams {
  tokenId: TokenId;
  to: Address;
  amount?: bigint;
  instanceId?: string;
  classId?: string;
  memo?: string;
}

/**
 * Parameters for minting tokens.
 */
export interface MintParams {
  tokenId: TokenId;
  to: Address;
  amount?: bigint;
  instanceId?: string;
  classId?: string;
  tokenUri?: string;
}

/**
 * Parameters for burning tokens.
 */
export interface BurnParams {
  tokenId: TokenId;
  amount?: bigint;
  instanceId?: string;
  classId?: string;
}

/**
 * Parameters for approving token spending.
 */
export interface ApproveParams {
  tokenId: TokenId;
  spender: Address;
  amount?: bigint;
  instanceId?: string;
  approveAll?: boolean;
  expiresAt?: bigint;
}

// ============================================================================
// Tokens SDK
// ============================================================================

/**
 * Tokens SDK for token operations.
 */
export class TokensSDK {
  private client: RpcClient;
  private signer?: Signer;
  private programId: string;

  constructor(client: RpcClient, signer?: Signer, programId: string = 'tokens') {
    this.client = client;
    this.signer = signer;
    this.programId = programId;
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get token info by ID.
   */
  async getToken(tokenId: TokenId): Promise<SdkResult<AnyTokenInfo>> {
    // This would query the tokens program state
    return {
      success: false,
      error: 'Token queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get fungible token balance.
   */
  async getBalance(tokenId: TokenId, holder?: Address): Promise<SdkResult<TokenBalance>> {
    const address = holder ?? this.signer?.address;

    if (!address) {
      return { success: false, error: 'Address or signer required', code: 'INVALID_INPUT' };
    }

    // This would query the tokens program state
    return {
      success: false,
      error: 'Balance queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get NFT instance info.
   */
  async getNFT(tokenId: TokenId, instanceId: string): Promise<SdkResult<NFTInstanceInfo>> {
    return {
      success: false,
      error: 'NFT queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get NFTs owned by an address.
   */
  async getNFTsByOwner(
    tokenId: TokenId,
    owner?: Address
  ): Promise<SdkResult<NFTInstanceInfo[]>> {
    const address = owner ?? this.signer?.address;

    if (!address) {
      return { success: false, error: 'Address or signer required', code: 'INVALID_INPUT' };
    }

    return {
      success: false,
      error: 'NFT queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get allowance for a spender.
   */
  async getAllowance(
    tokenId: TokenId,
    spender: Address,
    owner?: Address
  ): Promise<SdkResult<AllowanceInfo>> {
    const ownerAddress = owner ?? this.signer?.address;

    if (!ownerAddress) {
      return { success: false, error: 'Address or signer required', code: 'INVALID_INPUT' };
    }

    return {
      success: false,
      error: 'Allowance queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Transaction Methods
  // ==========================================================================

  /**
   * Create a new fungible token.
   */
  async createFT(
    params: CreateFTParams,
    options?: WaitOptions
  ): Promise<SdkResult<{ tokenId: TokenId; receipt: TxReceipt }>> {
    if (!this.signer) {
      return { success: false, error: 'Signer required', code: 'AUTH_INVALID' };
    }

    // Build transaction
    const authToken = this.signer.createAuthToken(this.programId);

    // In production, this would:
    // 1. Build the transaction payload
    // 2. Sign with the signer
    // 3. Submit via client
    // 4. Wait for confirmation

    return {
      success: false,
      error: 'Token creation requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Create a new NFT collection.
   */
  async createNFT(
    params: CreateNFTParams,
    options?: WaitOptions
  ): Promise<SdkResult<{ tokenId: TokenId; receipt: TxReceipt }>> {
    return {
      success: false,
      error: 'NFT creation requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Create a new SFT collection.
   */
  async createSFT(
    params: CreateSFTParams,
    options?: WaitOptions
  ): Promise<SdkResult<{ tokenId: TokenId; receipt: TxReceipt }>> {
    return {
      success: false,
      error: 'SFT creation requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Transfer tokens.
   */
  async transfer(
    params: TransferParams,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    if (!this.signer) {
      return { success: false, error: 'Signer required', code: 'AUTH_INVALID' };
    }
    const authToken = this.signer.createScopedToken(this.programId, ['token:transfer']);

    return {
      success: false,
      error: 'Token transfer requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Batch transfer multiple tokens.
   */
  async batchTransfer(
    transfers: TransferParams[],
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    return {
      success: false,
      error: 'Batch transfer requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Mint tokens (requires mint permission).
   */
  async mint(
    params: MintParams,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    if (!this.signer) {
      return { success: false, error: 'Signer required', code: 'AUTH_INVALID' };
    }
    const authToken = this.signer.createScopedToken(this.programId, ['token:mint']);

    return {
      success: false,
      error: 'Token minting requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Burn tokens.
   */
  async burn(
    params: BurnParams,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    if (!this.signer) {
      return { success: false, error: 'Signer required', code: 'AUTH_INVALID' };
    }
    const authToken = this.signer.createScopedToken(this.programId, ['token:burn']);

    return {
      success: false,
      error: 'Token burning requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Approve token spending.
   */
  async approve(
    params: ApproveParams,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    if (!this.signer) {
      return { success: false, error: 'Signer required', code: 'AUTH_INVALID' };
    }
    const authToken = this.signer.createScopedToken(this.programId, ['token:approve']);

    return {
      success: false,
      error: 'Token approval requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Revoke approval.
   */
  async revokeApproval(
    tokenId: TokenId,
    spender: Address,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    return this.approve({
      tokenId,
      spender,
      amount: 0n,
    }, options);
  }

  // ==========================================================================
  // Admin Methods
  // ==========================================================================

  /**
   * Pause token (requires owner).
   */
  async pause(tokenId: TokenId, options?: WaitOptions): Promise<SdkResult<TxReceipt>> {
    if (!this.signer) {
      return { success: false, error: 'Signer required', code: 'AUTH_INVALID' };
    }
    const authToken = this.signer.createScopedToken(this.programId, ['token:admin']);

    return {
      success: false,
      error: 'Token pause requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Unpause token (requires owner).
   */
  async unpause(tokenId: TokenId, options?: WaitOptions): Promise<SdkResult<TxReceipt>> {
    if (!this.signer) {
      return { success: false, error: 'Signer required', code: 'AUTH_INVALID' };
    }
    const authToken = this.signer.createScopedToken(this.programId, ['token:admin']);

    return {
      success: false,
      error: 'Token unpause requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Transfer token ownership.
   */
  async transferOwnership(
    tokenId: TokenId,
    newOwner: Address,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    if (!this.signer) {
      return { success: false, error: 'Signer required', code: 'AUTH_INVALID' };
    }
    const authToken = this.signer.createScopedToken(this.programId, ['token:admin']);

    return {
      success: false,
      error: 'Ownership transfer requires program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Format token amount with decimals.
   */
  formatAmount(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;

    if (fraction === 0n) {
      return whole.toString();
    }

    const fractionStr = fraction.toString().padStart(decimals, '0');
    const trimmed = fractionStr.replace(/0+$/, '');
    return `${whole}.${trimmed}`;
  }

  /**
   * Parse token amount from string.
   */
  parseAmount(amount: string, decimals: number): bigint {
    const parts = amount.split('.');
    const wholePart = BigInt(parts[0] || '0');

    if (parts.length === 1) {
      return wholePart * (10n ** BigInt(decimals));
    }

    let fractionPart = parts[1] || '';
    if (fractionPart.length > decimals) {
      fractionPart = fractionPart.slice(0, decimals);
    } else {
      fractionPart = fractionPart.padEnd(decimals, '0');
    }

    return wholePart * (10n ** BigInt(decimals)) + BigInt(fractionPart);
  }
}

/**
 * Create a TokensSDK instance.
 */
export function createTokensSDK(
  client: RpcClient,
  signer?: Signer,
  programId?: string
): TokensSDK {
  return new TokensSDK(client, signer, programId);
}
