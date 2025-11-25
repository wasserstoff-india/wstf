/**
 * Network hooks for @wasserstoff/wstf-kit
 *
 * React hooks for network discovery, cluster information, and node monitoring.
 */

import { useState, useEffect } from 'react';
import { useWstfContext } from '../providers/WstfProvider';
import type {
  NetworkProfile,
  ClusterInfo,
  NodeInfo,
  NodeRole,
  UseQueryResult,
} from '../types';

/**
 * Hook to access network configuration and switching
 */
export function useNetwork() {
  const { networkProfile, switchNetwork, availableNetworks, loading, error } = useWstfContext();

  return {
    profile: networkProfile,
    availableNetworks,
    loading,
    error,
    switchNetwork,
  };
}

/**
 * Hook to get cluster information
 */
export function useClusterInfo(): UseQueryResult<ClusterInfo> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<ClusterInfo | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClusterInfo = async () => {
    if (!sdk) return;

    try {
      setLoading(true);
      setError(null);
      const clusterInfo = await sdk.network.getClusterInfo();
      setData(clusterInfo);
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClusterInfo();
  }, [sdk]);

  return {
    data,
    loading,
    error,
    refetch: fetchClusterInfo,
  };
}

/**
 * Hook to get nodes information
 */
export function useNodes(role?: NodeRole): UseQueryResult<NodeInfo[]> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<NodeInfo[] | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = async () => {
    if (!sdk) return;

    try {
      setLoading(true);
      setError(null);
      const nodes = await sdk.nodes.listKnownNodes(role);
      setData(nodes);
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, [sdk, role]);

  return {
    data,
    loading,
    error,
    refetch: fetchNodes,
  };
}

/**
 * Hook to monitor network health
 */
export function useNetworkHealth() {
  const { sdk } = useWstfContext();
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [latency, setLatency] = useState<number>(0);
  const [lastCheck, setLastCheck] = useState<number>(0);

  useEffect(() => {
    if (!sdk) return;

    const checkHealth = async () => {
      try {
        const result = await sdk.testConnectivity();
        setIsHealthy(result.healthy);
        setLatency(result.latencyMs);
        setLastCheck(Date.now());
      } catch (err) {
        setIsHealthy(false);
        setLatency(0);
        setLastCheck(Date.now());
      }
    };

    // Initial check
    checkHealth();

    // Check every 30 seconds
    const interval = setInterval(checkHealth, 30000);

    return () => clearInterval(interval);
  }, [sdk]);

  return {
    isHealthy,
    latency,
    lastCheck,
  };
}

/**
 * Hook to get network statistics
 */
export function useNetworkStats(): UseQueryResult<{
  height: bigint;
  peers: number;
  avgBlockTime: number;
  version: string;
}> {
  const { sdk } = useWstfContext();
  const [data, setData] = useState<{
    height: bigint;
    peers: number;
    avgBlockTime: number;
    version: string;
  } | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!sdk) return;

    try {
      setLoading(true);
      setError(null);

      // Get cluster info which includes these stats
      const clusterInfo = await sdk.network.getClusterInfo();

      setData({
        height: clusterInfo.height,
        peers: clusterInfo.peers,
        avgBlockTime: clusterInfo.avgBlockTimeMs,
        version: clusterInfo.version,
      });
    } catch (err) {
      setError(String(err));
      setData(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Refresh stats every 10 seconds
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [sdk]);

  return {
    data,
    loading,
    error,
    refetch: fetchStats,
  };
}