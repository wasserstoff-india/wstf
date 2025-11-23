/**
 * RPC Types - Simple and Enhanced RPC surfaces
 */
import { Gas, Balance } from '../economics/types';
export declare const QUERY_PREFIXES: {
    readonly BLOCK_HEIGHT: "blk:h:";
    readonly BLOCK_HASH: "blk:id:";
    readonly TX_HASH: "tx:id:";
    readonly RECEIPT: "rcpt:";
    readonly ACCOUNT: "acct:";
    readonly ACCOUNT_TXS: "acct:tx:";
    readonly STATE: "state:";
};
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
export declare const DEFAULT_PAYMASTER_CONFIG: PaymasterConfig;
export interface SimpleRPCService {
    getBlock(hashOrHeight: string | bigint): Promise<RPCResponse<BlockWithTxs>>;
    getLatestBlock(): Promise<RPCResponse<BlockSummary>>;
    getBlocks(pagination?: Pagination): Promise<RPCResponse<PaginatedResult<BlockSummary>>>;
    getTransaction(hash: string): Promise<RPCResponse<TransactionInfo>>;
    getReceipt(hash: string): Promise<RPCResponse<ReceiptInfo>>;
    getAccount(address: string): Promise<RPCResponse<AccountInfo>>;
    getNonce(address: string): Promise<RPCResponse<bigint>>;
    getBalance(address: string): Promise<RPCResponse<Balance>>;
    getMempoolTx(hash: string): Promise<RPCResponse<MempoolEntry>>;
    getMempoolStats(): Promise<RPCResponse<{
        count: number;
        bytes: number;
    }>>;
    estimateGas(tx: unknown): Promise<RPCResponse<GasEstimate>>;
}
export interface EnhancedRPCService extends SimpleRPCService {
    searchTransactions(filters: SearchFilters, pagination?: Pagination): Promise<RPCResponse<PaginatedResult<TransactionInfo>>>;
    getAccountTransactions(address: string, pagination?: Pagination): Promise<RPCResponse<PaginatedResult<TransactionInfo>>>;
    getChainStats(): Promise<RPCResponse<ChainStats>>;
    getGasPrice(): Promise<RPCResponse<{
        min: Gas;
        median: Gas;
        max: Gas;
    }>>;
    getPaymasterInfo(address: string): Promise<RPCResponse<PaymasterInfo>>;
    getVoucher(id: string): Promise<RPCResponse<Voucher>>;
    validatePaymaster(txHash: string, paymaster: string): Promise<RPCResponse<PaymasterValidation>>;
}
//# sourceMappingURL=types.d.ts.map