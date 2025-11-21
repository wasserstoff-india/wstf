/**
 * Simple RPC Service - Basic blockchain queries
 */
import {
  SimpleRPCService,
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
} from './types';
import { Balance, Gas } from '../economics/types';
import { estimateGas, GasInput } from '../economics/meter';

// ============================================
// In-memory stores (will be replaced by RocksDB)
// ============================================

interface BlockStore {
  byHash: Map<string, BlockWithTxs>;
  byHeight: Map<bigint, string>; // height -> hash
  latest: BlockSummary | null;
}

interface TxStore {
  byHash: Map<string, TransactionInfo>;
  receipts: Map<string, ReceiptInfo>;
}

interface AccountStore {
  accounts: Map<string, AccountInfo>;
}

interface MempoolRef {
  get(hash: string): MempoolEntry | undefined;
  getStats(): { count: number; bytes: number };
}

// ============================================
// Simple RPC Implementation
// ============================================

export class SimpleRPC implements SimpleRPCService {
  private blocks: BlockStore;
  private txs: TxStore;
  private accountStore: AccountStore;
  private mempool: MempoolRef | null;

  constructor() {
    this.blocks = {
      byHash: new Map(),
      byHeight: new Map(),
      latest: null,
    };
    this.txs = {
      byHash: new Map(),
      receipts: new Map(),
    };
    this.accountStore = {
      accounts: new Map(),
    };
    this.mempool = null;
  }

  /**
   * Wire external mempool reference
   */
  setMempool(mempool: MempoolRef): void {
    this.mempool = mempool;
  }

  /**
   * Index a block (called when block is committed)
   */
  indexBlock(block: BlockWithTxs, hash: string): void {
    this.blocks.byHash.set(hash, block);
    this.blocks.byHeight.set(block.header.height, hash);
    this.blocks.latest = {
      hash,
      height: block.header.height,
      parentHash: block.header.parentHash,
      timestamp: block.header.timestamp,
      txCount: block.transactions.length,
      stateRoot: block.header.stateRoot,
    };

    // Index transactions
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      this.txs.byHash.set(tx.hash, {
        ...tx,
        blockHash: hash,
        blockHeight: block.header.height,
        index: i,
        status: 'confirmed',
      });
    }

