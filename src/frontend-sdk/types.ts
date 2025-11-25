/**
 * Frontend SDK Types
 */

// Re-export core types from the main SDK
export type {
  NetworkName,
  NetworkProfile,
  ClusterInfo,
  ServiceCapabilities,
  ChainId,
} from '../sdk/types';

export type {
  NodeInfo,
  NodeRole,
  NodeHealth,
  NodeSelectionCriteria,
} from '../sdk/nodes/types';

export type {
  BridgeProvider,
  BridgeRoute,
  BridgeOrder,
  BridgeOrderStatus,
  BridgeRouteQuery,
  BridgeQuote,
  BridgeStats,
  RouteSelectionPriority,
} from '../sdk/bridge/types';

// Frontend-specific types
export interface WalletAccount {
  address: string;
  publicKey: string;
  sigAlg: 'ed25519' | 'secp256k1';
  balance?: bigint;
}

export interface WalletConnection {
  connected: boolean;
  account?: WalletAccount;
  connecting: boolean;
  error?: string;
}

export interface AccessPermission {
  orgId?: string;
  permission?: string;
  varKey?: string;
}

export interface AccessGuardStatus {
  allowed: boolean | null;
  loading: boolean;
  error?: string;
  address?: string;
}

export interface NetworkSwitchOptions {
  showLabel?: boolean;
  showChainId?: boolean;
  showLatency?: boolean;
  disabled?: boolean;
}

export interface BridgeFormData {
  srcChain: ChainId;
  dstChain: ChainId;
  token: string;
  amount: string;
  dstAddress: string;
  routeId?: string;
}

export interface ComponentStyleProps {
  className?: string;
  style?: React.CSSProperties;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData>;
  data: TData | undefined;
  loading: boolean;
  error: string | null;
  reset: () => void;
}