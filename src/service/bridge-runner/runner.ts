/**
 * Bridge Runner Service
 *
 * Watches WSTFChain for BRIDGE_REQUEST events and executes cross-chain operations.
 * This is the off-chain component that handles actual EVM interactions.
 */

import { EventEmitter } from 'events';
import {
  BridgeRequest,
  BridgeResult,
  BridgeStatus,
  ChainId,
  BRIDGE_CONFIG,
  BridgeRoute
} from '../../instructions/xchain/types';
import { compileBridgeResult } from '../../instructions/xchain/opcodes';
import { createClient } from '../../sdk/core/client';
import { KeypairSigner } from '../../sdk/core/signer';

export interface BridgeRunnerConfig {
  /** WSTF chain connection */
  wstfRpcUrl: string;
  wstfSigner: KeypairSigner; // Provider's WSTF signer

  /** External chain connections */
  chainConnections: Record<ChainId, {
    rpcUrl: string;
    privateKey: string;    // Provider's private key for this chain
    walletAddress: string; // Provider's wallet address on this chain
  }>;

  /** Provider configuration */
  providerName: string;
  supportedRoutes: string[]; // Route IDs this runner handles

  /** Operational limits */
  maxConcurrentBridges: number;
  maxAmountPerBridge: bigint;
  dailyVolumeLimit: bigint;

  /** Safety settings */
  requiredConfirmations: Record<ChainId, number>;
  enabledChains: ChainId[];
  emergencyStop: boolean;
}

export interface ChainConnection {
  chainId: ChainId;
  provider: any; // ethers.Provider or web3 provider
  wallet: any;   // ethers.Wallet or web3 account
  blockNumber: number;
  isHealthy: boolean;
}

export interface BridgeExecution {
  requestId: string;
  request: BridgeRequest;
  route: BridgeRoute;
  status: BridgeStatus;
  startedAt: number;
  srcTxHash?: string;
  dstTxHash?: string;
  error?: string;
  retryCount: number;
}

export class BridgeRunner extends EventEmitter {
  private config: BridgeRunnerConfig;
  private wstfClient: any; // WSTF SDK client
  private chainConnections: Map<ChainId, ChainConnection> = new Map();
  private activeBridges: Map<string, BridgeExecution> = new Map();
  private isRunning: boolean = false;
  private routes: Map<string, BridgeRoute> = new Map();

  constructor(config: BridgeRunnerConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the bridge runner service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Bridge runner is already running');
    }

    console.log(`🌉 Starting Bridge Runner: ${this.config.providerName}`);

