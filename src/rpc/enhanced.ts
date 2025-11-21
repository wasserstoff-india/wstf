/**
 * Enhanced RPC Service - Extended queries with search and stats
 */
import { SimpleRPC } from './simple';
import {
  EnhancedRPCService,
  RPCResponse,
  BlockWithTxs,
  BlockSummary,
  TransactionInfo,
  ReceiptInfo,
  AccountInfo,
  MempoolEntry,
  GasEstimate,
  Pagination,
  PaginatedResult,
  SearchFilters,
  ChainStats,
  PaymasterInfo,
  PaymasterValidation,
  Voucher,
} from './types';
import { Balance, Gas } from '../economics/types';

// ============================================
// Enhanced RPC Implementation
// ============================================

export class EnhancedRPC extends SimpleRPC implements EnhancedRPCService {
  private txByAddress: Map<string, Set<string>>; // address -> txHashes
  private chainStatsCache: ChainStats | null;
  private statsUpdateTime: number;
  private blockTimes: number[]; // Recent block intervals for avg calculation
  private paymasters: Map<string, PaymasterInfo>;
  private vouchers: Map<string, Voucher>;

  constructor() {
    super();
    this.txByAddress = new Map();
    this.chainStatsCache = null;
    this.statsUpdateTime = 0;
    this.blockTimes = [];
    this.paymasters = new Map();
    this.vouchers = new Map();
  }

  /**
   * Override indexBlock to also index by address
   */
  override indexBlock(block: BlockWithTxs, hash: string): void {
    super.indexBlock(block, hash);

    // Index transactions by address
    for (const tx of block.transactions) {
      // Index by sender
      const fromTxs = this.txByAddress.get(tx.from) ?? new Set();
      fromTxs.add(tx.hash);
      this.txByAddress.set(tx.from, fromTxs);

      // Index by fee payer if different
      if (tx.feePayer && tx.feePayer !== tx.from) {
        const payerTxs = this.txByAddress.get(tx.feePayer) ?? new Set();
        payerTxs.add(tx.hash);
        this.txByAddress.set(tx.feePayer, payerTxs);
      }
    }

    // Track block time for stats
    if (this.blockTimes.length > 0) {
      const lastTime = this.blockTimes[this.blockTimes.length - 1];
      const interval = Number(block.header.timestamp) - lastTime;
      this.blockTimes.push(interval);
      if (this.blockTimes.length > 100) {
        this.blockTimes.shift();
      }
    } else {
      this.blockTimes.push(Number(block.header.timestamp));
    }

    // Invalidate stats cache
    this.statsUpdateTime = 0;
  }

  // ============================================
  // Search
  // ============================================

  async searchTransactions(
    filters: SearchFilters,
    pagination?: Pagination
  ): Promise<RPCResponse<PaginatedResult<TransactionInfo>>> {
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 20;

    // Get candidate transactions
    let candidates: TransactionInfo[] = [];

    if (filters.address) {
      // Filter by address
      const txHashes = this.txByAddress.get(filters.address);
      if (txHashes) {
        for (const hash of txHashes) {
          const result = await this.getTransaction(hash);
          if (result.ok && result.data) {
            candidates.push(result.data);
          }
        }
      }
    } else {
      // No address filter - need to scan (expensive)
      // In production, this would use RocksDB prefix iteration
      return {
        ok: false,
        error: { code: 'FILTER_REQUIRED', message: 'Address filter required for search' },
      };
    }

    // Apply additional filters
    if (filters.fromHeight !== undefined) {
      candidates = candidates.filter(tx => tx.blockHeight !== undefined && tx.blockHeight >= filters.fromHeight!);
    }
    if (filters.toHeight !== undefined) {
      candidates = candidates.filter(tx => tx.blockHeight !== undefined && tx.blockHeight <= filters.toHeight!);
    }
    if (filters.status) {
      candidates = candidates.filter(tx => tx.status === filters.status);
    }

    // Sort by block height descending
    candidates.sort((a, b) => {
      const ha = a.blockHeight ?? 0n;
      const hb = b.blockHeight ?? 0n;
      return Number(hb - ha);
    });

    // Apply pagination
    const total = candidates.length;
    const items = candidates.slice(offset, offset + limit);

    return {
      ok: true,
      data: {
        items,
        total,
        offset,
        limit,
        hasMore: offset + items.length < total,
      },
    };
  }

  async getAccountTransactions(
    address: string,
    pagination?: Pagination
  ): Promise<RPCResponse<PaginatedResult<TransactionInfo>>> {
    return this.searchTransactions({ address }, pagination);
  }

  // ============================================
  // Stats
  // ============================================

