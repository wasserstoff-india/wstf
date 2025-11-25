/**
 * TradesTable Component
 *
 * Displays recent trades for a market pair.
 */

import React, { useMemo } from 'react';
import { useMarkets } from '../../react/hooks';

// ============================================================
// Types
// ============================================================

export interface TradesTableProps {
  /** Base asset (e.g., 'BTC') */
  baseAsset: string;
  /** Quote asset (e.g., 'USD') */
  quoteAsset: string;
  /** Maximum number of trades to show (default: 20) */
  limit?: number;
  /** Additional CSS classes */
  className?: string;
  /** Show timestamp column (default: true) */
  showTime?: boolean;
}

interface Trade {
  id: string;
  price: string;
  quantity: string;
  side: 'buy' | 'sell';
  timestamp: number;
}

// ============================================================
// Helpers
// ============================================================

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ============================================================
// Component
// ============================================================

export const TradesTable: React.FC<TradesTableProps> = ({
  baseAsset,
  quoteAsset,
  limit = 20,
  className = '',
  showTime = true,
}) => {
  const { data: markets, isLoading } = useMarkets();

  // Find market and get trades
  const trades = useMemo(() => {
    if (!markets) return [];
    const market = markets.find(
      (m) => m.base_asset === baseAsset && m.quote_asset === quoteAsset
    );
    if (!market || !market.recent_trades) return [];
    return (market.recent_trades as Trade[]).slice(0, limit);
  }, [markets, baseAsset, quoteAsset, limit]);

  if (isLoading) {
    return (
      <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-medium text-slate-900">Recent Trades</h3>
        </div>
        <div className="p-8 flex justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">Recent Trades</h3>
          <span className="text-xs text-slate-500">
            {baseAsset}/{quoteAsset}
          </span>
        </div>
      </div>

      {/* Column Headers */}
      <div
        className={`grid px-4 py-2 text-xs text-slate-500 border-b border-slate-100 ${
          showTime ? 'grid-cols-4' : 'grid-cols-3'
        }`}
      >
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
        {showTime && <span className="text-right">Time</span>}
      </div>

      {/* Trades List */}
      {trades.length > 0 ? (
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
          {trades.map((trade, index) => {
            const total = parseFloat(trade.price) * parseFloat(trade.quantity);
            const isBuy = trade.side === 'buy';

            return (
              <div
                key={trade.id || index}
                className={`grid px-4 py-1.5 text-sm ${
                  showTime ? 'grid-cols-4' : 'grid-cols-3'
                }`}
              >
                <span className={`font-mono ${isBuy ? 'text-green-600' : 'text-red-600'}`}>
                  {trade.price}
                </span>
                <span className="text-right font-mono text-slate-700">{trade.quantity}</span>
                <span className="text-right font-mono text-slate-500">{total.toFixed(2)}</span>
                {showTime && (
                  <span className="text-right text-slate-400">
                    {formatTime(trade.timestamp)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-slate-500 text-sm">
          No recent trades
        </div>
      )}
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const TradesTableSource = `
import React from 'react';
import { useMarkets } from '@wasserstoff/wstf-kit/react';

interface TradesTableProps {
  baseAsset: string;
  quoteAsset: string;
  limit?: number;
}

export const TradesTable: React.FC<TradesTableProps> = ({
  baseAsset,
  quoteAsset,
  limit = 20,
}) => {
  const { data: markets } = useMarkets();

  const market = markets?.find(
    (m) => m.base_asset === baseAsset && m.quote_asset === quoteAsset
  );
  const trades = market?.recent_trades?.slice(0, limit) || [];

  return (
    <div className="bg-white border rounded-lg">
      <div className="px-4 py-3 border-b">
        <h3 className="font-medium">Recent Trades</h3>
      </div>

      <div className="grid grid-cols-4 px-4 py-2 text-xs text-slate-500">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
        <span className="text-right">Time</span>
      </div>

      {trades.map((trade, i) => (
        <div key={i} className="grid grid-cols-4 px-4 py-1 text-sm">
          <span className={trade.side === 'buy' ? 'text-green-600' : 'text-red-600'}>
            {trade.price}
          </span>
          <span className="text-right">{trade.quantity}</span>
          <span className="text-right text-slate-500">
            {(parseFloat(trade.price) * parseFloat(trade.quantity)).toFixed(2)}
          </span>
          <span className="text-right text-slate-400">
            {new Date(trade.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
};
`.trim();
