/**
 * Devnet Explorer Page
 *
 * Full-featured explorer example using WSTF Kit components.
 * This is a drop-in example that developers can copy directly.
 */

import React, { useState } from 'react';
import { useWstf } from '../../react/WstfProvider';
import { useWallet } from '../../react/hooks';
import { AccountOverview } from '../../components/Explorer/AccountOverview';
import { TxList } from '../../components/Explorer/TxList';
import { BlockList } from '../../components/Explorer/BlockList';
import { Orderbook } from '../../components/Markets/Orderbook';
import { WalletOnboard } from '../../components/Wallet/WalletOnboard';
import { WalletSwitcher } from '../../components/Wallet/WalletSwitcher';
import { AddressPill } from '../../components/Wallet/AddressPill';
import { Section, CodePreview } from '../components';

// ============================================================
// DevnetExplorerPage Source (for export)
// ============================================================

export const DevnetExplorerPageSource = `
import React from 'react';
import {
  WstfProvider,
  useWallet,
  AccountOverview,
  TxList,
  BlockList,
  Orderbook,
  WalletOnboard,
  WalletSwitcher,
  AddressPill,
} from '@wasserstoff/wstf-kit';

export function DevnetExplorerPage() {
  return (
    <WstfProvider config={{ network: 'devnet' }}>
      <ExplorerInner />
    </WstfProvider>
  );
}

function ExplorerInner() {
  const { activeSigner, disconnect } = useWallet();
  const [showOnboard, setShowOnboard] = React.useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">WSTF Devnet Explorer</span>
          <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
            devnet
          </span>
        </div>
        <div>
          {activeSigner ? (
            <div className="flex items-center gap-2">
              <AddressPill address={activeSigner.address} />
              <button
                onClick={disconnect}
                className="text-sm text-slate-400 hover:text-white"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowOnboard(true)}
              className="px-4 py-2 text-sm bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Wallet Onboard Modal */}
        {showOnboard && !activeSigner && (
          <WalletOnboard
            onWalletCreated={() => setShowOnboard(false)}
            onWalletConnected={() => setShowOnboard(false)}
          />
        )}

        {/* Connected Content */}
        {activeSigner && (
          <>
            <AccountOverview address={activeSigner.address} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TxList address={activeSigner.address} limit={10} />
              <BlockList limit={5} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Orderbook baseAsset="WCO" quoteAsset="USDC" depth={8} />
            </div>
          </>
        )}

        {/* Not Connected */}
        {!activeSigner && !showOnboard && (
          <div className="text-center py-16">
            <p className="text-slate-400">
              Connect or create a wallet to see your balances and transactions.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
`.trim();

// ============================================================
// Component
// ============================================================

export const DevnetExplorerPage: React.FC = () => {
  const { activeSigner, disconnect } = useWallet();
  const [showOnboard, setShowOnboard] = useState(!activeSigner);
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white">Devnet Explorer</h1>
          <p className="mt-1 text-sm text-slate-400">
            Full-featured explorer example - copy this into your app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCode(!showCode)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              showCode
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : 'text-slate-400 border-slate-700 hover:text-white hover:border-slate-600'
            }`}
          >
            {showCode ? 'Hide Code' : 'View Code'}
          </button>
        </div>
      </div>

      {/* Source Code */}
      {showCode && (
        <Section title="Source Code" description="Copy this component into your project.">
          <CodePreview code={DevnetExplorerPageSource} language="tsx" />
        </Section>
      )}

      {/* Live Demo */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        {/* Demo Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">WSTF Devnet Explorer</span>
            <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
              devnet
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activeSigner ? (
              <>
                <WalletSwitcher onCreateNew={() => setShowOnboard(true)} />
                <button
                  onClick={() => disconnect()}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowOnboard(true)}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>

        {/* Demo Content */}
        <div className="p-4 bg-slate-900/50 space-y-4">
          {/* Wallet Onboard */}
          {showOnboard && !activeSigner && (
            <WalletOnboard
              onWalletCreated={(address) => {
                setShowOnboard(false);
              }}
              onWalletConnected={(address) => {
                setShowOnboard(false);
              }}
            />
          )}

          {/* Connected Content */}
          {activeSigner && (
            <>
              <AccountOverview address={activeSigner.address} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TxList address={activeSigner.address} limit={10} />
                <BlockList limit={5} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Orderbook baseAsset="WCO" quoteAsset="USDC" depth={8} />
              </div>
            </>
          )}

          {/* Not Connected */}
          {!activeSigner && !showOnboard && (
            <div className="text-center py-12">
              <svg
                className="mx-auto w-12 h-12 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              <p className="mt-4 text-slate-400">
                Connect or create a wallet to explore the devnet.
              </p>
              <button
                onClick={() => setShowOnboard(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
