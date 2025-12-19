/**
 * Network Module Types
 */

import type { NetworkName, ClusterInfo, ServiceCapabilities } from '../types';
export type { NetworkName, ClusterInfo, ServiceCapabilities };

/**
 * Network profile for connecting to different environments
 */
export interface NetworkProfile {
  name: NetworkName;
  label: string;              // "WSTF Devnet"
  chainId: string;            // "wstf-devnet"
  rpcUrls: {
    core: string;
    indexer?: string;
    p2p?: string;
  };
  explorerUrl?: string;       // external block explorer
  faucetUrl?: string;         // for testnet funding
  bridgeRegistryUrl?: string; // bridge-specific registry
}

/**
 * Network status information
 */
export interface NetworkStatus {
  healthy: boolean;
  latencyMs: number;
  lastBlockTime: number;
  syncState: 'synced' | 'syncing' | 'behind' | 'error';
  errorMessage?: string;
}

/**
 * Network module interface
 */
export interface NetworkModule {
  /**
   * Get current cluster information
   */
  getClusterInfo(): Promise<ClusterInfo>;

  /**
   * Get service capabilities for this endpoint
   */
  getServiceCapabilities(): Promise<ServiceCapabilities>;

  /**
   * Get network status and health
   */
  getNetworkStatus(): Promise<NetworkStatus>;

  /**
   * Get current network profile
   */
  getProfile(): NetworkProfile;

  /**
   * Switch to a different network
   */
  switchNetwork(nameOrProfile: NetworkName | NetworkProfile): void;

  /**
   * Test connectivity to a network
   */
  testConnectivity(profile: NetworkProfile): Promise<NetworkStatus>;
}