    // Index receipts
    if (block.receipts) {
      for (const receipt of block.receipts) {
        this.txs.receipts.set(receipt.txHash, receipt);
      }
    }
  }

  /**
   * Update account state
   */
  updateAccount(account: AccountInfo): void {
    this.accountStore.accounts.set(account.address, account);
  }

  // ============================================
  // Block Queries
  // ============================================

  async getBlock(hashOrHeight: string | bigint): Promise<RPCResponse<BlockWithTxs>> {
    let hash: string;

    if (typeof hashOrHeight === 'bigint') {
      const h = this.blocks.byHeight.get(hashOrHeight);
      if (!h) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Block at height ${hashOrHeight} not found` } };
      }
      hash = h;
    } else {
      hash = hashOrHeight;
    }

    const block = this.blocks.byHash.get(hash);
    if (!block) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Block ${hash} not found` } };
    }

    return { ok: true, data: block };
  }

  async getLatestBlock(): Promise<RPCResponse<BlockSummary>> {
    if (!this.blocks.latest) {
      return { ok: false, error: { code: 'NO_BLOCKS', message: 'No blocks indexed yet' } };
    }
    return { ok: true, data: this.blocks.latest };
  }

  async getBlocks(pagination?: Pagination): Promise<RPCResponse<PaginatedResult<BlockSummary>>> {
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 20;

    if (!this.blocks.latest) {
      return {
        ok: true,
        data: { items: [], total: 0, offset, limit, hasMore: false },
      };
    }

    const items: BlockSummary[] = [];
    let height = this.blocks.latest.height - BigInt(offset);
    let count = 0;

    while (height >= 0n && count < limit) {
      const hash = this.blocks.byHeight.get(height);
      if (hash) {
        const block = this.blocks.byHash.get(hash);
        if (block) {
          items.push({
            hash,
            height: block.header.height,
            parentHash: block.header.parentHash,
            timestamp: block.header.timestamp,
            txCount: block.transactions.length,
            stateRoot: block.header.stateRoot,
          });
        }
      }
      height--;
      count++;
    }

    const total = Number(this.blocks.latest.height) + 1;
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

  // ============================================
  // Transaction Queries
  // ============================================

  async getTransaction(hash: string): Promise<RPCResponse<TransactionInfo>> {
    const tx = this.txs.byHash.get(hash);
    if (!tx) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Transaction ${hash} not found` } };
    }
    return { ok: true, data: tx };
  }

  async getReceipt(hash: string): Promise<RPCResponse<ReceiptInfo>> {
    const receipt = this.txs.receipts.get(hash);
    if (!receipt) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Receipt for ${hash} not found` } };
    }
    return { ok: true, data: receipt };
  }

  // ============================================
  // Account Queries
  // ============================================

  async getAccount(address: string): Promise<RPCResponse<AccountInfo>> {
    const account = this.accountStore.accounts.get(address);
    if (!account) {
      // Return default account for unknown addresses
      return {
        ok: true,
        data: {
          address,
          balance: 0n,
          nonce: 0n,
        },
      };
    }
    return { ok: true, data: account };
  }

  async getNonce(address: string): Promise<RPCResponse<bigint>> {
    const result = await this.getAccount(address);
    if (!result.ok || !result.data) {
      return { ok: true, data: 0n };
    }
    return { ok: true, data: result.data.nonce };
  }

  async getBalance(address: string): Promise<RPCResponse<Balance>> {
    const result = await this.getAccount(address);
    if (!result.ok || !result.data) {
      return { ok: true, data: 0n };
    }
    return { ok: true, data: result.data.balance };
  }

  // ============================================
  // Mempool Queries
  // ============================================

  async getMempoolTx(hash: string): Promise<RPCResponse<MempoolEntry>> {
    if (!this.mempool) {
      return { ok: false, error: { code: 'NO_MEMPOOL', message: 'Mempool not connected' } };
    }

    const entry = this.mempool.get(hash);
    if (!entry) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Transaction ${hash} not in mempool` } };
    }

    return { ok: true, data: entry };
  }

  async getMempoolStats(): Promise<RPCResponse<{ count: number; bytes: number }>> {
    if (!this.mempool) {
      return { ok: false, error: { code: 'NO_MEMPOOL', message: 'Mempool not connected' } };
    }

    return { ok: true, data: this.mempool.getStats() };
  }

  // ============================================
  // Gas Estimation
  // ============================================

  async estimateGas(tx: unknown): Promise<RPCResponse<GasEstimate>> {
    try {
      const gasInput: GasInput = {};

      // Extract program hex if present
      if (tx && typeof tx === 'object' && 'program' in tx) {
        const program = (tx as { program?: Buffer | string }).program;
        if (Buffer.isBuffer(program)) {
          gasInput.programHex = '0x' + program.toString('hex');
        } else if (typeof program === 'string') {
          gasInput.programHex = program;
        }
      }

      const gasLimit = estimateGas(gasInput);
      const gasPrice = 1n; // Default min gas price
      const maxFee = gasLimit * gasPrice;

      return {
        ok: true,
        data: {
          gasLimit,
          gasPrice,
          maxFee,
          breakdown: {
            base: 500n,
            perByte: gasLimit - 500n,
            instructions: 0n,
          },
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'ESTIMATION_FAILED',
          message: err instanceof Error ? err.message : 'Gas estimation failed',
        },
      };
    }
  }
}

/**
 * Create a new SimpleRPC instance
 */
export function createSimpleRPC(): SimpleRPC {
  return new SimpleRPC();
}
