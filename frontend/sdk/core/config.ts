/**
 * Frontend SDK Configuration
 *
 * Network profiles and configuration management.
 */

import type { FrontendConfig, NetworkProfile } from './types';

// ============================================================
// Default Configurations
// ============================================================

const DEVNET_CONFIG: FrontendConfig = {
  network: 'devnet',
  rpcUrl: 'http://localhost:3000',  // Use dev server proxy
  explorerUrl: 'http://localhost:3000',  // Use dev server proxy
  accountsUrl: 'http://localhost:3000',  // Use dev server proxy
  chainId: 'wstf-devnet',
  wsUrl: 'ws://localhost:9101',
};

const TESTNET_CONFIG: FrontendConfig = {
  network: 'testnet',
  rpcUrl: 'https://testnet-rpc.wstf.io',
  explorerUrl: 'https://testnet-explorer.wstf.io',
  accountsUrl: 'https://testnet-accounts.wstf.io',
  chainId: 'wstf-testnet',
  wsUrl: 'wss://testnet-ws.wstf.io',
};

const MAINNET_CONFIG: FrontendConfig = {
  network: 'mainnet',
  rpcUrl: 'https://rpc.wstf.io',
  explorerUrl: 'https://explorer.wstf.io',
  accountsUrl: 'https://accounts.wstf.io',
  chainId: 'wstf-mainnet',
  wsUrl: 'wss://ws.wstf.io',
};

const CONFIGS: Record<NetworkProfile, FrontendConfig> = {
  devnet: DEVNET_CONFIG,
  testnet: TESTNET_CONFIG,
  mainnet: MAINNET_CONFIG,
};

// ============================================================
// Configuration Functions
// ============================================================

/**
 * Get default configuration for a network profile
 */
export function getDefaultConfig(network: NetworkProfile): FrontendConfig {
  return { ...CONFIGS[network] };
}

/**
 * Create a custom configuration with overrides
 */
export function createConfig(
  network: NetworkProfile,
  overrides?: Partial<FrontendConfig>
): FrontendConfig {
  return {
    ...CONFIGS[network],
    ...overrides,
  };
}

/**
 * Create a fully custom configuration
 */
export function createCustomConfig(config: FrontendConfig): FrontendConfig {
  return { ...config };
}

/**
 * Validate a configuration object
 */
export function validateConfig(config: FrontendConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.network) {
    errors.push('Missing network profile');
  }

  if (!config.rpcUrl) {
    errors.push('Missing RPC URL');
  } else if (!isValidUrl(config.rpcUrl)) {
    errors.push('Invalid RPC URL format');
  }

  if (!config.explorerUrl) {
    errors.push('Missing Explorer URL');
  } else if (!isValidUrl(config.explorerUrl)) {
    errors.push('Invalid Explorer URL format');
  }

  if (!config.accountsUrl) {
    errors.push('Missing Accounts URL');
  } else if (!isValidUrl(config.accountsUrl)) {
    errors.push('Invalid Accounts URL format');
  }

  if (!config.chainId) {
    errors.push('Missing chain ID');
  }

  if (config.wsUrl && !isValidWsUrl(config.wsUrl)) {
    errors.push('Invalid WebSocket URL format');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Check if WebCrypto is available
 */
export function hasWebCrypto(): boolean {
  return isBrowser() && typeof window.crypto !== 'undefined' && typeof window.crypto.subtle !== 'undefined';
}

/**
 * Check if WebAuthn/Passkeys are supported
 */
export function hasPasskeySupport(): boolean {
  return isBrowser() && typeof window.PublicKeyCredential !== 'undefined';
}

/**
 * Check if IndexedDB is available
 */
export function hasIndexedDB(): boolean {
  return isBrowser() && typeof window.indexedDB !== 'undefined';
}

// ============================================================
// Helpers
// ============================================================

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidWsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

// ============================================================
// Environment Detection
// ============================================================

export interface RuntimeCapabilities {
  browser: boolean;
  webCrypto: boolean;
  passkeys: boolean;
  indexedDB: boolean;
  localStorage: boolean;
}

/**
 * Detect runtime capabilities
 */
export function detectCapabilities(): RuntimeCapabilities {
  const browser = isBrowser();
  return {
    browser,
    webCrypto: hasWebCrypto(),
    passkeys: hasPasskeySupport(),
    indexedDB: hasIndexedDB(),
    localStorage: browser && typeof window.localStorage !== 'undefined',
  };
}
