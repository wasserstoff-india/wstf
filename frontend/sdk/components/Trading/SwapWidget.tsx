/**
 * SwapWidget Component
 *
 * Simple swap interface for trading between two assets.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useWallet, useMarkets, useBalances } from '../../react/hooks';

// ============================================================
// Types
// ============================================================

export interface SwapWidgetProps {
  /** Market ID for the trading pair */
  marketId: string;
  /** Base asset symbol */
  baseAsset: string;
  /** Quote asset symbol */
  quoteAsset: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when swap is executed */
  onSwap?: (side: 'buy' | 'sell', amount: string, price: string) => void;
}

// ============================================================
// Component
// ============================================================

export const SwapWidget: React.FC<SwapWidgetProps> = ({
  marketId,
  baseAsset,
  quoteAsset,
  className = '',
  onSwap,
}) => {
  const { activeSigner } = useWallet();
  const { data: markets, isLoading: marketsLoading } = useMarkets();
  const { data: balances } = useBalances(activeSigner?.address);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Find market data
  const market = useMemo(() => {
    if (!markets) return null;
    return markets.find(
      (m) => m.base_asset === baseAsset && m.quote_asset === quoteAsset
    );
  }, [markets, baseAsset, quoteAsset]);

  // Get best bid/ask
  const topOfBook = useMemo(() => {
    if (!market) return null;
    const bestBid = market.bids?.[0];
    const bestAsk = market.asks?.[0];
    return {
      bestBidPrice: bestBid?.price || '0',
      bestAskPrice: bestAsk?.price || '0',
      spread: bestAsk && bestBid
        ? (parseFloat(bestAsk.price) - parseFloat(bestBid.price)).toFixed(4)
        : '0',
    };
  }, [market]);

  // Get user balances
  const userBalances = useMemo(() => {
    if (!balances) return { base: '0', quote: '0' };
    const baseBalance = balances.find((b) => b.asset === baseAsset);
    const quoteBalance = balances.find((b) => b.asset === quoteAsset);
    return {
      base: baseBalance?.balance || '0',
      quote: quoteBalance?.balance || '0',
    };
  }, [balances, baseAsset, quoteAsset]);

  // Calculate estimated output
  const estimate = useMemo(() => {
    if (!amount || !topOfBook) return null;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return null;

    if (side === 'buy') {
      // Buying base with quote
      const price = parseFloat(topOfBook.bestAskPrice);
      if (price <= 0) return null;
      return {
        input: `${amount} ${quoteAsset}`,
        output: `~${(amountNum / price).toFixed(6)} ${baseAsset}`,
        price: topOfBook.bestAskPrice,
        priceImpact: '< 0.1%', // Simplified
      };
    } else {
      // Selling base for quote
      const price = parseFloat(topOfBook.bestBidPrice);
      if (price <= 0) return null;
      return {
        input: `${amount} ${baseAsset}`,
        output: `~${(amountNum * price).toFixed(4)} ${quoteAsset}`,
        price: topOfBook.bestBidPrice,
        priceImpact: '< 0.1%',
      };
    }
  }, [amount, side, topOfBook, baseAsset, quoteAsset]);

  const handleSwap = useCallback(async () => {
    if (!amount || !topOfBook) return;
    setIsSubmitting(true);
    try {
      const price = side === 'buy' ? topOfBook.bestAskPrice : topOfBook.bestBidPrice;
      onSwap?.(side, amount, price);
      // In real implementation: await sdk.trading.marketOrder(...)
      setAmount('');
    } finally {
      setIsSubmitting(false);
    }
  }, [amount, side, topOfBook, onSwap]);

  const handleMaxClick = useCallback(() => {
    if (side === 'buy') {
      setAmount(userBalances.quote);
    } else {
      setAmount(userBalances.base);
    }
  }, [side, userBalances]);

  return (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">Swap</h3>
          {marketsLoading ? (
            <span className="text-xs text-slate-400">Loading...</span>
          ) : topOfBook ? (
            <span className="text-xs text-slate-500">
              Bid: {topOfBook.bestBidPrice} · Ask: {topOfBook.bestAskPrice}
            </span>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Side Toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setSide('buy')}
            className={`py-2 text-sm font-medium rounded-md transition-colors ${
              side === 'buy'
                ? 'bg-green-500 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Buy {baseAsset}
          </button>
          <button
            onClick={() => setSide('sell')}
            className={`py-2 text-sm font-medium rounded-md transition-colors ${
              side === 'sell'
                ? 'bg-red-500 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sell {baseAsset}
          </button>
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-slate-600">
              {side === 'buy' ? `Pay (${quoteAsset})` : `Sell (${baseAsset})`}
            </label>
            <button
              onClick={handleMaxClick}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Max: {side === 'buy' ? userBalances.quote : userBalances.base}
            </button>
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2.5 text-lg font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <div className="p-2 bg-slate-100 rounded-full">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>

        {/* Estimate */}
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-slate-600">
              {side === 'buy' ? `Receive (${baseAsset})` : `Receive (${quoteAsset})`}
            </span>
          </div>
          <p className="text-lg font-mono text-slate-900">
            {estimate?.output || '0.00'}
          </p>
        </div>

        {/* Details */}
        {estimate && (
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Price</span>
              <span>
                1 {baseAsset} = {estimate.price} {quoteAsset}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Price Impact</span>
              <span className="text-green-600">{estimate.priceImpact}</span>
            </div>
          </div>
        )}

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={!activeSigner || !amount || isSubmitting}
          className={`w-full py-3 rounded-lg font-medium transition-colors ${
            !activeSigner
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : side === 'buy'
              ? 'bg-green-500 text-white hover:bg-green-600 disabled:opacity-50'
              : 'bg-red-500 text-white hover:bg-red-600 disabled:opacity-50'
          }`}
        >
          {!activeSigner
            ? 'Connect Wallet'
            : isSubmitting
            ? 'Swapping...'
            : `Swap ${side === 'buy' ? quoteAsset : baseAsset} for ${side === 'buy' ? baseAsset : quoteAsset}`}
        </button>
      </div>
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const SwapWidgetSource = `
import React, { useState } from 'react';
import { useWallet, useMarkets, useBalances } from '@wasserstoff/wstf-kit/react';

interface SwapWidgetProps {
  marketId: string;
  baseAsset: string;
  quoteAsset: string;
}

export const SwapWidget: React.FC<SwapWidgetProps> = ({
  marketId,
  baseAsset,
  quoteAsset,
}) => {
  const { activeSigner } = useWallet();
  const { data: markets } = useMarkets();
  const { data: balances } = useBalances(activeSigner?.address);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');

  const market = markets?.find(
    (m) => m.base_asset === baseAsset && m.quote_asset === quoteAsset
  );

  const topOfBook = market ? {
    bestBid: market.bids?.[0]?.price || '0',
    bestAsk: market.asks?.[0]?.price || '0',
  } : null;

  const handleSwap = async () => {
    // Call SDK trading methods
    // await sdk.trading.marketBuy/marketSell(...)
  };

  return (
    <div className="bg-white border rounded-lg p-4 space-y-4">
      <div className="flex justify-between">
        <h3 className="font-medium">Swap</h3>
        <span className="text-xs text-slate-500">
          Bid: {topOfBook?.bestBid} · Ask: {topOfBook?.bestAsk}
        </span>
      </div>

      {/* Side Toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('buy')}
          className={\`py-2 rounded \${side === 'buy' ? 'bg-green-500 text-white' : 'bg-slate-100'}\`}
        >
          Buy {baseAsset}
        </button>
        <button
          onClick={() => setSide('sell')}
          className={\`py-2 rounded \${side === 'sell' ? 'bg-red-500 text-white' : 'bg-slate-100'}\`}
        >
          Sell {baseAsset}
        </button>
      </div>

      {/* Amount Input */}
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        className="w-full px-3 py-2 border rounded-lg"
      />

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={!activeSigner || !amount}
        className="w-full py-3 bg-blue-500 text-white rounded-lg disabled:opacity-50"
      >
        Swap
      </button>
    </div>
  );
};
`.trim();
