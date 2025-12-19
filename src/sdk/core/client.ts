/**
 * SDK RPC Client
 *
 * Wraps the internal RPC layer for SDK consumers.
 * Provides typed access to chain queries and transaction submission.
 */

import {
  Address,
  Hex32,
  TokenId,
  MarketId,
  OrderId,
  GridId,
  TrustTier,
  SdkResult,
  TxReceipt,
  TxEvent,
  WaitOptions,
  Balance,
  TokenMeta,
  MarketInfo,
  OrderView,
  TopOfBook,
  OrderbookView,
  LPGridView,
  TradeView,
  MarketStatus,
  Side,
  OrderStatus,
  OrderFlag,
} from './types';

// Re-export internal types we depend on
import type {
  SimpleRPCService,
  RPCResponse,
  BlockSummary,
  TransactionInfo,
  AccountInfo,
  GasEstimate,
} from '../../../src/rpc/types';

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * SDK client configuration.
 */
export interface ClientConfig {
  /** RPC endpoint URL (or in-memory RPC instance for testing) */
  rpc: string | SimpleRPCService;
  /** Signer instance */
  signer?: any;
  /** Default timeout for RPC calls in milliseconds */
  timeoutMs?: number;
  /** Default trust tier to wait for */
  defaultTrustTier?: TrustTier;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
}

/**
 * Default client configuration.
 */
export const DEFAULT_CLIENT_CONFIG: Required<Omit<ClientConfig, 'rpc' | 'signer'>> = {
  timeoutMs: 30000,
  defaultTrustTier: TrustTier.INCLUDED,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
  },
};

// ============================================================================
// RPC Client
// ============================================================================

/**
 * SDK RPC Client interface.
 */
export interface WSTFClient {
  rpc: string | SimpleRPCService;
  getCapabilities(): Promise<SdkResult<any>>;
  submitInstruction(instruction: any): Promise<string>;
  queryEvents(query: any): Promise<any[]>;
  getHeight(): Promise<SdkResult<bigint>>;
  getBlock(heightOrHash: bigint | Hex32): Promise<SdkResult<BlockSummary>>;
  getNonce(address: Address): Promise<SdkResult<bigint>>;
  getNativeBalance(address: Address): Promise<SdkResult<bigint>>;
  getAccount(address: Address): Promise<SdkResult<AccountInfo>>;
  estimateGas(tx: unknown): Promise<SdkResult<GasEstimate>>;
  getTransaction(txHash: Hex32): Promise<SdkResult<TransactionInfo>>;
  getReceipt(txHash: Hex32): Promise<SdkResult<TxReceipt>>;
  waitForTx(txHash: Hex32, options?: WaitOptions): Promise<SdkResult<TxReceipt>>;
}

/**
 * SDK RPC Client.
 *
 * Provides typed access to chain state and transaction submission.
 */
export class RpcClient implements WSTFClient {
  private config: Required<ClientConfig>;
  private rpcService: SimpleRPCService | null = null;

  constructor(config: ClientConfig) {
    this.config = {
      ...DEFAULT_CLIENT_CONFIG,
      ...config,
    } as Required<ClientConfig>;

    // If an in-memory RPC service is provided, use it directly
    if (typeof config.rpc !== 'string') {
      this.rpcService = config.rpc;
    }
  }

  /**
   * Get the RPC URL or instance.
   */
  get rpc(): string | SimpleRPCService {
    return this.config.rpc;
  }

  // ==========================================================================
  // Chain State Queries
  // ==========================================================================

  /**
   * Get service capabilities.
   */
  async getCapabilities(): Promise<SdkResult<any>> {
    const rpc = await this.getRpc();
    // This is a special endpoint often available on WSTF services
    const baseURL = typeof this.config.rpc === 'string'
      ? this.config.rpc.replace(/\/+$/, '')
      : (rpc as any).baseURL || '';

    const response = await fetch(`${baseURL}/capabilities`);
    if (!response.ok) {
      return { success: false, error: 'Failed to fetch capabilities' };
    }
    const data = await response.json();
    return { success: true, data };
  }

  /**
   * Submit an instruction to the chain.
   */
  async submitInstruction(instruction: any): Promise<string> {
    const rpc = await this.getRpc();
    const result = await (rpc as any).submitInstruction(instruction);
    if (!result.ok || !result.data) {
      throw new Error(result.error?.message || 'Failed to submit instruction');
    }
    return result.data;
  }

  /**
   * Query events from the chain.
   */
  async queryEvents(query: any): Promise<any[]> {
    const rpc = await this.getRpc();
    const result = await (rpc as any).getLogs(query);
    if (!result.ok || !result.data) {
      return [];
    }
    return result.data;
  }

