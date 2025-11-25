/**
 * Bridge hooks for @wasserstoff/wstf-kit
 *
 * React hooks for bridge routes, orders, and cross-chain operations.
 */

import { useState, useEffect } from 'react';
import { useWstfContext } from '../providers/WstfProvider';
import type {
  BridgeRoute,
  BridgeOrder,
  BridgeProvider,
  BridgeRouteQuery,
  BridgeQuote,
  BridgeStats,
  RouteSelectionPriority,
  ChainId,
  UseQueryResult,
  UseMutationResult,
} from '../types';

/**
 * Hook to get bridge routes
 */
export function useBridgeRoutes(params: {
  srcChain: ChainId;
  dstChain: ChainId;
  token: string;
  minAmount?: bigint;
  enabled?: boolean;
}): UseQueryResult<BridgeRoute[]> & {
  pickBest: (priority: RouteSelectionPriority, amount?: bigint) => BridgeRoute | null;
} {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<BridgeRoute[] | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = params.enabled !== false;

  const fetchRoutes = async () => {
    if (!sdk || !enabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const query: BridgeRouteQuery = {
        srcChain: params.srcChain,
        dstChain: params.dstChain,
        token: params.token,
        minAmount: params.minAmount,
      };

      const routes = await sdk.bridge.listRoutes(query);
      setData(routes);
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, [sdk, params.srcChain, params.dstChain, params.token, params.minAmount, enabled]);

  const pickBest = (priority: RouteSelectionPriority, amount?: bigint) => {
    if (!sdk || !data) return null;
    return sdk.bridge.pickBestRoute(data, priority, amount);
  };

  return {
    data,
    loading,
    error,
    refetch: fetchRoutes,
    pickBest,
  };
}

/**
 * Hook to get a specific bridge order
 */
export function useBridgeOrder(orderId?: string): UseQueryResult<BridgeOrder> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<BridgeOrder | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async () => {
    if (!sdk || !orderId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const order = await sdk.bridge.getOrder(orderId);
      setData(order || undefined);
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [sdk, orderId]);

  return {
    data,
    loading,
    error,
    refetch: fetchOrder,
  };
}

/**
 * Hook to get user's bridge orders
 */
export function useUserBridgeOrders(
  userAddress?: string,
  limit = 50
): UseQueryResult<BridgeOrder[]> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<BridgeOrder[] | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    if (!sdk || !userAddress) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const orders = await sdk.bridge.listUserOrders(userAddress, limit);
      setData(orders);
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [sdk, userAddress, limit]);

  return {
    data,
    loading,
    error,
    refetch: fetchOrders,
  };
}

/**
 * Hook to get bridge providers
 */
export function useBridgeProviders(): UseQueryResult<BridgeProvider[]> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<BridgeProvider[] | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = async () => {
    if (!sdk) return;

    try {
      setLoading(true);
      setError(null);
      const providers = await sdk.bridge.listProviders();
      setData(providers);
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [sdk]);

  return {
    data,
    loading,
    error,
    refetch: fetchProviders,
  };
}

/**
 * Hook to get bridge quotes
 */
export function useBridgeQuote(
  routeId?: string,
  amount?: bigint,
  enabled = true
): UseQueryResult<BridgeQuote> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<BridgeQuote | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = async () => {
    if (!sdk || !routeId || !amount || !enabled) {
      setData(undefined);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const quote = await sdk.bridge.getQuote(routeId, amount);
      setData(quote);
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
  }, [sdk, routeId, amount?.toString(), enabled]);

  return {
    data,
    loading,
    error,
    refetch: fetchQuote,
  };
}

/**
 * Hook to create bridge orders
 */
export function useBridgeOrder(): UseMutationResult<
  { orderId: string; txId: string },
  {
    routeId: string;
    userAddress: string;
    srcAmount: bigint;
    dstMinAmount?: bigint;
    dstAddress: string;
    metadata?: Record<string, any>;
  }
> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<{ orderId: string; txId: string } | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (variables: {
    routeId: string;
    userAddress: string;
    srcAmount: bigint;
    dstMinAmount?: bigint;
    dstAddress: string;
    metadata?: Record<string, any>;
  }) => {
    if (!sdk) {
      throw new Error('SDK not available');
    }

    setLoading(true);
    setError(null);

    try {
      const result = await sdk.bridge.openOrder(variables);
      setData(result);
      return result;
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setData(undefined);
    setError(null);
  };

  return {
    mutate,
    data,
    loading,
    error,
    reset,
  };
}

/**
 * Hook to get bridge statistics
 */
export function useBridgeStats(): UseQueryResult<BridgeStats> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<BridgeStats | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!sdk) return;

    try {
      setLoading(true);
      setError(null);
      const stats = await sdk.bridge.getBridgeStats();
      setData(stats);
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [sdk]);

  return {
    data,
    loading,
    error,
    refetch: fetchStats,
  };
}

/**
 * Hook for route selection helper
 */
export function useRouteSelection(routes: BridgeRoute[] | undefined) {
  const { sdk } = useWstfContext();

  const selectBestRoute = (priority: RouteSelectionPriority, amount?: bigint) => {
    if (!sdk || !routes || routes.length === 0) return null;
    return sdk.bridge.pickBestRoute(routes, priority, amount);
  };

  const getCostComparison = (amount?: bigint) => {
    if (!routes || !amount) return [];

    return routes.map(route => {
      const fee = (amount * BigInt(route.feeBps)) / 10000n;
      return {
        route,
        fee,
        feePercent: route.feeBps / 100,
        estimatedTime: route.estimatedTimeSec,
        trustScore: route.trustScore,
      };
    }).sort((a, b) => Number(a.fee - b.fee));
  };

  return {
    selectBestRoute,
    getCostComparison,
  };
}