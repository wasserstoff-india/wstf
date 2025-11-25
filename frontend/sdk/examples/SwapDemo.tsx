/**
 * Swap Demo Example
 *
 * Simple swap interface example using @wasserstoff/wstf-kit.
 *
 * Usage:
 *   1. npm install @wasserstoff/wstf-kit
 *   2. Copy this file into your project
 *   3. Import and render <SwapDemoPage />
 */

import React, { useState } from 'react';

// When using in your app, import from the package:
// import {
//   WstfProvider,
//   useWallet,
//   SwapWidget,
//   WalletOnboard,
// } from '@wasserstoff/wstf-kit';

// For this example, we import from relative paths:
import { WstfProvider } from '../react/WstfProvider';
import { useWallet } from '../react/hooks';
import { SwapWidget } from '../components/Trading/SwapWidget';
import { WalletOnboard } from '../components/Wallet/WalletOnboard';

// ============================================================
// Main Export
// ============================================================

export function SwapDemoPage() {
  return (
    <WstfProvider config="devnet">
      <SwapInner />
    </WstfProvider>
  );
}

// ============================================================
// Inner Component
// ============================================================

function SwapInner() {
  const { activeSigner } = useWallet();
  const [showOnboard, setShowOnboard] = useState(false);
  const [swapHistory, setSwapHistory] = useState<Array<{
    side: 'buy' | 'sell';
    amount: string;
    price: string;
    time: Date;
  }>>([]);

  const handleSwap = (side: 'buy' | 'sell', amount: string, price: string) => {
    setSwapHistory((prev) => [
      { side, amount, price, time: new Date() },
      ...prev.slice(0, 9),
    ]);
    // In a real app, call: sdk.trading.marketBuy/marketSell(...)
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Swap Demo</h1>
          {!activeSigner && (
            <button
              onClick={() => setShowOnboard(true)}
              className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Wallet Onboard */}
        {showOnboard && !activeSigner && (
          <WalletOnboard
            onWalletCreated={() => setShowOnboard(false)}
            onWalletConnected={() => setShowOnboard(false)}
          />
        )}

        {/* Swap Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SwapWidget
            marketId="WCO_USDC"
            baseAsset="WCO"
            quoteAsset="USDC"
            onSwap={handleSwap}
          />

          {/* History */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <h3 className="font-medium text-white mb-4">Swap History</h3>
            {swapHistory.length > 0 ? (
              <div className="space-y-2">
                {swapHistory.map((swap, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0"
                  >
                    <div>
                      <span
                        className={`text-xs font-bold ${
                          swap.side === 'buy' ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {swap.side.toUpperCase()}
                      </span>
                      <p className="text-sm font-mono">{swap.amount}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>@ {swap.price}</p>
                      <p>{swap.time.toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-8">
                No swaps yet
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Source Code Export
// ============================================================

export const SwapDemoPageSource = `
import React, { useState } from 'react';
import {
  WstfProvider,
  useWallet,
  SwapWidget,
  WalletOnboard,
} from '@wasserstoff/wstf-kit';

export function SwapDemoPage() {
  return (
    <WstfProvider config={{ network: 'devnet' }}>
      <SwapInner />
    </WstfProvider>
  );
}

function SwapInner() {
  const { activeSigner } = useWallet();
  const [showOnboard, setShowOnboard] = useState(false);

  const handleSwap = async (side, amount, price) => {
    // Call SDK trading methods
    // await sdk.trading.marketBuy/marketSell(...)
    console.log(\`\${side} \${amount} @ \${price}\`);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      {!activeSigner && (
        <WalletOnboard
          onWalletConnected={() => setShowOnboard(false)}
        />
      )}

      <SwapWidget
        marketId="WCO_USDC"
        baseAsset="WCO"
        quoteAsset="USDC"
        onSwap={handleSwap}
      />
    </div>
  );
}
`.trim();
