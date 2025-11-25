/**
 * Enhanced WSTF SDK for Production Use
 *
 * SDK 1.0 with locked surface area for wallets, dapps, and bridge integrators.
 */

import type { RpcClient, Signer } from './core';
import { createClient } from './core/client';
import { createSigner, importSigner, KeypairSigner, SigAlg } from './core/signer';
import type {
  SdkConfig,
  NetworkName,
  NetworkProfile,
} from './types';

// Module imports
import { createNetworkModule } from './network';
import type { NetworkModule } from './network/types';
import { createNodesModule } from './nodes';
import type { NodesModule } from './nodes/types';
import { createEnhancedBridgeModule } from './bridge/enhanced-bridge';
import type { BridgeModule } from './bridge/types';

// Existing module imports
import { createTokensSDK, TokensSDK } from './core/tokens';
import { createMarketsSDK, MarketsSDK } from './core/markets';
import { createVarsSDK, VarsSDK } from './core/vars';
import { createAuthSDK, WSTFAuthSDK } from './auth/auth-sdk';

// Network configurations
import { DEFAULT_NETWORKS, getNetworkProfile } from './network/config';

/**
 * Enhanced WSTF SDK - Production Ready
 *
 * Provides unified access to all WSTFChain functionality with locked APIs:
 * - `network` - Network discovery and cluster information
 * - `nodes` - Node discovery and monitoring
 * - `bridge` - Cross-chain bridge operations (production-ready)
 * - `tokens` - Token operations (FT, NFT, SFT)
 * - `markets` - Orderbook operations
 * - `vars` - Key/value storage
 * - `auth` - Access control and authentication
 * - `client` - Raw RPC access
 */
export class WSTFSDK {
  /** Current network profile */
  readonly networkProfile: NetworkProfile;

  /** RPC client for chain queries */
  readonly client: RpcClient;

  /** Signer for transactions */
  readonly signer?: Signer;

  /** Network module for cluster info and capabilities */
  readonly network: NetworkModule;

  /** Nodes module for node discovery and monitoring */
  readonly nodes: NodesModule;

  /** Enhanced bridge module for cross-chain operations */
  readonly bridge: BridgeModule;

  /** Tokens SDK */
  readonly tokens: TokensSDK;

  /** Markets SDK */
  readonly markets: MarketsSDK;

  /** Vars SDK */
  readonly vars: VarsSDK;

  /** Auth SDK */
  readonly auth: WSTFAuthSDK;

  private constructor(
    networkProfile: NetworkProfile,
    client: RpcClient,
    signer?: Signer
  ) {
    this.networkProfile = networkProfile;
    this.client = client;
    this.signer = signer;

    // Create new modules
    this.network = createNetworkModule(networkProfile, client);
    this.nodes = createNodesModule(networkProfile, client);
    this.bridge = createEnhancedBridgeModule(
      networkProfile,
      client,
      signer instanceof KeypairSigner ? signer : undefined,
      {
        registryUrl: networkProfile.bridgeRegistryUrl,
        timeout: 30000,
      }
    );

    // Create existing modules
    this.tokens = createTokensSDK(client, signer);
    this.markets = createMarketsSDK(client, signer);
    this.vars = createVarsSDK(client, signer);

    // Create auth SDK
    const authApiUrl = `${networkProfile.rpcUrls.core}/auth`;
    this.auth = createAuthSDK({
      apiUrl: authApiUrl,
      signer: signer instanceof KeypairSigner ? signer : undefined,
      timeout: 30000,
      autoRefresh: true,
    });
  }

  /**
   * Create a new SDK instance from configuration
   */
  static create(config: SdkConfig): WSTFSDK {
    // Resolve network profile
    let networkProfile: NetworkProfile;
    if (typeof config.network === 'string') {
      networkProfile = getNetworkProfile(config.network);
    } else {
      networkProfile = config.network;
    }

    // Create RPC client
    const client = createClient({
      rpc: networkProfile.rpcUrls.core,
      timeout: config.timeoutMs || 30000,
      retries: config.retry?.maxRetries || 3,
    });

    return new WSTFSDK(networkProfile, client, config.signer);
  }

