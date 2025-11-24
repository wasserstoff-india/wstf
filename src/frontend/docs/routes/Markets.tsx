/**
 * Markets Page
 *
 * Documentation for market components.
 */

import React, { useState } from 'react';
import {
  Orderbook,
  OrderbookSource,
  TradesTable,
  TradesTableSource,
  LpGridPreview,
  LpGridPreviewSource,
} from '../../components/Markets';
import { Section, SectionCard, SectionGrid, CodePreview } from '../components';

// ============================================================
// Component
// ============================================================

export const MarketsPage: React.FC = () => {
  const [showCode, setShowCode] = useState<string | null>(null);
  const [marketConfig, setMarketConfig] = useState({
    baseAsset: 'WCO',
    quoteAsset: 'USDC',
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white">Market Components</h1>
        <p className="mt-1 text-sm text-slate-400">
          Order book, trades, and liquidity visualization components.
        </p>
      </div>

      {/* Market Selector */}
      <Section title="Demo Market">
        <div className="flex gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Base Asset</label>
            <input
              value={marketConfig.baseAsset}
              onChange={(e) => setMarketConfig({ ...marketConfig, baseAsset: e.target.value })}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Quote Asset</label>
            <input
              value={marketConfig.quoteAsset}
              onChange={(e) => setMarketConfig({ ...marketConfig, quoteAsset: e.target.value })}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>
        </div>
      </Section>

      {/* Orderbook */}
      <Section
        title="Orderbook"
        description="Display order book with bid/ask levels."
      >
        <SectionGrid>
          <Orderbook
            baseAsset={marketConfig.baseAsset}
            quoteAsset={marketConfig.quoteAsset}
            depth={8}
            onPriceClick={(price, side) => console.log(`${side}: ${price}`)}
          />
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Props</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="text-blue-400">baseAsset</code>
                <span className="text-slate-500">string (required)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">quoteAsset</code>
                <span className="text-slate-500">string (required)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">depth</code>
                <span className="text-slate-500">number (default: 10)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">onPriceClick</code>
                <span className="text-slate-500">(price, side) =&gt; void</span>
              </div>
            </div>
            <h4 className="text-sm font-medium text-white mt-4 mb-2">Features</h4>
            <ul className="space-y-1 text-sm text-slate-400">
              <li>+ Depth visualization bars</li>
              <li>+ Spread display</li>
              <li>+ Click to fill price</li>
              <li>+ Auto-refresh support</li>
            </ul>
            <button
              onClick={() => setShowCode(showCode === 'orderbook' ? null : 'orderbook')}
              className="mt-4 text-xs text-blue-400 hover:text-blue-300"
            >
              {showCode === 'orderbook' ? 'Hide Code' : 'View Code'}
            </button>
          </SectionCard>
        </SectionGrid>
        {showCode === 'orderbook' && <CodePreview code={OrderbookSource} language="tsx" />}
      </Section>

      {/* TradesTable */}
      <Section
        title="TradesTable"
        description="Recent trades for a market pair."
      >
        <SectionGrid>
          <TradesTable
            baseAsset={marketConfig.baseAsset}
            quoteAsset={marketConfig.quoteAsset}
            limit={10}
          />
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Props</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="text-blue-400">baseAsset</code>
                <span className="text-slate-500">string (required)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">quoteAsset</code>
                <span className="text-slate-500">string (required)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">limit</code>
                <span className="text-slate-500">number (default: 20)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">showTime</code>
                <span className="text-slate-500">boolean (default: true)</span>
              </div>
            </div>
            <button
              onClick={() => setShowCode(showCode === 'trades' ? null : 'trades')}
              className="mt-4 text-xs text-blue-400 hover:text-blue-300"
            >
              {showCode === 'trades' ? 'Hide Code' : 'View Code'}
            </button>
          </SectionCard>
        </SectionGrid>
        {showCode === 'trades' && <CodePreview code={TradesTableSource} language="tsx" />}
      </Section>

      {/* LpGridPreview */}
      <Section
        title="LpGridPreview"
        description="Visualize LP grid distribution before deployment."
      >
        <SectionGrid>
          <LpGridPreview
            baseAsset={marketConfig.baseAsset}
            quoteAsset={marketConfig.quoteAsset}
            midPrice={50}
            rangePercent={10}
            gridLevels={5}
            totalLiquidity={10000}
            distribution="concentrated"
          />
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Props</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="text-blue-400">midPrice</code>
                <span className="text-slate-500">number</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">rangePercent</code>
                <span className="text-slate-500">number</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">gridLevels</code>
                <span className="text-slate-500">number</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">totalLiquidity</code>
                <span className="text-slate-500">number</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">distribution</code>
                <span className="text-slate-500">'uniform' | 'concentrated' | 'bell'</span>
              </div>
            </div>
            <button
              onClick={() => setShowCode(showCode === 'lpgrid' ? null : 'lpgrid')}
              className="mt-4 text-xs text-blue-400 hover:text-blue-300"
            >
              {showCode === 'lpgrid' ? 'Hide Code' : 'View Code'}
            </button>
          </SectionCard>
        </SectionGrid>
        {showCode === 'lpgrid' && <CodePreview code={LpGridPreviewSource} language="tsx" />}
      </Section>

      {/* useMarkets Hook */}
      <Section
        title="Market Hooks"
        description="React hooks for market data."
      >
        <CodePreview
          code={`import {
  useMarkets,      // alias for useMarketList
  useMarketList,
  useOrderbook,
  useTrades,
} from '@wasserstoff/wstf-kit/react';

function MarketView() {
  // List all markets
  const { data: markets } = useMarkets();

  // Get orderbook for specific market
  const { data: orderbook } = useOrderbook({
    baseAsset: 'WCO',
    quoteAsset: 'USDC',
    depth: 20,
  });

  // Get recent trades
  const { data: trades } = useTrades({
    baseAsset: 'WCO',
    quoteAsset: 'USDC',
    limit: 50,
  });

  return (
    <div>
      <p>Markets: {markets?.length}</p>
      <p>Best Bid: {orderbook?.bids[0]?.price}</p>
      <p>Best Ask: {orderbook?.asks[0]?.price}</p>
      <p>Recent Trades: {trades?.length}</p>
    </div>
  );
}`}
          language="tsx"
        />
      </Section>
    </div>
  );
};
