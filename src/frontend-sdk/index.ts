/**
 * @wasserstoff/wstf-kit - WSTFChain Frontend SDK v1.0
 *
 * React hooks, components, and utilities for building dapps, wallets,
 * and gated UIs on WSTFChain.
 *
 * @example
 * ```typescript
 * import { WstfProvider, BridgeForm, ProtectedPage } from '@wasserstoff/wstf-kit';
 *
 * function App() {
 *   return (
 *     <WstfProvider network="testnet" autoConnect={true}>
 *       <div>
 *         <NetworkSwitcher showLabel={true} />
 *         <ConnectWallet />
 *
 *         <BridgeForm
 *           supportedChains={['bsc', 'polygon', 'eth']}
 *           onBridgeSubmit={handleBridge}
 *         />
 *
 *         <ProtectedPage orgId="my.app" permission="premium">
 *           <PremiumFeatures />
 *         </ProtectedPage>
 *       </div>
 *     </WstfProvider>
 *   );
 * }
 * ```
 */

// ============================================================================
// STABLE FRONTEND SDK 1.0 EXPORTS
// ============================================================================

// Core Provider (required for all functionality)
export { WstfProvider, useWstfContext, useWstfClient, useWallet } from './providers/WstfProvider';

// Network & Infrastructure Hooks
export {
  useNetwork,
  useClusterInfo,
  useNodes,
  useNetworkHealth,
  useNetworkStats
} from './hooks/useNetwork';

// Bridge Hooks
export {
  useBridgeRoutes,
  useBridgeOrder,
  useUserBridgeOrders,
  useBridgeProviders,
  useBridgeQuote,
  useBridgeStats,
  useRouteSelection
} from './hooks/useBridge';

// Access Control Hooks
export {
  useAccessGuard,
  useOrgMembership,
  usePermissionCheck,
  useAccessibleResources,
  useAuthToken
} from './hooks/useAccess';

// Ready-to-Use Components
export { NetworkSwitcher, NetworkSwitcherSource } from './components/NetworkSwitcher';
export { ConnectWallet } from './components/ConnectWallet';
export { BridgeForm, BridgeFormSource } from './components/BridgeForm';
export { BridgeRouteTable, BridgeRouteTableSource } from './components/BridgeRouteTable';
export { BridgeOrderStatus, BridgeOrderStatusSource } from './components/BridgeOrderStatus';
export { ProtectedPage, ProtectedPageSource, withProtection } from './components/ProtectedPage';
export { NodeStatusList, NodeStatusListSource } from './components/NodeStatusList';

// Types (re-exported from stable backend SDK)
export type {
  // Network types
  NetworkName,
  NetworkProfile,
  ClusterInfo,
  ChainId,

  // Node types
  NodeInfo,
  NodeRole,
  NodeHealth,

  // Bridge types
  BridgeProvider,
  BridgeRoute,
  BridgeOrder,
  BridgeOrderStatus,
  BridgeRouteQuery,
  BridgeQuote,
  BridgeStats,
  RouteSelectionPriority,

  // Frontend-specific types
  WalletAccount,
  WalletConnection,
  AccessPermission,
  AccessGuardStatus,
  ComponentStyleProps,
  UseQueryResult,
  UseMutationResult
} from './types';