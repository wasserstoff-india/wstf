/**
 * Token Types - Fungible, Non-Fungible, and Semi-Fungible Token Standards
 *
 * Supports:
 * - FT (Fungible Token): ERC-20 style divisible tokens
 * - NFT (Non-Fungible Token): ERC-721 style unique tokens
 * - SFT (Semi-Fungible Token): ERC-1155 style mixed fungibility
 */

// ============================================================================
// Branded Types
// ============================================================================

/** Token contract/collection identifier */
export type TokenId = string & { readonly __brand: 'TokenId' };

/** Specific token instance ID (for NFT/SFT) */
export type TokenInstanceId = string & { readonly __brand: 'TokenInstanceId' };

/** Token class ID (for SFT - groups of fungible tokens) */
export type TokenClassId = string & { readonly __brand: 'TokenClassId' };

// ============================================================================
// Token Types
// ============================================================================

/** Token type discriminator */
export type TokenType = 'FT' | 'NFT' | 'SFT';

/** Token standard versions */
export const TokenStandard = {
  FT_V1: 'WSTF-FT-V1',
  NFT_V1: 'WSTF-NFT-V1',
  SFT_V1: 'WSTF-SFT-V1',
} as const;

export type TokenStandardType = typeof TokenStandard[keyof typeof TokenStandard];

// ============================================================================
// Common Token Metadata
// ============================================================================

/** Base token metadata */
export interface BaseTokenMetadata {
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Description */
  description?: string;
  /** Image URI */
  image?: string;
  /** External link */
  externalUrl?: string;
  /** Custom attributes */
  attributes?: TokenAttribute[];
}

/** Token attribute for metadata */
export interface TokenAttribute {
  traitType: string;
  value: string | number | boolean;
  displayType?: 'number' | 'boost_number' | 'boost_percentage' | 'date';
}

// ============================================================================
// Fungible Token (FT)
// ============================================================================

/** Fungible token definition */
export interface FungibleToken {
  tokenId: TokenId;
  type: 'FT';
  standard: typeof TokenStandard.FT_V1;
  /** Token name */
  name: string;
  /** Token symbol (e.g., 'USDC') */
  symbol: string;
  /** Decimal places (e.g., 18 for ETH-like, 6 for USDC-like) */
  decimals: number;
  /** Total supply (in smallest unit) */
  totalSupply: bigint;
  /** Maximum supply (0 = unlimited) */
  maxSupply: bigint;
  /** Creator/deployer address */
  creator: string;
  /** Owner address (can manage token) */
  owner: string;
  /** Is minting enabled */
  mintable: boolean;
  /** Is burning enabled */
  burnable: boolean;
  /** Is token paused */
  paused: boolean;
  /** Creation timestamp */
  createdAt: bigint;
  /** State version for OCC */
  version: bigint;
  /** Optional metadata */
  metadata?: BaseTokenMetadata;
}

/** FT balance record */
export interface FTBalance {
  tokenId: TokenId;
  holder: string;
  balance: bigint;
  /** Locked/frozen amount */
  locked: bigint;
  version: bigint;
}

/** FT allowance record */
export interface FTAllowance {
  tokenId: TokenId;
  owner: string;
  spender: string;
  amount: bigint;
  /** Expiry timestamp (0 = never) */
  expiresAt: bigint;
  version: bigint;
}

// ============================================================================
// Non-Fungible Token (NFT)
// ============================================================================

/** NFT collection definition */
export interface NFTCollection {
  tokenId: TokenId;
  type: 'NFT';
  standard: typeof TokenStandard.NFT_V1;
  /** Collection name */
  name: string;
  /** Collection symbol */
  symbol: string;
  /** Total minted count */
  totalSupply: bigint;
  /** Maximum supply (0 = unlimited) */
  maxSupply: bigint;
  /** Creator address */
  creator: string;
  /** Owner address */
  owner: string;
  /** Base URI for token metadata */
  baseUri?: string;
  /** Is minting enabled */
  mintable: boolean;
  /** Is burning enabled */
  burnable: boolean;
  /** Is collection paused */
  paused: boolean;
  /** Royalty percentage (basis points, e.g., 250 = 2.5%) */
  royaltyBps: number;
  /** Royalty receiver address */
  royaltyReceiver?: string;
  /** Creation timestamp */
  createdAt: bigint;
  /** State version */
  version: bigint;
  /** Collection metadata */
  metadata?: BaseTokenMetadata;
}

/** Individual NFT instance */
export interface NFTInstance {
  tokenId: TokenId;
  instanceId: TokenInstanceId;
  /** Current owner */
  owner: string;
  /** Token URI (overrides collection baseUri) */
  tokenUri?: string;
  /** Instance-specific metadata */
  metadata?: BaseTokenMetadata;
  /** Mint timestamp */
  mintedAt: bigint;
  /** Minted by address */
  mintedBy: string;
  /** Is token locked/frozen */
  locked: boolean;
  /** State version */
  version: bigint;
}

/** NFT approval record */
export interface NFTApproval {
  tokenId: TokenId;
  instanceId: TokenInstanceId;
  owner: string;
  approved: string;
  expiresAt: bigint;
}

/** NFT operator approval (approve all) */
export interface NFTOperatorApproval {
  tokenId: TokenId;
  owner: string;
  operator: string;
  approved: boolean;
}

// ============================================================================
// Semi-Fungible Token (SFT)
// ============================================================================

