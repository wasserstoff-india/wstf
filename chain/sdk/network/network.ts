/**
 * Network Module Implementation
 *
 * Handles network discovery, cluster information, and service monitoring.
 */

import type { RpcClient } from '../core';
import type {
  NetworkModule,
  NetworkProfile,
  NetworkStatus,
} from './types';
import type { ClusterInfo, ServiceCapabilities, NetworkName } from '../types';
import { DEFAULT_NETWORKS, getNetworkProfile } from './config';

/**
 * Network module implementation
 */
class NetworkModuleImpl implements NetworkModule {
  private currentProfile: NetworkProfile;
  private client: RpcClient;

  constructor(profile: NetworkProfile, client: RpcClient) {
    this.currentProfile = profile;
    this.client = client;
  }

  async getClusterInfo(): Promise<ClusterInfo> {
    try {
      // Try to get cluster info from the core RPC
      const response = await fetch(`${this.currentProfile.rpcUrls.core}/status/cluster`);
      if (response.ok) {
        const data = await response.json();
        return {
          network: data.network || this.currentProfile.label,
          chainId: data.chainId || this.currentProfile.chainId,
          height: BigInt(data.height || 0),
          tipHash: data.tipHash || '',
          avgBlockTimeMs: data.avgBlockTimeMs || 5000,
          peers: data.peers || 0,
          version: data.version || '0.1.0',
          capabilities: data.capabilities || {
            accounts: true,
            validator: true,
            explorer: true,
            mempool: true,
            p2p: true,
            indexer: !!this.currentProfile.rpcUrls.indexer,
            bridgeRegistry: !!this.currentProfile.bridgeRegistryUrl,
          },
        };
      }

      // Fallback: get basic info from existing RPC methods
      const heightResult = await this.client.getHeight();
      return {
        network: this.currentProfile.label,
        chainId: this.currentProfile.chainId,
        height: heightResult.success ? heightResult.data! : 0n,
        tipHash: '',
        avgBlockTimeMs: 5000,
        peers: 0,
        version: '0.1.0',
        capabilities: {
          accounts: true,
          validator: true,
          explorer: true,
          mempool: true,
          p2p: !!this.currentProfile.rpcUrls.p2p,
          indexer: !!this.currentProfile.rpcUrls.indexer,
          bridgeRegistry: !!this.currentProfile.bridgeRegistryUrl,
        },
      };
    } catch (error) {
      throw new Error(`Failed to get cluster info: ${error}`);
    }
  }

  async getServiceCapabilities(): Promise<ServiceCapabilities> {
    try {
      // Try the capabilities endpoint first
      const response = await fetch(`${this.currentProfile.rpcUrls.core}/capabilities`);
      if (response.ok) {
        const data = await response.json();
        return {
          accounts: data.accounts ?? true,
          validator: data.validator ?? true,
          explorer: data.explorer ?? true,
          mempool: data.mempool ?? true,
          p2p: data.p2p ?? !!this.currentProfile.rpcUrls.p2p,
          indexer: data.indexer ?? !!this.currentProfile.rpcUrls.indexer,
          bridgeRegistry: data.bridgeRegistry ?? !!this.currentProfile.bridgeRegistryUrl,
        };
      }

      // Fallback: infer from configuration
      return {
        accounts: true,
        validator: true,
        explorer: true,
        mempool: true,
        p2p: !!this.currentProfile.rpcUrls.p2p,
        indexer: !!this.currentProfile.rpcUrls.indexer,
        bridgeRegistry: !!this.currentProfile.bridgeRegistryUrl,
      };
    } catch (error) {
      // Return basic capabilities on error
      return {
        accounts: true,
        validator: true,
        explorer: true,
        mempool: true,
        p2p: false,
        indexer: false,
        bridgeRegistry: false,
      };
    }
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    const startTime = Date.now();

    try {
      // Test connectivity with a simple health check
      const response = await fetch(`${this.currentProfile.rpcUrls.core}/health`, {
        method: 'GET',
        timeout: 5000,
      } as any);

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        return {
          healthy: data.status === 'healthy',
          latencyMs,
          lastBlockTime: data.lastBlockTime || Date.now(),
          syncState: data.syncState || 'synced',
        };
      }

      return {
        healthy: false,
        latencyMs,
        lastBlockTime: 0,
        syncState: 'error',
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        healthy: false,
        latencyMs,
        lastBlockTime: 0,
        syncState: 'error',
        errorMessage: String(error),
      };
    }
  }

  getProfile(): NetworkProfile {
    return this.currentProfile;
  }

  switchNetwork(nameOrProfile: NetworkName | NetworkProfile): void {
    if (typeof nameOrProfile === 'string') {
      this.currentProfile = getNetworkProfile(nameOrProfile);
    } else {
      this.currentProfile = nameOrProfile;
    }

    // Note: This doesn't automatically recreate the RPC client
    // The SDK should handle that in its switchNetwork method
  }

  async testConnectivity(profile: NetworkProfile): Promise<NetworkStatus> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${profile.rpcUrls.core}/health`, {
        method: 'GET',
        timeout: 5000,
      } as any);

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        return {
          healthy: data.status === 'healthy',
          latencyMs,
          lastBlockTime: data.lastBlockTime || Date.now(),
          syncState: data.syncState || 'synced',
        };
      }

      return {
        healthy: false,
        latencyMs,
        lastBlockTime: 0,
        syncState: 'error',
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        healthy: false,
        latencyMs,
        lastBlockTime: 0,
        syncState: 'error',
        errorMessage: String(error),
      };
    }
  }
}

/**
 * Create a network module instance
 */
export function createNetworkModule(
  profile: NetworkProfile,
  client: RpcClient
): NetworkModule {
  return new NetworkModuleImpl(profile, client);
}

/**
 * Create network module from network name
 */
export function createNetworkModuleFromName(
  name: NetworkName,
  client: RpcClient
): NetworkModule {
  const profile = getNetworkProfile(name);
  return createNetworkModule(profile, client);
}