/**
 * Frontend SDK Core Module
 *
 * Browser-compatible core functionality for WSTF Chain.
 */

// Types
export type {
  NetworkProfile,
  FrontendConfig,
  FrontendSigAlg,
  WalletStorageType,
  StoredWalletMeta,
  WalletExportMeta,
  FrontendSigner,
  AccountInfo,
  TokenBalance,
  BlockInfo,
  TransactionInfo,
  OrderbookLevel,
  OrderbookSnapshot,
  TradeInfo,
  RpcRequest,
  RpcResponse,
  WalletEventType,
  WalletEvent,
  WalletEventHandler,
  RuntimeCapabilities,
} from './types';

// Config
export {
  getDefaultConfig,
  createConfig,
  createCustomConfig,
  validateConfig,
  isBrowser,
  hasWebCrypto,
  hasPasskeySupport,
  hasIndexedDB,
  detectCapabilities,
} from './config';

// Client
export { WstfClient, createClient } from './client';

// Wallet
export { WalletManager, createWalletManager } from './wallet';

// Theme
export type { WstfTheme } from './theme';
export { wstfTheme, wstfThemeCSS, getThemeColor, applyTheme } from './theme';
