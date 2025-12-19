/**
 * @wstf/sdk - WSTFChain Node/Backend SDK v1.0
 *
 * Production-ready SDK for building bridge nodes, indexers, bots,
 * and backend services that interact with WSTFChain.
 *
 * @example
 * ```typescript
 * import { WSTFSDK } from '@wstf/sdk';
 *
 * // Connect to testnet
 * const sdk = WSTFSDK.createForNetwork('testnet', signer);
 *
 * // Bridge operations
 * const routes = await sdk.bridge.listRoutes({
 *   srcChain: 'bsc',
 *   dstChain: 'polygon',
 *   token: 'USDT'
 * });
 *
 * const order = await sdk.bridge.openOrder({
 *   routeId: routes[0].routeId,
 *   userAddress: sdk.address,
 *   srcAmount: 1000n * 1_000_000n,
 *   dstAddress: '0x742d35...'
 * });
 *
 * // Network discovery
 * const clusterInfo = await sdk.network.getClusterInfo();
 * const nodes = await sdk.nodes.listKnownNodes('bridge');
 * ```
 */

// ============================================================================
// STABLE SDK 1.0 EXPORTS
// ============================================================================

// Main SDK class (Enhanced production version)
export { WSTFSDK, default as WSTFSDKDefault } from './sdk';

// Core SDK configuration and types
export type { SdkConfig, NetworkName, NetworkProfile, ClusterInfo, ChainId } from './types';

// Network module for cluster information and service discovery
export type { NetworkModule } from './network/types';
export { createNetworkModule } from './network';
export { DEFAULT_NETWORKS, getNetworkProfile } from './network/config';

// Nodes module for node discovery and monitoring
export type {
  NodesModule,
  NodeInfo,
  NodeRole,
  NodeHealth,
  NodeSelectionCriteria
} from './nodes/types';
export { createNodesModule } from './nodes';

// Bridge module for cross-chain operations
export type {
  BridgeModule,
  BridgeProvider,
  BridgeRoute,
  BridgeOrder,
  BridgeOrderStatus,
  BridgeRouteQuery,
  BridgeQuote,
  BridgeStats,
  RouteSelectionPriority
} from './bridge/types';
export { createEnhancedBridgeModule } from './bridge/enhanced-bridge';

// Access control module
// export type { AccessPermission, AccessGuardStatus } from '../frontend-sdk/types';

// Re-export existing stable modules
export * from './core';
export * from './bridge/bridge-sdk';
export * from './auth/auth-sdk';

// Utility exports for SDK users
export {
  createSigner,
  importSigner,
  createClient,
  type Signer,
  type KeypairSigner,
  type RpcClient,
  SigAlg
} from './core';