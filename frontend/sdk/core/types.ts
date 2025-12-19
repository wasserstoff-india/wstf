/**
 * Frontend SDK Core Types
 *
 * Type definitions for the browser-based WSTF SDK.
 */

// ============================================================
// Network Configuration
// ============================================================

export type NetworkProfile = 'devnet' | 'testnet' | 'mainnet';

export interface FrontendConfig {
  /** Network profile */
  network: NetworkProfile;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Explorer service URL */
  explorerUrl: string;
  /** Accounts service URL */
  accountsUrl: string;
  /** Chain identifier */
  chainId: string;
  /** Optional WebSocket URL for subscriptions */
  wsUrl?: string;
}

// ============================================================
// Wallet Types
// ============================================================

export type FrontendSigAlg = 'ed25519' | 'secp256k1' | 'passkey';

export type WalletStorageType = 'local_encrypted' | 'passkey' | 'injected' | 'hardware';

export interface StoredWalletMeta {
  /** Unique wallet identifier */
  id: string;
  /** User-defined label */
  label?: string;
  /** Signature algorithm */
  sigAlg: FrontendSigAlg;
  /** Derived address (gc...) */
  address: string;
  /** Creation timestamp */
  createdAt: number;
  /** Storage mechanism */
  storage: WalletStorageType;
  /** Whether this is the default wallet */
  isDefault?: boolean;
}

export interface WalletExportMeta {
  /** Wallet address */
  address: string;
  /** Public key (hex) */
  publicKeyHex: string;
  /** Signature algorithm */
  sigAlg: FrontendSigAlg;
  /** Creation timestamp */
  createdAt: number;
  /** Optional encrypted private key for backup */
  encryptedPrivateKey?: string;
}

export interface FrontendSigner {
  /** Wallet address (gc...) */
  address: string;
  /** Signature algorithm */
  sigAlg: FrontendSigAlg;
  /** Public key bytes */
  publicKey: Uint8Array;
  /** Sign arbitrary data */
  sign(data: Uint8Array): Promise<Uint8Array>;
  /** Export wallet metadata for backup */
  exportMeta(): Promise<WalletExportMeta>;
  /** Get stored metadata */
  getMeta(): StoredWalletMeta;
}

// ============================================================
// Account Types
// ============================================================

export interface AccountInfo {
  /** Account address */
  address: string;
  /** Current nonce */
  nonce: bigint;
  /** Public key (base64) */
  publicKeyBase64?: string;
  /** Signature algorithm ID */
  sigAlgId?: number;
  /** Bound username (if any) */
  username?: string;
}

export interface TokenBalance {
  /** Token ID */
  tokenId: string;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Balance amount (raw) */
  balance: bigint;
  /** Token decimals */
  decimals: number;
  /** Formatted balance string */
  formatted: string;
}

// ============================================================
// Explorer Types
// ============================================================

export interface BlockInfo {
  /** Block height */
  height: bigint;
  /** Block hash */
  hash: string;
  /** Parent block hash */
  parentHash: string;
  /** Block timestamp */
  timestamp: bigint;
  /** Number of transactions */
  txCount: number;
  /** State root */
  stateRoot: string;
}

export interface TransactionInfo {
  /** Transaction ID/hash */
  txId: string;
  /** Block height (if confirmed) */
  blockHeight?: bigint;
  /** Sender address */
  from: string;
  /** Recipient address (if applicable) */
  to?: string;
  /** Transaction type */
  type: 'basic' | 'program' | 'system';
  /** Status */
  status: 'pending' | 'confirmed' | 'failed';
  /** Timestamp */
  timestamp: bigint;
  /** Gas used */
  gasUsed?: bigint;
  /** Error message (if failed) */
  error?: string;
}

// ============================================================
// Standardized Method & Relay Types
// ============================================================

export enum StandardMethodId {
  // HTTP standardized methods
  HTTP_GET = 0x00000070,
  HTTP_POST = 0x00000071,
  HTTP_PUT = 0x00000072,
  HTTP_FETCH = 0x00000073,

  // Asset standards (Existing)
  TOK_DEPLOY = 0x00000030,
  TOK_MINT = 0x00000031,
  TOK_MINT_PROTECTED = 0x0000003b,
  TOK_TRANSFER = 0x00000033,
  NFT_TRANSFER = 0x00000040, // Creating or transferring

  // EVM Gateway standards (0x80+)
  EVM_CALL = 0x00000080,
  EVM_SEND = 0x00000081,

  // AMM / Liquidity Pool standards (0x90+)
  AMM_SWAP = 0x00000090,
  AMM_ADD_LIQ = 0x00000091,
  AMM_REMOVE_LIQ = 0x00000092,
}

export interface RelayTxPayload {
  /** Standardized Method ID */
  methodId: StandardMethodId | number;
  /** Destination (Username/DNS, Address, or Chain ID) */
  to: string;
  /** Payload data (Raw hex, JSON string, or Encrypted blob) */
  data: string;
}

// ============================================================
// Market Types
// ============================================================

export interface OrderbookLevel {
  /** Price level */
  price: bigint;
  /** Aggregate size at this level */
  size: bigint;
  /** Number of orders */
  orderCount: number;
}

export interface OrderbookSnapshot {
  /** Market ID */
  marketId: string;
  /** Bid levels (sorted by price desc) */
  bids: OrderbookLevel[];
  /** Ask levels (sorted by price asc) */
  asks: OrderbookLevel[];
  /** Snapshot timestamp */
  timestamp: bigint;
  /** Spread (best ask - best bid) */
  spread?: bigint;
  /** Mid price */
  midPrice?: bigint;
}

export interface TradeInfo {
  /** Trade ID */
  tradeId: string;
  /** Market ID */
  marketId: string;
  /** Price */
  price: bigint;
  /** Size */
  size: bigint;
  /** Side (from taker's perspective) */
  side: 'buy' | 'sell';
  /** Timestamp */
  timestamp: bigint;
  /** Maker address */
  maker: string;
  /** Taker address */
  taker: string;
}

// ============================================================
// RPC Types
// ============================================================

export interface RpcRequest {
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ============================================================
// Event Types
// ============================================================

export type WalletEventType = 'connected' | 'disconnected' | 'accountChanged' | 'networkChanged';

export interface WalletEvent {
  type: WalletEventType;
  address?: string;
  network?: NetworkProfile;
}

export type WalletEventHandler = (event: WalletEvent) => void;
