/**
 * useAccount Hook
 *
 * Fetch and cache account information.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWstf } from '../WstfProvider';
import type { AccountInfo } from '../../core/types';

export interface UseAccountReturn {
  /** Account data */
  data: AccountInfo | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch account data */
  refetch: () => Promise<void>;
}

export interface UseAccountOptions {
  /** Auto-fetch on mount */
  enabled?: boolean;
  /** Refetch interval in ms */
  refetchInterval?: number;
}

/**
 * Hook for fetching account information
 */
export function useAccount(
  address?: string,
  options: UseAccountOptions = {}
): UseAccountReturn {
  const { client, wallet } = useWstf();
  const { enabled = true, refetchInterval } = options;

  // Use provided address or current wallet address
  const targetAddress = address || wallet?.address;

  const [data, setData] = useState<AccountInfo | undefined>();
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
      const response = await client.getAccount(targetAddress);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch account');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client, targetAddress]);

  // Initial fetch
  useEffect(() => {
    if (enabled && targetAddress) {
      fetch();
    }
  }, [enabled, targetAddress, fetch]);

  // Refetch interval
  useEffect(() => {
    if (!refetchInterval || !enabled || !targetAddress) return;

    const interval = setInterval(fetch, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval, enabled, targetAddress, fetch]);

  return {
    data,
    loading,
    error,
    refetch: fetch,
  };
}