  async getChainStats(): Promise<RPCResponse<ChainStats>> {
    const now = Date.now();
    const CACHE_TTL = 5000; // 5 seconds

    // Return cached if fresh
    if (this.chainStatsCache && now - this.statsUpdateTime < CACHE_TTL) {
      return { ok: true, data: this.chainStatsCache };
    }

    // Get latest block
    const latestResult = await this.getLatestBlock();
    if (!latestResult.ok || !latestResult.data) {
      return {
        ok: true,
        data: {
          latestHeight: 0n,
          latestBlockHash: '0'.repeat(64),
          totalTxs: 0n,
          totalAccounts: 0,
          avgBlockTime: 0,
          tps: 0,
          gasPrice: { min: 1n, median: 1n, max: 1n },
        },
      };
    }

    const latest = latestResult.data;

    // Calculate average block time
    const avgBlockTime = this.blockTimes.length > 1
      ? this.blockTimes.slice(1).reduce((a, b) => a + b, 0) / (this.blockTimes.length - 1)
      : 2; // Default 2 seconds

    // Calculate TPS (rough estimate)
    const tps = avgBlockTime > 0 ? latest.txCount / avgBlockTime : 0;

    // Count unique addresses
    const totalAccounts = this.txByAddress.size;

    // Estimate total txs (sum of all indexed)
    let totalTxs = 0n;
    for (const txSet of this.txByAddress.values()) {
      totalTxs += BigInt(txSet.size);
    }
    // Deduplicate (rough - in production would have exact count)
    totalTxs = totalTxs / 2n; // Approximate

    const stats: ChainStats = {
      latestHeight: latest.height,
      latestBlockHash: latest.hash,
      totalTxs,
      totalAccounts,
      avgBlockTime,
      tps,
      gasPrice: { min: 1n, median: 1n, max: 10n }, // Placeholder
    };

    this.chainStatsCache = stats;
    this.statsUpdateTime = now;

    return { ok: true, data: stats };
  }

  async getGasPrice(): Promise<RPCResponse<{ min: Gas; median: Gas; max: Gas }>> {
    // In production, would analyze recent blocks
    return {
      ok: true,
      data: {
        min: 1n,
        median: 1n,
        max: 10n,
      },
    };
  }

  // ============================================
  // Paymaster
  // ============================================

  /**
   * Register a paymaster
   */
  registerPaymaster(info: PaymasterInfo): void {
    this.paymasters.set(info.address, info);
  }

  /**
   * Register a voucher
   */
  registerVoucher(voucher: Voucher): void {
    this.vouchers.set(voucher.id, voucher);
  }

  async getPaymasterInfo(address: string): Promise<RPCResponse<PaymasterInfo>> {
    const info = this.paymasters.get(address);
    if (!info) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Paymaster ${address} not found` },
      };
    }
    return { ok: true, data: info };
  }

  async getVoucher(id: string): Promise<RPCResponse<Voucher>> {
    const voucher = this.vouchers.get(id);
    if (!voucher) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Voucher ${id} not found` },
      };
    }
    return { ok: true, data: voucher };
  }

  async validatePaymaster(
    txHash: string,
    paymasterAddress: string
  ): Promise<RPCResponse<PaymasterValidation>> {
    // Get the transaction
    const txResult = await this.getTransaction(txHash);
    if (!txResult.ok || !txResult.data) {
      return {
        ok: true,
        data: { valid: false, reason: 'Transaction not found' },
      };
    }

    const tx = txResult.data;

    // Check if paymaster exists
    const paymaster = this.paymasters.get(paymasterAddress);
    if (!paymaster) {
      return {
        ok: true,
        data: { valid: false, reason: 'Paymaster not registered' },
      };
    }

    // Find valid voucher for this sender
    let validVoucher: Voucher | undefined;
    for (const voucher of this.vouchers.values()) {
      if (
        voucher.paymaster === paymasterAddress &&
        voucher.beneficiary === tx.from &&
        voucher.active &&
        voucher.usedGas < voucher.maxGas
      ) {
        validVoucher = voucher;
        break;
      }
    }

    if (!validVoucher) {
      return {
        ok: true,
        data: { valid: false, reason: 'No valid voucher for sender' },
      };
    }

    // Check gas limit
    const txGas = tx.maxGas ?? 0n;
    const remainingGas = validVoucher.maxGas - validVoucher.usedGas;
    if (txGas > remainingGas) {
      return {
        ok: true,
        data: {
          valid: false,
          voucher: validVoucher,
          reason: `Insufficient voucher gas: needs ${txGas}, has ${remainingGas}`,
        },
      };
    }

    return {
      ok: true,
      data: { valid: true, voucher: validVoucher },
    };
  }
}

/**
 * Create a new EnhancedRPC instance
 */
export function createEnhancedRPC(): EnhancedRPC {
  return new EnhancedRPC();
}