  /**
   * Create SDK for a specific network by name
   */
  static createForNetwork(
    networkName: NetworkName,
    signer?: Signer,
    options: {
      timeoutMs?: number;
      customRpcUrl?: string;
    } = {}
  ): WSTFSDK {
    let networkProfile = getNetworkProfile(networkName);

    // Override RPC URL if provided
    if (options.customRpcUrl) {
      networkProfile = {
        ...networkProfile,
        rpcUrls: {
          ...networkProfile.rpcUrls,
          core: options.customRpcUrl,
        },
      };
    }

    const client = createClient({
      rpc: networkProfile.rpcUrls.core,
      timeout: options.timeoutMs || 30000,
    });

    return new WSTFSDK(networkProfile, client, signer);
  }

  /**
   * Create SDK instance for testing with local network
   */
  static createForTesting(signer?: Signer): WSTFSDK {
    const networkProfile = getNetworkProfile('local');
    const client = createClient({
      rpc: networkProfile.rpcUrls.core,
      timeout: 10000,
    });

    return new WSTFSDK(
      networkProfile,
      client,
      signer ?? createSigner(SigAlg.ED25519)
    );
  }

  /**
   * Generate a new random signer
   */
  static generateSigner(sigAlg: SigAlg = SigAlg.ED25519): Signer {
    return createSigner(sigAlg);
  }

  /**
   * Import a signer from a private key
   */
  static importSigner(privateKey: string | Uint8Array, sigAlg: SigAlg): Signer {
    return importSigner(privateKey, sigAlg);
  }

  /**
   * List available networks
   */
  static listNetworks(): NetworkProfile[] {
    return Object.values(DEFAULT_NETWORKS);
  }

  /**
   * Get the signer's address (if signer is available)
   */
  get address(): string | undefined {
    return this.signer?.address;
  }

  /**
   * Switch to a different network
   */
  async switchNetwork(nameOrProfile: NetworkName | NetworkProfile): Promise<WSTFSDK> {
    let newProfile: NetworkProfile;
    if (typeof nameOrProfile === 'string') {
      newProfile = getNetworkProfile(nameOrProfile);
    } else {
      newProfile = nameOrProfile;
    }

    // Create new client for the new network
    const newClient = createClient({
      rpc: newProfile.rpcUrls.core,
      timeout: 30000,
    });

    return new WSTFSDK(newProfile, newClient, this.signer);
  }

  /**
   * Test connectivity to current network
   */
  async testConnectivity(): Promise<{
    healthy: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const result = await this.client.getHeight();
      const latencyMs = Date.now() - startTime;

      return {
        healthy: result.success,
        latencyMs,
        error: result.success ? undefined : String(result.error),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Get current chain height
   */
  async getHeight(): Promise<bigint> {
    const result = await this.client.getHeight();
    if (!result.success || result.data === undefined) {
      throw new Error(String(result.error) || 'Failed to get chain height');
    }
    return result.data;
  }

  /**
   * Get native token balance
   */
  async getNativeBalance(address?: string): Promise<bigint> {
    const addr = address ?? this.address;
    if (!addr) {
      throw new Error('Address or signer required');
    }

    const result = await this.client.getNativeBalance(addr);
    if (!result.success || result.data === undefined) {
      throw new Error(String(result.error) || 'Failed to get balance');
    }
    return result.data;
  }

  /**
   * Get account nonce
   */
  async getNonce(address?: string): Promise<bigint> {
    const addr = address ?? this.address;
    if (!addr) {
      throw new Error('Address or signer required');
    }

    const result = await this.client.getNonce(addr);
    if (!result.success || result.data === undefined) {
      throw new Error(String(result.error) || 'Failed to get nonce');
    }
    return result.data;
  }

  /**
   * Create a WSTFAuth token for a program (if signer is available)
   */
  createAuthToken(programId: string, ttlSeconds?: number): string {
    if (!this.signer) {
      throw new Error('Signer required for creating auth tokens');
    }
    return this.signer.createAuthToken(programId, { ttlSeconds });
  }

  /**
   * Create a scoped WSTFAuth token (if signer is available)
   */
  createScopedToken(
    programId: string,
    scopes: string[],
    ttlSeconds?: number
  ): string {
    if (!this.signer) {
      throw new Error('Signer required for creating scoped tokens');
    }
    return this.signer.createScopedToken(programId, scopes, { ttlSeconds });
  }

  /**
   * Destroy the SDK instance and clean up resources
   */
  destroy(): void {
    // Stop any running monitors
    this.nodes.stopHealthMonitoring();

    // Clear any cached data
    // Note: Individual modules should implement their own cleanup if needed
  }
}

/**
 * Default export
 */
export default WSTFSDK;