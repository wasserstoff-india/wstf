/**
 * RPC Types - Simple and Enhanced RPC surfaces
 */

import { Gas, Balance } from '../economics/types';

// ============================================
// Query Prefix Indexes (for RocksDB layout)
// ============================================

export const QUERY_PREFIXES = {
  BLOCK_HEIGHT: 'blk:h:',     // blk:h:{height} -> blockHash
  BLOCK_HASH: 'blk:id:',      // blk:id:{hash} -> Block
  TX_HASH: 'tx:id:',          // tx:id:{hash} -> Tx + blockHash + index
  RECEIPT: 'rcpt:',           // rcpt:{txHash} -> Receipt
  ACCOUNT: 'acct:',           // acct:{address} -> Account
  ACCOUNT_TXS: 'acct:tx:',    // acct:tx:{address}:{nonce} -> txHash
  STATE: 'state:',            // state:{stateId} -> StateObject
} as const;

// ============================================
// Common Types
// ============================================

export interface Pagination {
  offset?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface RPCError {
  code: string;
  message: string;
  data?: unknown;
}

export interface RPCResponse<T> {
  ok: boolean;
  data?: T;
  error?: RPCError;
}

// ============================================
// Simple RPC Types
// ============================================

/** Block summary for list queries */
export interface BlockSummary {
  hash: string;
  height: bigint;
  parentHash: string;
  timestamp: bigint;
  txCount: number;
  stateRoot: string;
}

/** Full block with transactions */
export interface BlockWithTxs {
  header: {
    version: number;
    height: bigint;
    parentHash: string;
    timestamp: bigint;
    txRoot: string;
    effectsRoot: string;
    stateRoot: string;
    target: string;
    nonce: bigint;
  };
  transactions: TransactionInfo[];
  receipts?: ReceiptInfo[];
}

/** Transaction info */
export interface TransactionInfo {
  hash: string;
  version: number;
  from: string;
  nonce: bigint;
  blockHash?: string;
  blockHeight?: bigint;
  index?: number;
  status?: 'pending' | 'confirmed' | 'failed';
  // v2F fields
  maxGas?: bigint;
  gasPrice?: bigint;
  feePayer?: string;
  paymaster?: string;
}

/** Receipt info */
export interface ReceiptInfo {
  txHash: string;
  blockHash: string;
  blockHeight: bigint;
  index: number;
  success: boolean;
  gasUsed: Gas;
  logs: string[];
  error?: string;
}

/** Account state */
export interface AccountInfo {
  address: string;
  balance: Balance;
  nonce: bigint;
  codeHash?: string;
  storageRoot?: string;
}

/** Mempool entry */
export interface MempoolEntry {
  txHash: string;
  from: string;
  receivedAt: number;
  sizeBytes: number;
  gasPrice?: bigint;
}

/** Gas estimation result */
export interface GasEstimate {
  gasLimit: Gas;
  gasPrice: Gas;
  maxFee: Balance;
  breakdown?: {
    base: Gas;
    perByte: Gas;
    instructions: Gas;
  };
}

// ============================================
// Enhanced RPC Types
// ============================================

/** Search filters */
export interface SearchFilters {
  address?: string;
  fromHeight?: bigint;
  toHeight?: bigint;
  fromTime?: bigint;
  toTime?: bigint;
  status?: 'pending' | 'confirmed' | 'failed';
  minValue?: bigint;
  maxValue?: bigint;
}

/** Chain stats */
export interface ChainStats {
  latestHeight: bigint;
  latestBlockHash: string;
  totalTxs: bigint;
  totalAccounts: number;
  avgBlockTime: number;
  tps: number;
  gasPrice: {
    min: Gas;
    median: Gas;
    max: Gas;
  };
}

/** Paymaster info */
export interface PaymasterInfo {
  address: string;
  balance: Balance;
  totalSponsored: Balance;
  activeVouchers: number;
  policies: PaymasterPolicy[];
}

/** Paymaster policy */
export interface PaymasterPolicy {
  id: string;
  maxGasPerTx: Gas;
  maxTotalGas: Gas;
  allowedSenders?: string[];
  allowedContracts?: string[];
  expiresAt?: bigint;
}

// ============================================
// Paymaster Types
// ============================================

/** Voucher for intrinsic sponsorship */
export interface Voucher {
  /** Unique voucher ID */
  id: string;
  /** Paymaster address */
  paymaster: string;
  /** Beneficiary address */
  beneficiary: string;
  /** Maximum gas covered */
  maxGas: Gas;
  /** Gas used so far */
  usedGas: Gas;
  /** Expiration block height */
  expiresAt: bigint;
  /** Single use only */
  singleUse: boolean;
  /** Is voucher active */
  active: boolean;
  /** Creation timestamp */
  createdAt: bigint;
}

/** Voucher creation params */
export interface CreateVoucherParams {
  beneficiary: string;
  maxGas: Gas;
  expiresAt?: bigint;
  singleUse?: boolean;
}

/** Paymaster validation result */
export interface PaymasterValidation {
  valid: boolean;
  voucher?: Voucher;
  reason?: string;
}

/** Paymaster config */
export interface PaymasterConfig {
  /** Enable paymaster system */
  enabled: boolean;
  /** Maximum gas per voucher */
  maxGasPerVoucher: Gas;
  /** Maximum vouchers per paymaster */
  maxVouchersPerPaymaster: number;
  /** Default voucher expiry (blocks) */
  defaultExpiryBlocks: bigint;
}

export const DEFAULT_PAYMASTER_CONFIG: PaymasterConfig = {
  enabled: false,
  maxGasPerVoucher: 1_000_000n,
  maxVouchersPerPaymaster: 1000,
  defaultExpiryBlocks: 10000n,
};

// ============================================
// RPC Service Interface
// ============================================

export interface SimpleRPCService {
  // Block queries
  getBlock(hashOrHeight: string | bigint): Promise<RPCResponse<BlockWithTxs>>;
  getLatestBlock(): Promise<RPCResponse<BlockSummary>>;
  getBlocks(pagination?: Pagination): Promise<RPCResponse<PaginatedResult<BlockSummary>>>;

