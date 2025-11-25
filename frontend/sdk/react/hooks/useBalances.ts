/**
 * useBalances Hook
 *
 * Fetch token balances for an account.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWstf } from '../WstfProvider';
import type { TokenBalance } from '../../core/types';

export interface UseBalancesReturn {
  /** Token balances */
  data: TokenBalance[] | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch balances */
  refetch: () => Promise<void>;
  /** Get balance for specific token */
  getBalance: (tokenId: string) => TokenBalance | undefined;
}

export interface UseBalancesOptions {
  /** Auto-fetch on mount */
  enabled?: boolean;
  /** Refetch interval in ms */
  refetchInterval?: number;
}

/**
 * Hook for fetching token balances
 */
export function useBalances(
  address?: string,
  options: UseBalancesOptions = {}
): UseBalancesReturn {
  const { client, wallet } = useWstf();
  const { enabled = true, refetchInterval } = options;

  const targetAddress = address || wallet?.address;

  const [data, setData] = useState<TokenBalance[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetch = useCallback(async () => {
    if (!targetAddress) {
      setData(undefined);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const response = await client.getBalances(targetAddress);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch balances');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client, targetAddress]);

  useEffect(() => {
    if (enabled && targetAddress) {
      fetch();
    }
  }, [enabled, targetAddress, fetch]);

  useEffect(() => {
    if (!refetchInterval || !enabled || !targetAddress) return;

    const interval = setInterval(fetch, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval, enabled, targetAddress, fetch]);

  const getBalance = useCallback(
    (tokenId: string): TokenBalance | undefined => {
      return data?.find((b) => b.tokenId === tokenId);
    },
    [data]
  );

  return {
    data,
    loading,
    error,
    refetch: fetch,
    getBalance,
  };
}
