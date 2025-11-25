/**
 * LP & Trading Page
 *
 * Create markets and seed liquidity pools.
 */

import React, { useState } from 'react';
import { useWallet } from '../../react/hooks';
import { LpGridPreview } from '../../components/Markets/LpGridPreview';
import { WalletOnboard } from '../../components/Wallet/WalletOnboard';
import { Section, SectionCard, SectionGrid, CodePreview } from '../components';

// ============================================================
// Source Code Export
// ============================================================

const CreateMarketSource = `
import React, { useState } from 'react';
import { useWstf, useWallet } from '@wasserstoff/wstf-kit/react';

interface CreateMarketFormData {
  baseToken: string;
  quoteToken: string;
  tickSize: string;
  lotSize: string;
  feeBps: string;
}

export function CreateMarketPage() {
  const { sdk } = useWstf();
  const { activeSigner } = useWallet();
  const [marketId, setMarketId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateMarketFormData>({
    baseToken: 'WCO',
    quoteToken: 'USDC',
    tickSize: '0.01',
    lotSize: '0.001',
    feeBps: '30',
  });

  async function handleCreate() {
    const res = await sdk.markets.createSpotMarket({
      baseTokenId: form.baseToken,
      quoteTokenId: form.quoteToken,
      tickSize: parseFloat(form.tickSize),
      lotSize: parseFloat(form.lotSize),
      feeBps: parseInt(form.feeBps),
    });
    setMarketId(res.marketId);
  }

  async function seedStableLp() {
    if (!marketId) return;
    await sdk.lp.preset.STABLE_PAIR({
      marketId,
      midPrice: 1.0,
      tvlBase: 10000,
      spreadBps: 10,
    });
  }

  async function seedVolatileLp() {
    if (!marketId) return;
    await sdk.lp.preset.VOLATILE_PAIR({
      marketId,
      midPrice: 50,
      tvlBase: 5000,
      rangePercent: 20,
    });
  }

  return (
    <div className="space-y-6">
      <h1>Create Market</h1>

      {/* Market Creation Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
        <input
          value={form.baseToken}
          onChange={(e) => setForm({ ...form, baseToken: e.target.value })}
          placeholder="Base Token"
        />
        <input
          value={form.quoteToken}
          onChange={(e) => setForm({ ...form, quoteToken: e.target.value })}
          placeholder="Quote Token"
        />
        <input
          value={form.tickSize}
          onChange={(e) => setForm({ ...form, tickSize: e.target.value })}
          placeholder="Tick Size"
        />
        <input
          value={form.lotSize}
          onChange={(e) => setForm({ ...form, lotSize: e.target.value })}
          placeholder="Lot Size"
        />
        <input
          value={form.feeBps}
          onChange={(e) => setForm({ ...form, feeBps: e.target.value })}
          placeholder="Fee (bps)"
        />
        <button type="submit">Create Market</button>
      </form>

      {/* LP Seeding */}
      {marketId && (
        <div>
          <p>Market Created: {marketId}</p>
          <button onClick={seedStableLp}>Seed Stable LP Grid</button>
          <button onClick={seedVolatileLp}>Seed Volatile LP Grid</button>
        </div>
      )}
    </div>
  );
}
`.trim();

// ============================================================
// Component
// ============================================================

