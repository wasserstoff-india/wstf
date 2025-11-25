/**
 * Devnet Explorer Example
 *
 * Complete, standalone explorer page that can be copied directly into any React app.
 * Uses @wasserstoff/wstf-kit for all functionality.
 *
 * Usage:
 *   1. npm install @wasserstoff/wstf-kit
 *   2. Copy this file into your project
 *   3. Import and render <DevnetExplorerPage />
 */

import React, { useState } from 'react';

// When using in your app, import from the package:
// import {
//   WstfProvider,
//   useWallet,
//   AccountOverview,
//   TxList,
//   BlockList,
//   Orderbook,
//   WalletOnboard,
//   WalletSwitcher,
//   AddressPill,
// } from '@wasserstoff/wstf-kit';

// For this example, we import from relative paths:
import { WstfProvider } from '../react/WstfProvider';
import { useWallet } from '../react/hooks';
import { AccountOverview } from '../components/Explorer/AccountOverview';
import { TxList } from '../components/Explorer/TxList';
import { BlockList } from '../components/Explorer/BlockList';
import { Orderbook } from '../components/Markets/Orderbook';
import { WalletOnboard } from '../components/Wallet/WalletOnboard';
import { WalletSwitcher } from '../components/Wallet/WalletSwitcher';
import { AddressPill } from '../components/Wallet/AddressPill';

// ============================================================
// Main Export
// ============================================================

export function DevnetExplorerPage() {
  return (
    <WstfProvider config="devnet">
      <ExplorerInner />
    </WstfProvider>
  );
}

// ============================================================
// Inner Component (uses hooks)
// ============================================================

function ExplorerInner() {
  const { activeSigner, disconnect } = useWallet();
  const [showOnboard, setShowOnboard] = useState(!activeSigner);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">WSTF Devnet Explorer</h1>
          <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
            devnet
          </span>
        </div>
        <div className="flex items-center gap-3">
          {activeSigner ? (
            <>
              <WalletSwitcher onCreateNew={() => setShowOnboard(true)} />
              <button
                onClick={() => disconnect()}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowOnboard(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Wallet Onboard */}
        {showOnboard && !activeSigner && (
          <div className="max-w-md mx-auto">
            <WalletOnboard
              onWalletCreated={() => setShowOnboard(false)}
              onWalletConnected={() => setShowOnboard(false)}
            />
          </div>
        )}

        {/* Connected: Show explorer content */}
        {activeSigner && (
          <>
            {/* Account Overview */}
            <AccountOverview address={activeSigner.address} />

            {/* Transactions & Blocks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TxList
                address={activeSigner.address}
                limit={10}
                onTxClick={(hash) => console.log('View tx:', hash)}
              />
              <BlockList
                limit={5}
                onBlockClick={(height) => console.log('View block:', height)}
              />
            </div>

            {/* Markets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Orderbook
                baseAsset="WCO"
                quoteAsset="USDC"
                depth={8}
                onPriceClick={(price, side) => console.log(`${side}: ${price}`)}
              />
            </div>
          </>
        )}

        {/* Not Connected: Show welcome message */}
        {!activeSigner && !showOnboard && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
              <svg
                className="w-8 h-8 text-slate-500"
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
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Welcome to WSTF Devnet</h2>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Connect or create a wallet to view your balances, transactions, and explore the devnet markets.
            </p>
            <button
              onClick={() => setShowOnboard(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get Started
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-500">
        Built with{' '}
        <a
          href="https://github.com/wasserstoff-india/wstf"
          className="text-blue-400 hover:text-blue-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          @wasserstoff/wstf-kit
        </a>
      </footer>
    </div>
  );
}

// ============================================================
// Source Code Export
// ============================================================

export const DevnetExplorerPageSource = `
import React, { useState } from 'react';
import {
  WstfProvider,
  useWallet,
  AccountOverview,
  TxList,
  BlockList,
  Orderbook,
  WalletOnboard,
  WalletSwitcher,
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
  const [showOnboard, setShowOnboard] = useState(!activeSigner);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h1 className="text-lg font-semibold">WSTF Devnet Explorer</h1>
        {activeSigner ? (
          <button onClick={disconnect}>Disconnect</button>
        ) : (
          <button onClick={() => setShowOnboard(true)}>Connect</button>
        )}
      </header>

      <main className="p-4 space-y-6">
        {showOnboard && !activeSigner && (
          <WalletOnboard
            onWalletCreated={() => setShowOnboard(false)}
            onWalletConnected={() => setShowOnboard(false)}
          />
        )}

        {activeSigner && (
          <>
            <AccountOverview address={activeSigner.address} />
            <div className="grid grid-cols-2 gap-4">
              <TxList address={activeSigner.address} limit={10} />
              <BlockList limit={5} />
            </div>
            <Orderbook baseAsset="WCO" quoteAsset="USDC" depth={8} />
          </>
        )}
      </main>
    </div>
  );
}
`.trim();
