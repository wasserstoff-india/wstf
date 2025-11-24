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