export const LPAndTradingPage: React.FC = () => {
  const { activeSigner } = useWallet();
  const [showOnboard, setShowOnboard] = useState(false);

  // Form state
  const [form, setForm] = useState({
    baseToken: 'WCO',
    quoteToken: 'USDC',
    tickSize: '0.01',
    lotSize: '0.001',
    feeBps: '30',
  });

  // LP Preview state
  const [lpConfig, setLpConfig] = useState({
    midPrice: 50,
    rangePercent: 10,
    gridLevels: 5,
    totalLiquidity: 10000,
    distribution: 'concentrated' as const,
  });

  const [marketId, setMarketId] = useState<string | null>(null);

  const handleCreateMarket = () => {
    // Demo: generate a fake market ID
    setMarketId(`${form.baseToken}_${form.quoteToken}_${Date.now().toString(36)}`);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white">LP & Trading</h1>
        <p className="mt-1 text-sm text-slate-400">
          Create markets and seed liquidity pools with grid strategies.
        </p>
      </div>

      {/* Wallet Connection */}
      {!activeSigner && (
        <SectionCard>
          {showOnboard ? (
            <WalletOnboard
              onWalletCreated={() => setShowOnboard(false)}
              onWalletConnected={() => setShowOnboard(false)}
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">Connect a wallet to create markets.</p>
              <button
                onClick={() => setShowOnboard(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Connect Wallet
              </button>
            </div>
          )}
        </SectionCard>
      )}

      {/* Create Market Form */}
      <Section title="Create Spot Market" description="Deploy a new trading pair on-chain.">
        <SectionCard>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Base Token</label>
              <input
                value={form.baseToken}
                onChange={(e) => setForm({ ...form, baseToken: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="WCO"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Quote Token</label>
              <input
                value={form.quoteToken}
                onChange={(e) => setForm({ ...form, quoteToken: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="USDC"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fee (bps)</label>
              <input
                value={form.feeBps}
                onChange={(e) => setForm({ ...form, feeBps: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="30"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tick Size</label>
              <input
                value={form.tickSize}
                onChange={(e) => setForm({ ...form, tickSize: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="0.01"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Lot Size</label>
              <input
                value={form.lotSize}
                onChange={(e) => setForm({ ...form, lotSize: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="0.001"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleCreateMarket}
                disabled={!activeSigner}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Market
              </button>
            </div>
          </div>

          {marketId && (
            <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p className="text-sm text-emerald-400">
                Market created: <code className="font-mono">{marketId}</code>
              </p>
            </div>
          )}
        </SectionCard>
      </Section>

      {/* LP Grid Configuration */}
      <Section title="Seed LP Grid" description="Configure and preview liquidity distribution.">
        <SectionGrid>
          {/* Config */}
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-4">Grid Configuration</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Mid Price</label>
                <input
                  type="number"
                  value={lpConfig.midPrice}
                  onChange={(e) => setLpConfig({ ...lpConfig, midPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Range (+/- %)</label>
                <input
                  type="number"
                  value={lpConfig.rangePercent}
                  onChange={(e) => setLpConfig({ ...lpConfig, rangePercent: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Grid Levels (per side)</label>
                <input
                  type="number"
                  value={lpConfig.gridLevels}
                  onChange={(e) => setLpConfig({ ...lpConfig, gridLevels: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Total Liquidity ({form.baseToken})</label>
                <input
                  type="number"
                  value={lpConfig.totalLiquidity}
                  onChange={(e) => setLpConfig({ ...lpConfig, totalLiquidity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Distribution</label>
                <select
                  value={lpConfig.distribution}
                  onChange={(e) => setLpConfig({ ...lpConfig, distribution: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="uniform">Uniform</option>
                  <option value="concentrated">Concentrated</option>
                  <option value="bell">Bell Curve</option>
                </select>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  disabled={!marketId}
                  className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  Seed Grid (Stable Preset)
                </button>
                <button
                  disabled={!marketId}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  Seed Grid (Volatile Preset)
                </button>
              </div>
            </div>
          </SectionCard>

          {/* Preview */}
          <LpGridPreview
            baseAsset={form.baseToken}
            quoteAsset={form.quoteToken}
            midPrice={lpConfig.midPrice}
            rangePercent={lpConfig.rangePercent}
            gridLevels={lpConfig.gridLevels}
            totalLiquidity={lpConfig.totalLiquidity}
            distribution={lpConfig.distribution}
          />
        </SectionGrid>
      </Section>

      {/* Source Code */}
      <Section title="Source Code" description="Full market creation and LP seeding example.">
        <CodePreview code={CreateMarketSource} language="tsx" />
      </Section>
    </div>
  );
};