  // Transaction queries
  getTransaction(hash: string): Promise<RPCResponse<TransactionInfo>>;
  getReceipt(hash: string): Promise<RPCResponse<ReceiptInfo>>;

  // Account queries
  getAccount(address: string): Promise<RPCResponse<AccountInfo>>;
  getNonce(address: string): Promise<RPCResponse<bigint>>;
  getBalance(address: string): Promise<RPCResponse<Balance>>;

  // Mempool queries
  getMempoolTx(hash: string): Promise<RPCResponse<MempoolEntry>>;
  getMempoolStats(): Promise<RPCResponse<{ count: number; bytes: number }>>;

  // Gas estimation
  estimateGas(tx: unknown): Promise<RPCResponse<GasEstimate>>;
}

export interface EnhancedRPCService extends SimpleRPCService {
  // Search
  searchTransactions(filters: SearchFilters, pagination?: Pagination): Promise<RPCResponse<PaginatedResult<TransactionInfo>>>;
  getAccountTransactions(address: string, pagination?: Pagination): Promise<RPCResponse<PaginatedResult<TransactionInfo>>>;

  // Stats
  getChainStats(): Promise<RPCResponse<ChainStats>>;
  getGasPrice(): Promise<RPCResponse<{ min: Gas; median: Gas; max: Gas }>>;

  // Paymaster
  getPaymasterInfo(address: string): Promise<RPCResponse<PaymasterInfo>>;
  getVoucher(id: string): Promise<RPCResponse<Voucher>>;
  validatePaymaster(txHash: string, paymaster: string): Promise<RPCResponse<PaymasterValidation>>;
}
