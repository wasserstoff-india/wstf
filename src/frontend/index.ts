/**
 * WSTF Kit - Frontend SDK
 *
 * Complete frontend toolkit for building WSTF Chain applications.
 *
 * @packageDocumentation
 *
 * ## Package Exports
 *
 * For optimal bundle size, use specific entry points:
 *
 * ```ts
 * // Core (browser client, types, wallet manager)
 * import { createClient, createWalletManager } from '@wasserstoff/wstf-kit/core';
 *
 * // React (provider, hooks)
 * import { WstfProvider, useWallet, useAccount } from '@wasserstoff/wstf-kit/react';
 *
 * // Components (UI)
 * import { AccountOverview, TxList, BlockList } from '@wasserstoff/wstf-kit/components';
 *
 * // Examples (drop-in pages)
 * import { DevnetExplorerPage, SwapDemoPage } from '@wasserstoff/wstf-kit/examples';
 * ```
 */

// Core exports
export * from './core';

// React exports
export * from './react';

// Component exports
export * from './components';

// Example exports
export * from './examples';