/** SFT collection/contract definition */
export interface SFTCollection {
  tokenId: TokenId;
  type: 'SFT';
  standard: typeof TokenStandard.SFT_V1;
  /** Collection name */
  name: string;
  /** Collection symbol */
  symbol: string;
  /** Creator address */
  creator: string;
  /** Owner address */
  owner: string;
  /** Base URI for metadata */
  baseUri?: string;
  /** Is minting enabled */
  mintable: boolean;
  /** Is burning enabled */
  burnable: boolean;
  /** Is collection paused */
  paused: boolean;
  /** Creation timestamp */
  createdAt: bigint;
  /** State version */
  version: bigint;
  /** Collection metadata */
  metadata?: BaseTokenMetadata;
}

/** SFT token class (a type of token within the collection) */
export interface SFTClass {
  tokenId: TokenId;
  classId: TokenClassId;
  /** Class name */
  name: string;
  /** Total supply of this class */
  totalSupply: bigint;
  /** Maximum supply (0 = unlimited) */
  maxSupply: bigint;
  /** Is this class fungible within itself */
  fungible: boolean;
  /** Class-specific metadata */
  metadata?: BaseTokenMetadata;
  /** Token URI for this class */
  tokenUri?: string;
  /** Creation timestamp */
  createdAt: bigint;
  /** State version */
  version: bigint;
}

/** SFT balance record */
export interface SFTBalance {
  tokenId: TokenId;
  classId: TokenClassId;
  holder: string;
  balance: bigint;
  locked: bigint;
  version: bigint;
}

/** SFT operator approval */
export interface SFTOperatorApproval {
  tokenId: TokenId;
  owner: string;
  operator: string;
  approved: boolean;
}

// ============================================================================
// Union Types
// ============================================================================

/** Any token definition */
export type AnyToken = FungibleToken | NFTCollection | SFTCollection;

/** Token with type guard */
export function isFT(token: AnyToken): token is FungibleToken {
  return token.type === 'FT';
}

export function isNFT(token: AnyToken): token is NFTCollection {
  return token.type === 'NFT';
}

export function isSFT(token: AnyToken): token is SFTCollection {
  return token.type === 'SFT';
}

// ============================================================================
// Factory Functions
// ============================================================================

export function makeTokenId(raw: string): TokenId {
  return raw as TokenId;
}

export function makeTokenInstanceId(raw: string): TokenInstanceId {
  return raw as TokenInstanceId;
}

export function makeTokenClassId(raw: string): TokenClassId {
  return raw as TokenClassId;
}

// ============================================================================
// Token Operations
// ============================================================================

/** Transfer request */
export interface TransferRequest {
  tokenId: TokenId;
  from: string;
  to: string;
  /** Amount for FT/SFT, ignored for NFT */
  amount?: bigint;
  /** Instance ID for NFT */
  instanceId?: TokenInstanceId;
  /** Class ID for SFT */
  classId?: TokenClassId;
  /** Optional memo */
  memo?: string;
}

/** Mint request */
export interface MintRequest {
  tokenId: TokenId;
  to: string;
  /** Amount for FT/SFT */
  amount?: bigint;
  /** Instance ID for NFT (auto-generated if not provided) */
  instanceId?: TokenInstanceId;
  /** Class ID for SFT */
  classId?: TokenClassId;
  /** Token URI for NFT */
  tokenUri?: string;
  /** Instance metadata for NFT */
  metadata?: BaseTokenMetadata;
}

/** Burn request */
export interface BurnRequest {
  tokenId: TokenId;
  from: string;
  amount?: bigint;
  instanceId?: TokenInstanceId;
  classId?: TokenClassId;
}

/** Approval request */
export interface ApprovalRequest {
  tokenId: TokenId;
  owner: string;
  spender: string;
  /** Amount for FT, ignored for NFT/SFT */
  amount?: bigint;
  /** Instance ID for NFT single approval */
  instanceId?: TokenInstanceId;
  /** Approve all (operator approval) */
  approveAll?: boolean;
  /** Expiry timestamp */
  expiresAt?: bigint;
}

// ============================================================================
// Validation
// ============================================================================

/** Validate token symbol */
export function isValidSymbol(symbol: string): boolean {
  // 2-10 uppercase alphanumeric characters
  return /^[A-Z0-9]{2,10}$/.test(symbol);
}

/** Validate token name */
export function isValidName(name: string): boolean {
  return name.length >= 1 && name.length <= 64;
}

/** Validate decimals */
export function isValidDecimals(decimals: number): boolean {
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18;
}

/** Validate royalty basis points */
export function isValidRoyaltyBps(bps: number): boolean {
  return Number.isInteger(bps) && bps >= 0 && bps <= 10000; // 0-100%
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum decimals allowed */
export const MAX_DECIMALS = 18;

/** Maximum royalty (100%) */
export const MAX_ROYALTY_BPS = 10000;

/** Zero address for burns */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ============================================================================
// Events
// ============================================================================

/** Token event types */
export type TokenEventType =
  | 'Transfer'
  | 'Approval'
  | 'ApprovalForAll'
  | 'Mint'
  | 'Burn'
  | 'Pause'
  | 'Unpause'
  | 'MetadataUpdate'
  | 'OwnershipTransfer';

/** Token event */
export interface TokenEvent {
  type: TokenEventType;
  tokenId: TokenId;
  from?: string;
  to?: string;
  amount?: bigint;
  instanceId?: TokenInstanceId;
  classId?: TokenClassId;
  operator?: string;
  approved?: boolean;
  timestamp: bigint;
}