  /**
   * Get current chain height.
   */
  async getHeight(): Promise<SdkResult<bigint>> {
    const rpc = await this.getRpc();
    const result = await rpc.getLatestBlock();

    if (!result.ok || !result.data) {
      return {
        success: false,
        error: result.error?.message || 'Failed to get chain height',
        code: result.error?.code,
      };
    }

    return { success: true, data: result.data.height };
  }

  /**
   * Get block by height or hash.
   */
  async getBlock(heightOrHash: bigint | Hex32): Promise<SdkResult<BlockSummary>> {
    const rpc = await this.getRpc();
    const result = await rpc.getBlock(heightOrHash);

    if (!result.ok || !result.data) {
      return {
        success: false,
        error: result.error?.message || 'Block not found',
        code: result.error?.code,
      };
    }

    const block = result.data;
    return {
      success: true,
      data: {
        hash: block.header.stateRoot, // Using stateRoot as hash placeholder
        height: block.header.height,
        parentHash: block.header.parentHash,
        timestamp: block.header.timestamp,
        txCount: block.transactions.length,
        stateRoot: block.header.stateRoot,
      },
    };
  }

  /**
   * Get account nonce.
   */
  async getNonce(address: Address): Promise<SdkResult<bigint>> {
    const rpc = await this.getRpc();
    const result = await rpc.getNonce(address);

    if (!result.ok) {
      return {
        success: false,
        error: result.error?.message || 'Failed to get nonce',
        code: result.error?.code,
      };
    }

    return { success: true, data: result.data ?? 0n };
  }

  /**
   * Get native token balance.
   */
  async getNativeBalance(address: Address): Promise<SdkResult<bigint>> {
    const rpc = await this.getRpc();
    const result = await rpc.getBalance(address);

    if (!result.ok) {
      return {
        success: false,
        error: result.error?.message || 'Failed to get balance',
        code: result.error?.code,
      };
    }

    return { success: true, data: result.data ?? 0n };
  }

  /**
   * Get full account info.
   */
  async getAccount(address: Address): Promise<SdkResult<AccountInfo>> {
    const rpc = await this.getRpc();
    const result = await rpc.getAccount(address);

    if (!result.ok || !result.data) {
      return {
        success: false,
        error: result.error?.message || 'Account not found',
        code: result.error?.code,
      };
    }

    return { success: true, data: result.data };
  }

  /**
   * Estimate gas for a transaction.
   */
  async estimateGas(tx: unknown): Promise<SdkResult<GasEstimate>> {
    const rpc = await this.getRpc();
    const result = await rpc.estimateGas(tx);

    if (!result.ok || !result.data) {
      return {
        success: false,
        error: result.error?.message || 'Gas estimation failed',
        code: result.error?.code,
      };
    }

    return { success: true, data: result.data };
  }

  // ==========================================================================
  // Transaction Queries
  // ==========================================================================

  /**
   * Get transaction by hash.
   */
  async getTransaction(txHash: Hex32): Promise<SdkResult<TransactionInfo>> {
    const rpc = await this.getRpc();
    const result = await rpc.getTransaction(txHash);

    if (!result.ok || !result.data) {
      return {
        success: false,
        error: result.error?.message || 'Transaction not found',
        code: result.error?.code,
      };
    }

    return { success: true, data: result.data };
  }

  /**
   * Get transaction receipt.
   */
  async getReceipt(txHash: Hex32): Promise<SdkResult<TxReceipt>> {
    const rpc = await this.getRpc();
    const result = await rpc.getReceipt(txHash);

    if (!result.ok || !result.data) {
      return {
        success: false,
        error: result.error?.message || 'Receipt not found',
        code: result.error?.code,
      };
    }

    const receipt = result.data;
    return {
      success: true,
      data: {
        txHash: receipt.txHash as Hex32,
        trustTier: TrustTier.INCLUDED, // Already in block
        height: receipt.blockHeight,
        blockHash: receipt.blockHash as Hex32,
        txIndex: receipt.index,
        gasUsed: receipt.gasUsed,
        success: receipt.success,
        error: receipt.error,
        events: receipt.logs.map((log) => ({
          type: 'log',
          data: { message: log },
        })),
      },
    };
  }

  /**
   * Wait for transaction to reach a trust tier.
   */
  async waitForTx(txHash: Hex32, options?: WaitOptions): Promise<SdkResult<TxReceipt>> {
    const minTrust = options?.minTrust ?? this.config.defaultTrustTier;
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const pollIntervalMs = options?.pollIntervalMs ?? 1000;

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.getReceipt(txHash);

      if (result.success && result.data) {
        if (result.data.trustTier >= minTrust) {
          return result;
        }
      }

      await this.sleep(pollIntervalMs);
    }