    try {
      // Initialize WSTF chain connection
      await this.initializeWSTFConnection();

      // Initialize external chain connections
      await this.initializeChainConnections();

      // Load supported routes
      await this.loadSupportedRoutes();

      // Start event monitoring
      await this.startEventMonitoring();

      this.isRunning = true;
      console.log('✅ Bridge runner started successfully');

      this.emit('started');
    } catch (error) {
      console.error('❌ Failed to start bridge runner:', error);
      throw error;
    }
  }

  /**
   * Stop the bridge runner service
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping bridge runner...');
    this.isRunning = false;

    // Cancel all pending bridges
    for (const [requestId, execution] of this.activeBridges) {
      if (execution.status === 'pending' || execution.status === 'confirmed') {
        await this.reportBridgeResult(requestId, {
          status: 'cancelled',
          reason: 'Service shutting down'
        });
      }
    }

    this.emit('stopped');
    console.log('✅ Bridge runner stopped');
  }

  /**
   * Initialize connection to WSTF chain
   */
  private async initializeWSTFConnection(): Promise<void> {
    console.log('🔗 Connecting to WSTF chain...');

    this.wstfClient = createClient({
      baseURL: this.config.wstfRpcUrl,
      signer: this.config.wstfSigner
    });

    // Test connection
    const capabilities = await this.wstfClient.getCapabilities();
    console.log(`   Connected to WSTF: ${capabilities.version}`);
  }

  /**
   * Initialize connections to external chains
   */
  private async initializeChainConnections(): Promise<void> {
    console.log('🔗 Initializing external chain connections...');

    for (const [chainId, connection] of Object.entries(this.config.chainConnections)) {
      try {
        // This would use ethers.js, web3.js, or Solana web3.js depending on chain
        const chainConnection = await this.createChainConnection(
          chainId as ChainId,
          connection
        );

        this.chainConnections.set(chainId as ChainId, chainConnection);
        console.log(`   ✅ Connected to ${chainId}`);
      } catch (error) {
        console.error(`   ❌ Failed to connect to ${chainId}:`, error);
        // Continue with other chains, but mark this one as unhealthy
      }
    }
  }

  /**
   * Create connection to a specific chain
   */
  private async createChainConnection(
    chainId: ChainId,
    config: BridgeRunnerConfig['chainConnections'][ChainId]
  ): Promise<ChainConnection> {
    // This is pseudo-code - actual implementation would depend on chain type
    switch (chainId) {
      case 'bsc':
      case 'polygon':
      case 'ethereum':
      case 'arbitrum':
      case 'optimism':
      case 'avalanche':
        // Use ethers.js for EVM chains
        return this.createEVMConnection(chainId, config);

      case 'solana':
        // Use Solana web3.js
        return this.createSolanaConnection(chainId, config);

      default:
        throw new Error(`Unsupported chain: ${chainId}`);
    }
  }

  /**
   * Create EVM chain connection (BSC, Polygon, etc.)
   */
  private async createEVMConnection(
    chainId: ChainId,
    config: BridgeRunnerConfig['chainConnections'][ChainId]
  ): Promise<ChainConnection> {
    // Pseudo-code using ethers.js
    const ethers = require('ethers');

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    // Test connection
    const blockNumber = await provider.getBlockNumber();
    const balance = await wallet.getBalance();

    console.log(`     ${chainId} block: ${blockNumber}, balance: ${ethers.formatEther(balance)} ETH`);

    return {
      chainId,
      provider,
      wallet,
      blockNumber,
      isHealthy: true
    };
  }

  /**
   * Create Solana connection
   */
  private async createSolanaConnection(
    chainId: ChainId,
    config: BridgeRunnerConfig['chainConnections'][ChainId]
  ): Promise<ChainConnection> {
    // Pseudo-code using @solana/web3.js
    const { Connection, Keypair } = require('@solana/web3.js');

    const connection = new Connection(config.rpcUrl);
    const wallet = Keypair.fromSecretKey(Buffer.from(config.privateKey, 'hex'));

    const balance = await connection.getBalance(wallet.publicKey);
    const slot = await connection.getSlot();

    console.log(`     Solana slot: ${slot}, balance: ${balance / 1e9} SOL`);

    return {
      chainId,
      provider: connection,
      wallet,
      blockNumber: slot,
      isHealthy: true
    };
  }

  /**
   * Load supported routes from WSTF chain
   */
  private async loadSupportedRoutes(): Promise<void> {
    console.log('📋 Loading supported bridge routes...');

    // Query WSTF chain for routes this provider supports
    for (const routeId of this.config.supportedRoutes) {
      try {
        // This would query the route registry on WSTF chain
        const route = await this.wstfClient.bridge.getRoute(routeId);

        if (route && route.provider === this.config.wstfSigner.address) {
          this.routes.set(routeId, route);
          console.log(`   ✅ Loaded route: ${routeId}`);
        }
      } catch (error) {
        console.error(`   ❌ Failed to load route ${routeId}:`, error);
      }
    }

    console.log(`📋 Loaded ${this.routes.size} bridge routes`);
  }

  /**
   * Start monitoring WSTF chain for bridge request events
   */
  private async startEventMonitoring(): Promise<void> {
    console.log('👁️ Starting event monitoring...');

    // Subscribe to BRIDGE_REQUEST events for our provider
    // This would use your existing event subscription system
    this.wstfClient.events.subscribe({
      module: 'XCHAIN.BRIDGE',
      key: 'BRIDGE_REQUEST',
      filter: {
        // Only events for routes we support
        routeId: Array.from(this.routes.keys())
      }
    }, (event: any) => {
      this.handleBridgeRequest(event);
    });

    console.log('👁️ Event monitoring started');
  }

  /**
   * Handle incoming bridge request event
   */
  private async handleBridgeRequest(event: any): Promise<void> {
    const request = event.data as BridgeRequest;
    const requestId = event.topics[0];

    console.log(`🌉 New bridge request: ${requestId}`);
    console.log(`   ${request.srcChainId} → ${request.dstChainId}`);
    console.log(`   Amount: ${request.amount.toString()}`);

    try {
      // Validate request
      const validation = await this.validateBridgeRequest(request);
      if (!validation.valid) {
        await this.reportBridgeResult(requestId, {
          status: 'failed',
          reason: validation.reason
        });
        return;
      }

      // Start bridge execution
      const execution: BridgeExecution = {
        requestId,
        request,
        route: this.routes.get(request.routeId)!,
        status: 'confirmed',
        startedAt: Date.now(),
        retryCount: 0
      };

      this.activeBridges.set(requestId, execution);

      // Report that we've accepted the request
      await this.reportBridgeResult(requestId, {
        status: 'confirmed',
        reason: 'Bridge request accepted and processing'
      });

      // Execute the bridge asynchronously
      this.executeBridge(execution).catch(error => {
        console.error(`Bridge execution failed for ${requestId}:`, error);
        this.reportBridgeResult(requestId, {
          status: 'failed',
          reason: error.message
        });
      });

    } catch (error) {
      console.error(`Error handling bridge request ${requestId}:`, error);
      await this.reportBridgeResult(requestId, {
        status: 'failed',
        reason: `Internal error: ${error.message}`
      });
    }
  }

  /**
   * Validate a bridge request before execution
   */
  private async validateBridgeRequest(request: BridgeRequest): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    // Check if we support this route
    const route = this.routes.get(request.routeId);
    if (!route) {
      return { valid: false, reason: 'Route not supported by this provider' };
    }

    // Check amount limits
    if (request.amount < route.minAmount || request.amount > route.maxAmount) {
      return { valid: false, reason: 'Amount outside supported range' };
    }

    // Check if we have sufficient liquidity on destination chain
    const dstConnection = this.chainConnections.get(request.dstChainId);
    if (!dstConnection || !dstConnection.isHealthy) {
      return { valid: false, reason: 'Destination chain unavailable' };
    }

    // Check our balance on destination chain
    const requiredAmount = request.minDstAmount || request.amount;
    const hasLiquidity = await this.checkLiquidity(request.dstChainId, request.dstToken, requiredAmount);

    if (!hasLiquidity) {
      return { valid: false, reason: 'Insufficient liquidity on destination chain' };
    }

    // Check deadline
    if (request.deadline < Date.now()) {
      return { valid: false, reason: 'Request deadline has passed' };
    }

    // Check concurrent bridge limit
    if (this.activeBridges.size >= this.config.maxConcurrentBridges) {
      return { valid: false, reason: 'Provider at capacity, try again later' };
    }

    return { valid: true };
  }

  /**
   * Check if we have sufficient liquidity for a bridge
   */
  private async checkLiquidity(
    chainId: ChainId,
    tokenAddress: string,
    amount: bigint
  ): Promise<boolean> {
    const connection = this.chainConnections.get(chainId);
    if (!connection) return false;

    try {
      // This would check token balance for EVM chains
      if (['bsc', 'polygon', 'ethereum', 'arbitrum', 'optimism', 'avalanche'].includes(chainId)) {
        return await this.checkEVMTokenBalance(connection, tokenAddress, amount);
      }

      // For Solana
      if (chainId === 'solana') {
        return await this.checkSolanaTokenBalance(connection, tokenAddress, amount);
      }

      return false;
    } catch (error) {
      console.error(`Error checking liquidity on ${chainId}:`, error);
      return false;
    }
  }

  /**
   * Check EVM token balance
   */
  private async checkEVMTokenBalance(
    connection: ChainConnection,
    tokenAddress: string,
    requiredAmount: bigint
  ): Promise<boolean> {
    // Pseudo-code for EVM token balance check
    const ethers = require('ethers');

    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];

    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20Abi,
      connection.wallet
    );

    const balance = await tokenContract.balanceOf(connection.wallet.address);
    return balance >= requiredAmount;
  }

  /**
   * Check Solana token balance
   */
  private async checkSolanaTokenBalance(
    connection: ChainConnection,
    tokenMint: string,
    requiredAmount: bigint
  ): Promise<boolean> {
    // Pseudo-code for Solana SPL token balance check
    const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');

    try {
      const ata = await getAssociatedTokenAddress(
        new (require('@solana/web3.js')).PublicKey(tokenMint),
        connection.wallet.publicKey
      );

      const accountInfo = await getAccount(connection.provider, ata);
      return accountInfo.amount >= requiredAmount;
    } catch {
      return false; // ATA doesn't exist or other error
    }
  }

  /**
   * Execute a bridge operation
   */
  private async executeBridge(execution: BridgeExecution): Promise<void> {
    const { requestId, request, route } = execution;

    console.log(`🔄 Executing bridge ${requestId}...`);

    try {
      // Update status to in progress
      execution.status = 'src_confirmed';
      await this.reportBridgeResult(requestId, {
        status: 'src_confirmed',
        reason: 'Monitoring source transaction'
      });

      // Option A: Wait for user's source transaction
      if (request.srcTxHash) {
        console.log(`   Waiting for source tx: ${request.srcTxHash}`);
        await this.waitForSourceTransaction(execution);
      }

      // Execute destination transaction
      console.log(`   Executing destination transaction...`);
      const dstTxHash = await this.executeDestinationTransaction(execution);

      execution.dstTxHash = dstTxHash;
      execution.status = 'fulfilled';

      // Report successful completion
      await this.reportBridgeResult(requestId, {
        status: 'fulfilled',
        srcTxHash: execution.srcTxHash,
        dstTxHash: execution.dstTxHash,
        actualDstAmount: request.amount, // Simplified - would calculate actual amount
        completedAt: BigInt(Date.now())
      });

      console.log(`✅ Bridge ${requestId} completed successfully`);

    } catch (error) {
      console.error(`❌ Bridge ${requestId} failed:`, error);
      execution.status = 'failed';
      execution.error = error.message;

      await this.reportBridgeResult(requestId, {
        status: 'failed',
        reason: error.message
      });
    } finally {
      this.activeBridges.delete(requestId);
    }
  }

  /**
   * Wait for and verify source chain transaction
   */
  private async waitForSourceTransaction(execution: BridgeExecution): Promise<void> {
    const { request, route } = execution;

    // This would monitor the source chain for the user's deposit transaction
    // Simplified implementation
    execution.srcTxHash = request.srcTxHash;
  }

  /**
   * Execute transaction on destination chain
   */
  private async executeDestinationTransaction(execution: BridgeExecution): Promise<string> {
    const { request } = execution;
    const connection = this.chainConnections.get(request.dstChainId);

    if (!connection) {
      throw new Error(`No connection to destination chain ${request.dstChainId}`);
    }

    // Execute the actual token transfer on destination chain
    if (['bsc', 'polygon', 'ethereum', 'arbitrum', 'optimism', 'avalanche'].includes(request.dstChainId)) {
      return await this.executeEVMTransaction(connection, execution);
    }

    if (request.dstChainId === 'solana') {
      return await this.executeSolanaTransaction(connection, execution);
    }

    throw new Error(`Unsupported destination chain: ${request.dstChainId}`);
  }

  /**
   * Execute EVM transaction
   */
  private async executeEVMTransaction(
    connection: ChainConnection,
    execution: BridgeExecution
  ): Promise<string> {
    const { request } = execution;
    const ethers = require('ethers');

    const erc20Abi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)'
    ];

    const tokenContract = new ethers.Contract(
      request.dstToken,
      erc20Abi,
      connection.wallet
    );

    const tx = await tokenContract.transfer(
      request.dstRecipient,
      request.amount
    );

    await tx.wait(); // Wait for confirmation
    return tx.hash;
  }

  /**
   * Execute Solana transaction
   */
  private async executeSolanaTransaction(
    connection: ChainConnection,
    execution: BridgeExecution
  ): Promise<string> {
    const { request } = execution;
    // Pseudo-code for Solana SPL transfer
    const {
      createTransferInstruction,
      getAssociatedTokenAddress,
      TOKEN_PROGRAM_ID
    } = require('@solana/spl-token');

    const {
      Transaction,
      PublicKey,
      sendAndConfirmTransaction
    } = require('@solana/web3.js');

    const sourceAta = await getAssociatedTokenAddress(
      new PublicKey(request.dstToken),
      connection.wallet.publicKey
    );

    const destAta = await getAssociatedTokenAddress(
      new PublicKey(request.dstToken),
      new PublicKey(request.dstRecipient)
    );

    const transferInstruction = createTransferInstruction(
      sourceAta,
      destAta,
      connection.wallet.publicKey,
      request.amount,
      [],
      TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction().add(transferInstruction);

    const signature = await sendAndConfirmTransaction(
      connection.provider,
      transaction,
      [connection.wallet]
    );

    return signature;
  }

  /**
   * Report bridge result back to WSTF chain
   */
  private async reportBridgeResult(
    requestId: string,
    result: Partial<BridgeResult>
  ): Promise<void> {
    try {
      const fullResult: BridgeResult = {
        requestId,
        provider: this.config.wstfSigner.address,
        status: result.status || 'failed',
        reason: result.reason,
        srcTxHash: result.srcTxHash,
        dstTxHash: result.dstTxHash,
        actualDstAmount: result.actualDstAmount,
        completedAt: result.completedAt
      };

      const instruction = compileBridgeResult(fullResult);

      // Submit instruction to WSTF chain
      await this.wstfClient.submitInstruction(instruction);

      console.log(`📡 Reported bridge result: ${requestId} -> ${result.status}`);
    } catch (error) {
      console.error(`Failed to report bridge result for ${requestId}:`, error);
    }
  }

  /**
   * Get current status of all active bridges
   */
  getActiveBridges(): BridgeExecution[] {
    return Array.from(this.activeBridges.values());
  }

  /**
   * Get provider statistics
   */
  getProviderStats() {
    return {
      providerAddress: this.config.wstfSigner.address,
      providerName: this.config.providerName,
      activeBridges: this.activeBridges.size,
      supportedRoutes: this.routes.size,
      chainConnections: Array.from(this.chainConnections.keys()),
      isHealthy: this.isRunning && this.chainConnections.size > 0
    };
  }
}