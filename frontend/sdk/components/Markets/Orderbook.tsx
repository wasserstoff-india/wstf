/**
 * Orderbook Component
 *
 * Displays order book with bids and asks for a market pair.
 */

import React, { useMemo } from 'react';
import { useMarkets } from '../../react/hooks';

// ============================================================
// Types
// ============================================================

export interface OrderbookProps {
  /** Base asset (e.g., 'BTC') */
  baseAsset: string;
  /** Quote asset (e.g., 'USD') */
  quoteAsset: string;
  /** Number of price levels to show (default: 10) */
  depth?: number;
  /** Additional CSS classes */
  className?: string;
  /** Callback when price is clicked */
  onPriceClick?: (price: string, side: 'bid' | 'ask') => void;
}

interface OrderLevel {
  price: string;
  quantity: string;
  total: string;
  percentage: number;
}

// ============================================================
// Component
// ============================================================

export const Orderbook: React.FC<OrderbookProps> = ({
  baseAsset,
  quoteAsset,
  depth = 10,
  className = '',
  onPriceClick,
}) => {
  const { data: markets, isLoading } = useMarkets();

  // Find the market
  const market = useMemo(() => {
    if (!markets) return null;
    return markets.find(
      (m) =>
        m.base_asset === baseAsset && m.quote_asset === quoteAsset
    );
  }, [markets, baseAsset, quoteAsset]);

  // Process bids and asks
  const { bids, asks, spread, spreadPercent } = useMemo(() => {
    if (!market) {
      return { bids: [], asks: [], spread: '0', spreadPercent: '0' };
    }

    const processOrders = (
      orders: Array<{ price: string; quantity: string }>,
      isBid: boolean
    ): OrderLevel[] => {
      // Sort: bids descending, asks ascending
      const sorted = [...orders].sort((a, b) => {
        const diff = parseFloat(a.price) - parseFloat(b.price);
        return isBid ? -diff : diff;
      });

      const limited = sorted.slice(0, depth);
      const maxTotal = limited.reduce(
        (sum, o) => sum + parseFloat(o.price) * parseFloat(o.quantity),
        0
      );

      let cumulative = 0;
      return limited.map((order) => {
        const total = parseFloat(order.price) * parseFloat(order.quantity);
        cumulative += total;
        return {
          price: order.price,
          quantity: order.quantity,
          total: total.toFixed(2),
          percentage: maxTotal > 0 ? (cumulative / maxTotal) * 100 : 0,
        };
      });
    };

    const bids = processOrders(market.bids || [], true);
    const asks = processOrders(market.asks || [], false);

    // Calculate spread
    const bestBid = bids[0]?.price ? parseFloat(bids[0].price) : 0;
    const bestAsk = asks[0]?.price ? parseFloat(asks[0].price) : 0;
    const spreadVal = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
    const spreadPct = bestBid > 0 ? ((spreadVal / bestBid) * 100).toFixed(2) : '0';

    return {
      bids,
      asks: asks.reverse(), // Reverse to show asks from low to high visually
      spread: spreadVal.toFixed(2),
      spreadPercent: spreadPct,
    };
  }, [market, depth]);

  if (isLoading) {
    return (
      <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-medium text-slate-900">Order Book</h3>
        </div>
        <div className="p-8 flex justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full" />
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-medium text-slate-900">Order Book</h3>
        </div>
        <div className="p-8 text-center text-slate-500">
          Market {baseAsset}/{quoteAsset} not found
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">
            {baseAsset}/{quoteAsset}
          </h3>
          <span className="text-xs text-slate-500">
            Spread: {spread} ({spreadPercent}%)
          </span>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-4 py-2 text-xs text-slate-500 border-b border-slate-100">
        <span>Price ({quoteAsset})</span>
        <span className="text-right">Size ({baseAsset})</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (sells) */}
      <div className="divide-y divide-slate-50">
        {asks.map((level, index) => (
          <button
            key={`ask-${index}`}
            onClick={() => onPriceClick?.(level.price, 'ask')}
            className="w-full grid grid-cols-3 px-4 py-1.5 text-sm hover:bg-red-50 transition-colors relative group"
          >
            {/* Depth visualization */}
            <div
              className="absolute inset-y-0 right-0 bg-red-50 opacity-50 group-hover:opacity-70 transition-opacity"
              style={{ width: `${level.percentage}%` }}
            />
            <span className="text-red-600 font-mono relative">{level.price}</span>
            <span className="text-right text-slate-700 font-mono relative">{level.quantity}</span>
            <span className="text-right text-slate-500 font-mono relative">{level.total}</span>
          </button>
        ))}
      </div>

      {/* Spread Indicator */}
      <div className="px-4 py-2 bg-slate-50 border-y border-slate-100">
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="font-medium text-slate-900">{asks[asks.length - 1]?.price || '—'}</span>
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          <span className="font-medium text-slate-900">{bids[0]?.price || '—'}</span>
        </div>
      </div>

      {/* Bids (buys) */}
      <div className="divide-y divide-slate-50">
        {bids.map((level, index) => (
          <button
            key={`bid-${index}`}
            onClick={() => onPriceClick?.(level.price, 'bid')}
            className="w-full grid grid-cols-3 px-4 py-1.5 text-sm hover:bg-green-50 transition-colors relative group"
          >
            {/* Depth visualization */}
            <div
              className="absolute inset-y-0 right-0 bg-green-50 opacity-50 group-hover:opacity-70 transition-opacity"
              style={{ width: `${level.percentage}%` }}
            />
            <span className="text-green-600 font-mono relative">{level.price}</span>
            <span className="text-right text-slate-700 font-mono relative">{level.quantity}</span>
            <span className="text-right text-slate-500 font-mono relative">{level.total}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const OrderbookSource = `
import React from 'react';
import { useMarkets } from '@wasserstoff/wstf-kit/react';

interface OrderbookProps {
  baseAsset: string;
  quoteAsset: string;
  depth?: number;
}

export const Orderbook: React.FC<OrderbookProps> = ({
  baseAsset,
  quoteAsset,
  depth = 10,
}) => {
  const { data: markets } = useMarkets();

  const market = markets?.find(
    (m) => m.base_asset === baseAsset && m.quote_asset === quoteAsset
  );

  if (!market) return <div>Market not found</div>;

  return (
    <div className="bg-white border rounded-lg">
      <div className="px-4 py-3 border-b">
        <h3 className="font-medium">{baseAsset}/{quoteAsset}</h3>
      </div>

      {/* Asks */}
      {market.asks?.slice(0, depth).map((ask, i) => (
        <div key={i} className="grid grid-cols-3 px-4 py-1 text-sm">
          <span className="text-red-600">{ask.price}</span>
          <span className="text-right">{ask.quantity}</span>
          <span className="text-right text-slate-500">
            {(parseFloat(ask.price) * parseFloat(ask.quantity)).toFixed(2)}
          </span>
        </div>
      ))}

      {/* Bids */}
      {market.bids?.slice(0, depth).map((bid, i) => (
        <div key={i} className="grid grid-cols-3 px-4 py-1 text-sm">
          <span className="text-green-600">{bid.price}</span>
          <span className="text-right">{bid.quantity}</span>
          <span className="text-right text-slate-500">
            {(parseFloat(bid.price) * parseFloat(bid.quantity)).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
};
`.trim();
