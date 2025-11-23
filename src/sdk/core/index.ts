/**
 * SDK Core - Re-exports all core SDK components
 */

// Types
export * from './types';

// Client
export { RpcClient, createClient, createTestClient } from './client';
export type { ClientConfig } from './client';

// Signer
export {
  KeypairSigner,
  WSTFAuthBuilder,
  buildAuthToken,
  parseAuthToken,
  isAuthTokenExpired,
  getAuthTokenTTL,
  generateAuthTokenId,
  createSigner,
  importSigner,
} from './signer';
export type { Signer, AuthTokenOptions, ParsedAuthToken } from './signer';

// Tokens
export { TokensSDK, createTokensSDK } from './tokens';
export type {
  TokenType,
  FungibleTokenInfo,
  NFTCollectionInfo,
  SFTCollectionInfo,
  AnyTokenInfo,
  TokenBalance,
  NFTInstanceInfo,
  AllowanceInfo,
  CreateFTParams,
  CreateNFTParams,
  CreateSFTParams,
  TransferParams,
  MintParams,
  BurnParams,
  ApproveParams,
} from './tokens';

// Markets
export { MarketsSDK, createMarketsSDK } from './markets';
export type {
  CreateMarketSdkParams,
  PlaceOrderSdkParams,
  CreateGridSdkParams,
  EscrowBalance,
  MarketStats,
} from './markets';

// Vars
export { VarsSDK, createVarsSDK } from './vars';
export type {
  NamespaceType,
  VarValue,
  VarEntry,
  SetVarOptions,
  ListVarsOptions,
  VarValueType,
  VarPermissions,
} from './vars';
