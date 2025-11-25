/**
 * Frontend RPC Client
 *
 * Browser-compatible HTTP client for interacting with WSTF Chain services.
 */

import type {
  FrontendConfig,
  RpcResponse,
  AccountInfo,
  TokenBalance,
  BlockInfo,
  TransactionInfo,
  OrderbookSnapshot,
  TradeInfo,
} from './types';

// ============================================================
// Client Class
// ============================================================

export class WstfClient {
  private config: FrontendConfig;
  private abortController: AbortController | null = null;

  constructor(config: FrontendConfig) {
    this.config = config;
  }

  // ============================================================
  // Configuration
  // ============================================================

  getConfig(): FrontendConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<FrontendConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================
  // Account Methods
  // ============================================================

  /**
   * Get account information by address
   */
  async getAccount(address: string): Promise<RpcResponse<AccountInfo>> {
    return this.get<AccountInfo>(`${this.config.explorerUrl}/account/${address}`);
  }

  /**
   * Get account by username
   */
  async getAccountByUsername(username: string): Promise<RpcResponse<AccountInfo>> {
    const response = await this.get<{ address: string }>(`${this.config.explorerUrl}/username/${username}`);
    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'Username not found' };
    }
    return this.getAccount(response.data.address);
  }

  /**
   * Create a new account
   */
  async createAccount(options: {
    sigAlg: 'ed25519' | 'secp256k1';
    username?: string;
  }): Promise<RpcResponse<{ address: string; publicKeyBase64: string }>> {
    return this.post(`${this.config.accountsUrl}/accounts`, options);
  }

  /**
   * Get token balances for an address
   * NOTE: Current backend doesn't have separate balance endpoint - returns account info
   */
  async getBalances(address: string): Promise<RpcResponse<TokenBalance[]>> {
    const accountResponse = await this.get<any>(`${this.config.explorerUrl}/account/${address}`);
    if (!accountResponse.success || !accountResponse.data) {
      return accountResponse as RpcResponse<TokenBalance[]>;
    }

    // For now, return empty balances array since WSTF backend doesn't have token balances yet
    // In the future, this would parse actual token data from the account
    return {
      success: true,
      data: []
    };
  }

  /**
   * Get specific token balance
   */
  async getBalance(address: string, tokenId: string): Promise<RpcResponse<TokenBalance>> {
    return this.get<TokenBalance>(`${this.config.explorerUrl}/account/${address}/balance/${tokenId}`);
  }

  // ============================================================
  // Explorer Methods
  // ============================================================

  /**
   * Get latest blocks
   */
  async getLatestBlocks(limit: number = 10): Promise<RpcResponse<BlockInfo[]>> {
    return this.get<BlockInfo[]>(`${this.config.explorerUrl}/blocks?limit=${limit}`);
  }

  /**
   * Get block by height
   */
  async getBlock(height: bigint | number): Promise<RpcResponse<BlockInfo>> {
    return this.get<BlockInfo>(`${this.config.explorerUrl}/block/${height}`);
  }

  /**
   * Get block by hash
   */
  async getBlockByHash(hash: string): Promise<RpcResponse<BlockInfo>> {
    return this.get<BlockInfo>(`${this.config.explorerUrl}/block/hash/${hash}`);
  }

  /**
   * Get latest transactions
   */
  async getLatestTransactions(limit: number = 10): Promise<RpcResponse<TransactionInfo[]>> {
    return this.get<TransactionInfo[]>(`${this.config.explorerUrl}/transactions?limit=${limit}`);
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(txId: string): Promise<RpcResponse<TransactionInfo>> {
    return this.get<TransactionInfo>(`${this.config.explorerUrl}/transaction/${txId}`);
  }

  /**
   * Get transactions for an address
   */
  async getAccountTransactions(
    address: string,
    options?: { limit?: number; offset?: number }
  ): Promise<RpcResponse<TransactionInfo[]>> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString() ? `?${params}` : '';
    return this.get<TransactionInfo[]>(`${this.config.explorerUrl}/account/${address}/transactions${query}`);
  }

  // ============================================================
  // Market Methods
  // ============================================================

  /**
   * Get orderbook snapshot
   */
  async getOrderbook(marketId: string, depth: number = 20): Promise<RpcResponse<OrderbookSnapshot>> {
    return this.get<OrderbookSnapshot>(`${this.config.rpcUrl}/markets/${marketId}/orderbook?depth=${depth}`);
  }

  /**
   * Get recent trades
   */
  async getTrades(marketId: string, limit: number = 50): Promise<RpcResponse<TradeInfo[]>> {
    return this.get<TradeInfo[]>(`${this.config.rpcUrl}/markets/${marketId}/trades?limit=${limit}`);
  }

  /**
   * Get market info
   */
  async getMarket(marketId: string): Promise<RpcResponse<{
    marketId: string;
    baseToken: string;
    quoteToken: string;
    status: string;
    lastPrice?: bigint;
    volume24h?: bigint;
  }>> {
    return this.get(`${this.config.rpcUrl}/markets/${marketId}`);
  }

  /**
   * List all markets
   * NOTE: Markets endpoint not implemented in backend yet - returning mock data
   */
  async listMarkets(): Promise<RpcResponse<Array<{
    marketId: string;
    baseToken: string;
    quoteToken: string;
    status: string;
  }>>> {
    // Return mock markets data since backend doesn't implement markets yet
    return {
      success: true,
      data: [
        {
          marketId: 'WSTF/USDC',
          baseToken: 'WSTF',
          quoteToken: 'USDC',
          status: 'active'
        },
        {
          marketId: 'ETH/USDC',
          baseToken: 'ETH',
          quoteToken: 'USDC',
          status: 'active'
        }
      ]
    };
  }

  // ============================================================
  // Transaction Methods
  // ============================================================

  /**
   * Submit a signed transaction
   */
  async submitTransaction(txHex: string): Promise<RpcResponse<{ txId: string }>> {
    return this.post(`${this.config.rpcUrl}/tx/submit`, { tx: txHex });
  }

  /**
   * Simulate a transaction (dry run)
   */
  async simulateTransaction(txHex: string): Promise<RpcResponse<{
    success: boolean;
    gasUsed: bigint;
    logs: string[];
    error?: string;
  }>> {
    return this.post(`${this.config.rpcUrl}/tx/simulate`, { tx: txHex });
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Decode an address
   */
  async decodeAddress(address: string): Promise<RpcResponse<{
    mappingAlgId: number;
    sigAlgId: number;
    pkHashHex: string;
  }>> {
    return this.get(`${this.config.accountsUrl}/addresses/${address}/decode`);
  }

  /**
   * Get chain status
   */
  async getChainStatus(): Promise<RpcResponse<{
    chainId: string;
    latestBlock: bigint;
    latestBlockHash: string;
    nodeVersion: string;
  }>> {
    return this.get(`${this.config.rpcUrl}/status`);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.get<{ status: string }>(`${this.config.rpcUrl}/health`);
      return response.success && response.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // ============================================================
  // HTTP Helpers
  // ============================================================

  private async get<T>(url: string): Promise<RpcResponse<T>> {
    return this.request<T>(url, { method: 'GET' });
  }

  private async post<T>(url: string, body: unknown): Promise<RpcResponse<T>> {
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, options: RequestInit): Promise<RpcResponse<T>> {
    try {
      this.abortController = new AbortController();
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
          code: `HTTP_${response.status}`,
        };
      }

      const data = await response.json();

      // Handle both direct data and wrapped responses
      if (data && typeof data === 'object' && 'success' in data) {
        return data as RpcResponse<T>;
      }

      return { success: true, data: data as T };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, error: 'Request cancelled', code: 'CANCELLED' };
        }
        return { success: false, error: error.message, code: 'NETWORK_ERROR' };
      }
      return { success: false, error: 'Unknown error', code: 'UNKNOWN' };
    }
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new WSTF client instance
 */
export function createClient(config: FrontendConfig): WstfClient {
  return new WstfClient(config);
}