    return {
      success: false,
      error: `Timeout waiting for transaction ${txHash}`,
      code: 'TIMEOUT',
    };
  }

  // ==========================================================================
  // Token Queries (Program State)
  // ==========================================================================

  /**
   * Get token metadata.
   * Note: In production, this would call the tokens program.
   */
  async getTokenMeta(tokenId: TokenId): Promise<SdkResult<TokenMeta>> {
    // This would query the tokens program state
    // For now, return a placeholder that indicates the method exists
    return {
      success: false,
      error: 'Token queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get token balance for an address.
   */
  async getTokenBalance(tokenId: TokenId, address: Address): Promise<SdkResult<Balance>> {
    // This would query the tokens program state
    return {
      success: false,
      error: 'Token queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Market Queries (Program State)
  // ==========================================================================

  /**
   * Get market information.
   */
  async getMarket(marketId: MarketId): Promise<SdkResult<MarketInfo>> {
    // This would query the markets program state
    return {
      success: false,
      error: 'Market queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get top of book for a market.
   */
  async getTopOfBook(marketId: MarketId): Promise<SdkResult<TopOfBook>> {
    return {
      success: false,
      error: 'Market queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get orderbook snapshot.
   */
  async getOrderbook(marketId: MarketId, depth?: number): Promise<SdkResult<OrderbookView>> {
    return {
      success: false,
      error: 'Market queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get order by ID.
   */
  async getOrder(orderId: OrderId): Promise<SdkResult<OrderView>> {
    return {
      success: false,
      error: 'Market queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get orders for an address.
   */
  async getOrders(address: Address, marketId?: MarketId): Promise<SdkResult<OrderView[]>> {
    return {
      success: false,
      error: 'Market queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get LP grid by ID.
   */
  async getGrid(gridId: GridId): Promise<SdkResult<LPGridView>> {
    return {
      success: false,
      error: 'Market queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Get trades for a market.
   */
  async getTrades(
    marketId: MarketId,
    options?: { fromHeight?: bigint; limit?: number }
  ): Promise<SdkResult<TradeView[]>> {
    return {
      success: false,
      error: 'Market queries require program integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  // ==========================================================================
  // Transaction Submission
  // ==========================================================================

  /**
   * Submit a signed transaction.
   * Returns immediately with a receipt at PREFLIGHT tier.
   */
  async submitTx(signedTx: Uint8Array): Promise<SdkResult<TxReceipt>> {
    // In production, this would serialize and send to the mempool
    return {
      success: false,
      error: 'Transaction submission requires full node integration',
      code: 'NOT_IMPLEMENTED',
    };
  }

  /**
   * Submit and wait for transaction to be included.
   */
  async submitAndWait(
    signedTx: Uint8Array,
    options?: WaitOptions
  ): Promise<SdkResult<TxReceipt>> {
    const submitResult = await this.submitTx(signedTx);
    if (!submitResult.success || !submitResult.data) {
      return submitResult;
    }

    return this.waitForTx(submitResult.data.txHash, options);
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  /**
   * Get or create RPC service instance.
   */
  private async getRpc(): Promise<SimpleRPCService> {
    if (this.rpcService) {
      return this.rpcService;
    }

    // In production, this would create an HTTP/WebSocket client
    throw new Error('HTTP RPC client not implemented - use in-memory RPC for testing');
  }

  /**
   * Sleep helper for polling.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry helper with exponential backoff.
   */
  private async withRetry<T>(
    operation: () => Promise<SdkResult<T>>,
    context: string
  ): Promise<SdkResult<T>> {
    const { maxAttempts, baseDelayMs, maxDelayMs } = this.config.retry;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await operation();

      if (result.success) {
        return result;
      }

      // Extract error message for retry context
      lastError = typeof result.error === 'string' ? result.error : result.error?.message;

      // Don't retry on certain error codes
      if (result.code === 'NOT_FOUND' || result.code === 'INVALID_INPUT') {
        return result;
      }

      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: `${context} failed after ${maxAttempts} attempts: ${lastError}`,
      code: 'RETRY_EXHAUSTED',
    };
  }
}

/**
 * Create a new RPC client.
 */
export function createClient(config: ClientConfig): RpcClient {
  return new RpcClient(config);
}

/**
 * Create a client with in-memory RPC (for testing).
 */
export function createTestClient(rpcService: SimpleRPCService): RpcClient {
  return new RpcClient({ rpc: rpcService });
}
