/**
 * Swap Demo Page
 *
 * Demonstrates the SwapWidget component.
 */

import React, { useState } from 'react';
import { useWallet } from '../../react/hooks';
import { SwapWidget, SwapWidgetSource } from '../../components/Trading/SwapWidget';
import { WalletOnboard } from '../../components/Wallet/WalletOnboard';
import { Section, SectionCard, SectionGrid, CodePreview } from '../components';

// ============================================================
// Component
// ============================================================

export const SwapDemoPage: React.FC = () => {
  const { activeSigner } = useWallet();
  const [showOnboard, setShowOnboard] = useState(false);
  const [swapHistory, setSwapHistory] = useState<Array<{
    side: 'buy' | 'sell';
    amount: string;
    price: string;
    timestamp: Date;
  }>>([]);

  const handleSwap = (side: 'buy' | 'sell', amount: string, price: string) => {
    setSwapHistory((prev) => [
      { side, amount, price, timestamp: new Date() },
      ...prev.slice(0, 9),
    ]);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white">Swap Demo</h1>
        <p className="mt-1 text-sm text-slate-400">
          Minimal swap interface for market orders.
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
              <p className="text-slate-400 mb-4">Connect a wallet to use the swap widget.</p>
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

      {/* Demo */}
      <SectionGrid>
        {/* Swap Widget */}
        <div>
          <Section title="Swap Widget" description="Trade between two assets with market orders.">
            <SwapWidget
              marketId="WCO_USDC"
              baseAsset="WCO"
              quoteAsset="USDC"
              onSwap={handleSwap}
            />
          </Section>
        </div>

        {/* Swap History */}
        <div>
          <Section title="Swap History" description="Recent swap attempts (demo only).">
            <SectionCard className="max-h-80 overflow-y-auto">
              {swapHistory.length > 0 ? (
                <div className="space-y-2">
                  {swapHistory.map((swap, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0"
                    >
                      <div>
                        <span
                          className={`text-xs font-medium ${
                            swap.side === 'buy' ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {swap.side.toUpperCase()}
                        </span>
                        <p className="text-sm text-white font-mono">{swap.amount}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">@ {swap.price}</p>
                        <p className="text-xs text-slate-600">
                          {swap.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">
                  No swaps yet. Try the widget!
                </p>
              )}
            </SectionCard>
          </Section>
        </div>
      </SectionGrid>

      {/* Source Code */}
      <Section title="Source Code" description="Copy this component into your project.">
        <CodePreview code={SwapWidgetSource} language="tsx" />
      </Section>

      {/* Usage Guide */}
      <Section title="Usage" description="How to integrate the swap widget.">
        <SectionGrid>
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Basic Usage</h4>
            <CodePreview
              code={`<SwapWidget
  marketId="WCO_USDC"
  baseAsset="WCO"
  quoteAsset="USDC"
  onSwap={(side, amount, price) => {
    console.log(\`\${side} \${amount} @ \${price}\`);
  }}
/>`}
              language="tsx"
              showLineNumbers={false}
            />
          </SectionCard>

          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">With SDK Integration</h4>
            <CodePreview
              code={`const { sdk } = useWstf();

const handleSwap = async (side, amount, price) => {
  if (side === 'buy') {
    await sdk.trading.marketBuy({
      marketId,
      quantity: amount,
      maxPrice: price,
    });
  } else {
    await sdk.trading.marketSell({
      marketId,
      quantity: amount,
      minPrice: price,
    });
  }
};`}
              language="tsx"
              showLineNumbers={false}
            />
          </SectionCard>
        </SectionGrid>
      </Section>
    </div>
  );
};
