/**
 * useExplorer Hook
 *
 * Fetch blocks and transactions from the chain explorer.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWstf } from '../WstfProvider';
import type { BlockInfo, TransactionInfo } from '../../core/types';

// ============================================================
// useLatestBlocks
// ============================================================

export interface UseLatestBlocksReturn {
  /** Latest blocks */
  data: BlockInfo[] | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch blocks */
  refetch: () => Promise<void>;
}

export interface UseLatestBlocksOptions {
  /** Number of blocks to fetch */
  limit?: number;
  /** Auto-fetch on mount */
  enabled?: boolean;
  /** Refetch interval in ms */
  refetchInterval?: number;
}

/**
 * Hook for fetching latest blocks
 */
export function useLatestBlocks(
  options: UseLatestBlocksOptions = {}
): UseLatestBlocksReturn {
  const { client } = useWstf();
  const { limit = 10, enabled = true, refetchInterval } = options;

  const [data, setData] = useState<BlockInfo[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const response = await client.getLatestBlocks(limit);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch blocks');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client, limit]);

  useEffect(() => {
    if (enabled) {
      fetch();
    }
  }, [enabled, fetch]);

  useEffect(() => {
    if (!refetchInterval || !enabled) return;

    const interval = setInterval(fetch, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval, enabled, fetch]);

  return {
    data,
    loading,
    error,
    refetch: fetch,
  };
}

// ============================================================
// useBlock
// ============================================================

export interface UseBlockReturn {
  /** Block data */
  data: BlockInfo | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch block */
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching a specific block
 */
export function useBlock(height: bigint | number | undefined): UseBlockReturn {
  const { client } = useWstf();

  const [data, setData] = useState<BlockInfo | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetch = useCallback(async () => {
    if (height === undefined) return;

    setLoading(true);
    setError(undefined);

    try {
      const response = await client.getBlock(height);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch block');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client, height]);

  useEffect(() => {
    if (height !== undefined) {
      fetch();
    }
  }, [height, fetch]);

  return {
    data,
    loading,
    error,
    refetch: fetch,
  };
}

// ============================================================
// useLatestTransactions
// ============================================================

export interface UseLatestTransactionsReturn {
  /** Latest transactions */
  data: TransactionInfo[] | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch transactions */
  refetch: () => Promise<void>;
}

export interface UseLatestTransactionsOptions {
  /** Number of transactions to fetch */
  limit?: number;
  /** Auto-fetch on mount */
  enabled?: boolean;
  /** Refetch interval in ms */
  refetchInterval?: number;
}

/**
 * Hook for fetching latest transactions
 */
export function useLatestTransactions(
  options: UseLatestTransactionsOptions = {}
): UseLatestTransactionsReturn {
  const { client } = useWstf();
  const { limit = 10, enabled = true, refetchInterval } = options;

  const [data, setData] = useState<TransactionInfo[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const response = await client.getLatestTransactions(limit);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch transactions');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client, limit]);

  useEffect(() => {
    if (enabled) {
      fetch();
    }
  }, [enabled, fetch]);

  useEffect(() => {
    if (!refetchInterval || !enabled) return;

    const interval = setInterval(fetch, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval, enabled, fetch]);

  return {
    data,
    loading,
    error,
    refetch: fetch,
  };
}

// ============================================================
// useTransaction
// ============================================================

export interface UseTransactionReturn {
  /** Transaction data */
  data: TransactionInfo | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch transaction */
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching a specific transaction
 */
export function useTransaction(txId: string | undefined): UseTransactionReturn {
  const { client } = useWstf();

  const [data, setData] = useState<TransactionInfo | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetch = useCallback(async () => {
    if (!txId) return;

    setLoading(true);
    setError(undefined);

    try {
      const response = await client.getTransaction(txId);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch transaction');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client, txId]);

  useEffect(() => {
    if (txId) {
      fetch();
    }
  }, [txId, fetch]);

  return {
    data,
    loading,
    error,
    refetch: fetch,
  };
}

// ============================================================
// useChainStatus
// ============================================================

export interface ChainStatus {
  chainId: string;
  latestBlock: bigint;
  latestBlockHash: string;
  nodeVersion: string;
}

export interface UseChainStatusReturn {
  /** Chain status */
  data: ChainStatus | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Whether chain is healthy */
  isHealthy: boolean;
  /** Refetch status */
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching chain status
 */
export function useChainStatus(
  options: { refetchInterval?: number } = {}
): UseChainStatusReturn {
  const { client } = useWstf();
  const { refetchInterval } = options;

  const [data, setData] = useState<ChainStatus | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isHealthy, setIsHealthy] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const [statusResponse, healthy] = await Promise.all([
        client.getChainStatus(),
        client.healthCheck(),
      ]);

      setIsHealthy(healthy);

      if (statusResponse.success && statusResponse.data) {
        setData(statusResponse.data as ChainStatus);
      } else {
        setError(statusResponse.error || 'Failed to fetch status');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setIsHealthy(false);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!refetchInterval) return;

    const interval = setInterval(fetch, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval, fetch]);

  return {
    data,
    loading,
    error,
    isHealthy,
    refetch: fetch,
  };
}
