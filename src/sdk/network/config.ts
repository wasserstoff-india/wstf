/**
 * Network Configuration for @wstf/sdk
 *
 * Predefined network profiles for different environments.
 */

import type { NetworkName, NetworkProfile } from './types';

/**
 * Default network configurations
 */
export const DEFAULT_NETWORKS: Record<NetworkName, NetworkProfile> = {
  local: {
    name: 'local',
    label: 'Local Devnet',
    chainId: 'wstf-local',
    rpcUrls: {
      core: 'http://127.0.0.1:7002',      // validator/explorer
      indexer: 'http://127.0.0.1:7200',   // indexer service
      p2p: 'http://127.0.0.1:9101',       // p2p network info
    },
    explorerUrl: 'http://127.0.0.1:7002/explorer',
    faucetUrl: 'http://127.0.0.1:7002/faucet',
    bridgeRegistryUrl: 'http://127.0.0.1:7002/bridge',
  },

  devnet: {
    name: 'devnet',
    label: 'WSTF Devnet',
    chainId: 'wstf-devnet',
    rpcUrls: {
      core: 'https://devnet.rpc.wstf.xyz',
      indexer: 'https://devnet.indexer.wstf.xyz',
      p2p: 'https://devnet.p2p.wstf.xyz',
    },
    explorerUrl: 'https://devnet.explorer.wstf.xyz',
    faucetUrl: 'https://devnet.faucet.wstf.xyz',
    bridgeRegistryUrl: 'https://devnet.bridge.wstf.xyz',
  },

  testnet: {
    name: 'testnet',
    label: 'WSTF Testnet',
    chainId: 'wstf-testnet-1',
    rpcUrls: {
      core: 'https://testnet.rpc.wstf.xyz',
      indexer: 'https://testnet.indexer.wstf.xyz',
      p2p: 'https://testnet.p2p.wstf.xyz',
    },
    explorerUrl: 'https://testnet.explorer.wstf.xyz',
    faucetUrl: 'https://testnet.faucet.wstf.xyz',
    bridgeRegistryUrl: 'https://testnet.bridge.wstf.xyz',
  },

  mainnet: {
    name: 'mainnet',
    label: 'WSTF Mainnet',
    chainId: 'wstf-1',
    rpcUrls: {
      core: 'https://rpc.wstf.xyz',
      indexer: 'https://indexer.wstf.xyz',
      p2p: 'https://p2p.wstf.xyz',
    },
    explorerUrl: 'https://explorer.wstf.xyz',
    bridgeRegistryUrl: 'https://bridge.wstf.xyz',
  },
};

/**
 * Get network profile by name
 */
export function getNetworkProfile(name: NetworkName): NetworkProfile {
  const profile = DEFAULT_NETWORKS[name];
  if (!profile) {
    throw new Error(`Unknown network: ${name}`);
  }
  return profile;
}

/**
 * Validate network profile
 */
export function validateNetworkProfile(profile: NetworkProfile): boolean {
  return !!(
    profile.name &&
    profile.label &&
    profile.chainId &&
    profile.rpcUrls?.core
  );
}

/**
 * Create custom network profile
 */
export function createNetworkProfile(
  name: NetworkName,
  label: string,
  chainId: string,
  rpcUrls: { core: string; indexer?: string; p2p?: string },
  options: {
    explorerUrl?: string;
    faucetUrl?: string;
    bridgeRegistryUrl?: string;
  } = {}
): NetworkProfile {
  return {
    name,
    label,
    chainId,
    rpcUrls,
    ...options,
  };
}

/**
 * Get network by chain ID
 */
export function getNetworkByChainId(chainId: string): NetworkProfile | null {
  for (const profile of Object.values(DEFAULT_NETWORKS)) {
    if (profile.chainId === chainId) {
      return profile;
    }
  }
  return null;
}

/**
 * List all available networks
 */
export function listNetworks(): NetworkProfile[] {
  return Object.values(DEFAULT_NETWORKS);
}

/**
 * Check if network name is valid
 */
export function isValidNetworkName(name: string): name is NetworkName {
  return name in DEFAULT_NETWORKS;
}