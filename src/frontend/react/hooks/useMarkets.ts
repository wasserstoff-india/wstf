/**
 * useMarkets Hook
 *
 * Fetch market data including orderbook and trades.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWstf } from '../WstfProvider';
import type { OrderbookSnapshot, TradeInfo } from '../../core/types';

// ============================================================
// useOrderbook
// ============================================================

export interface UseOrderbookReturn {
  /** Orderbook data */
  data: OrderbookSnapshot | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch orderbook */
  refetch: () => Promise<void>;
  /** Best bid price */
  bestBid: bigint | undefined;
  /** Best ask price */
  bestAsk: bigint | undefined;
  /** Spread */
  spread: bigint | undefined;
}

export interface UseOrderbookOptions {
  /** Orderbook depth */
  depth?: number;
  /** Auto-fetch on mount */
  enabled?: boolean;
  /** Refetch interval in ms */
  refetchInterval?: number;
}

/**
 * Hook for fetching orderbook data
 */
export function useOrderbook(
  marketId: string,
  options: UseOrderbookOptions = {}
): UseOrderbookReturn {
  const { client } = useWstf();
  const { depth = 20, enabled = true, refetchInterval } = options;

  const [data, setData] = useState<OrderbookSnapshot | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetch = useCallback(async () => {
    if (!marketId) return;

    setLoading(true);
    setError(undefined);

    try {
      const response = await client.getOrderbook(marketId, depth);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch orderbook');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client, marketId, depth]);

  useEffect(() => {
    if (enabled && marketId) {
      fetch();
    }
  }, [enabled, marketId, fetch]);

  useEffect(() => {
    if (!refetchInterval || !enabled || !marketId) return;

    const interval = setInterval(fetch, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval, enabled, marketId, fetch]);

  const bestBid = data?.bids[0]?.price;
  const bestAsk = data?.asks[0]?.price;
  const spread = bestBid && bestAsk ? bestAsk - bestBid : undefined;

  return {
    data,
    loading,
    error,
    refetch: fetch,
    bestBid,
    bestAsk,
    spread,
  };
}

// ============================================================
// useTrades
// ============================================================

export interface UseTradesReturn {
  /** Recent trades */
  data: TradeInfo[] | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch trades */
  refetch: () => Promise<void>;
}

export interface UseTradesOptions {
  /** Number of trades to fetch */
  limit?: number;
  /** Auto-fetch on mount */
  enabled?: boolean;
  /** Refetch interval in ms */
  refetchInterval?: number;
}

/**
 * Hook for fetching recent trades
 */
export function useTrades(
  marketId: string,
  options: UseTradesOptions = {}
): UseTradesReturn {
  const { client } = useWstf();
  const { limit = 50, enabled = true, refetchInterval } = options;

  const [data, setData] = useState<TradeInfo[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetch = useCallback(async () => {
    if (!marketId) return;

    setLoading(true);
    setError(undefined);

    try {
      const response = await client.getTrades(marketId, limit);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch trades');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client, marketId, limit]);

  useEffect(() => {
    if (enabled && marketId) {
      fetch();
    }
  }, [enabled, marketId, fetch]);

  useEffect(() => {
    if (!refetchInterval || !enabled || !marketId) return;

    const interval = setInterval(fetch, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval, enabled, marketId, fetch]);

  return {
    data,
    loading,
    error,
    refetch: fetch,
  };
}

// ============================================================
// useMarketList
// ============================================================

export interface MarketListItem {
  marketId: string;
  baseToken: string;
  quoteToken: string;
  status: string;
}

export interface UseMarketListReturn {
  /** List of markets */
  data: MarketListItem[] | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | undefined;
  /** Refetch market list */
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching all markets
 */
export function useMarketList(): UseMarketListReturn {
  const { client } = useWstf();

  const [data, setData] = useState<MarketListItem[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const response = await client.listMarkets();
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to fetch markets');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    data,
    loading,
    error,
    refetch: fetch,
  };
}
