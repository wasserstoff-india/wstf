/**
 * Core SDK Types for @wstf/sdk
 */

import type { Signer } from './core';

/**
 * Network configuration for SDK
 */
export type NetworkName = 'local' | 'devnet' | 'testnet' | 'mainnet';

/**
 * SDK Configuration for Node/Backend SDK
 */
export interface SdkConfig {
  /** Network to connect to */
  network: NetworkName | NetworkProfile;

  /** RPC endpoints */
  rpcUrls: {
    core: string;        // main RPC (validator / explorer)
    p2p?: string;        // for node info
    indexer?: string;    // for search-heavy stuff
  };

  /** Signer for transactions */
  signer?: Signer;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Retry configuration */
  retry?: {
    maxRetries: number;
    backoffMs: number;
  };

  /** Program IDs (optional, uses defaults) */
  programs?: {
    tokens?: string;
    markets?: string;
    vars?: string;
    bridge?: string;
  };
}

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
}

/**
 * Cluster information for network monitoring
 */
export interface ClusterInfo {
  network: string;            // "wstf-devnet"
  chainId: string;            // "wstf-001"
  height: bigint;
  tipHash: string;
  avgBlockTimeMs: number;
  peers: number;
  version: string;            // node software version
  capabilities: {
    accounts: boolean;
    validator: boolean;
    explorer: boolean;
    mempool: boolean;
    p2p: boolean;
    indexer: boolean;
    bridgeRegistry: boolean;
  };
}

/**
 * Service capabilities for health monitoring
 */
export interface ServiceCapabilities {
  accounts: boolean;
  validator: boolean;
  explorer: boolean;
  mempool: boolean;
  p2p: boolean;
  indexer: boolean;
  bridgeRegistry: boolean;
}

/**
 * SDK Result wrapper for consistent error handling
 */
export interface SdkResult<T> {
  success: boolean;
  data?: T;
  error?: string | SdkError;
}

/**
 * SDK Error type
 */
export interface SdkError {
  code: string;
  message: string;
  details?: any;
}

/**
 * Chain identifier type
 */
export type ChainId = 'bsc' | 'polygon' | 'eth' | 'arb' | 'op' | string;