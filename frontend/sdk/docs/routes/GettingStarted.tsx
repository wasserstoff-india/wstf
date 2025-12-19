/**
 * Getting Started Page
 *
 * Introduction and quick start guide for WSTF Kit.
 */

import React from 'react';
import { Section, SectionCard, SectionGrid } from '../components';
import { CodePreview } from '../components';

// ============================================================
// Code Examples
// ============================================================

const installCode = `# npm
npm install @wasserstoff/wstf-kit

# yarn
yarn add @wasserstoff/wstf-kit

# pnpm
pnpm add @wasserstoff/wstf-kit`;

const providerCode = `import { WstfProvider } from '@wasserstoff/wstf-kit/react';

function App() {
  return (
    <WstfProvider config={{ network: 'devnet' }}>
      <YourApp />
    </WstfProvider>
  );
}`;

const hooksCode = `import { useWallet, useAccount, useBalances } from '@wasserstoff/wstf-kit/react';

function Dashboard() {
  const { wallet, createWallet, connect } = useWallet();
  const { data: account } = useAccount(wallet?.address);
  const { data: balances } = useBalances(wallet?.address);

  return (
    <div>
      <p>Address: {wallet?.address}</p>
      <p>Nonce: {account?.nonce}</p>
      {balances?.map(b => (
        <p key={b.asset}>{b.asset}: {b.balance}</p>
      ))}
    </div>
  );
}`;

const componentsCode = `import {
  AccountOverview,
  TxList,
  BlockList,
  WalletOnboard
} from '@wasserstoff/wstf-kit/components';

function ExplorerPage() {
  const address = 'gc...'; // from useWallet()

  return (
    <div className="space-y-4">
      <WalletOnboard />
      <AccountOverview address={address} />
      <TxList address={address} limit={10} />
      <BlockList limit={5} />
    </div>
  );
}`;

// ============================================================
// Component
// ============================================================

export const GettingStarted: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="pb-6 border-b border-slate-800">
        <h1 className="text-3xl font-bold text-white">WSTF Kit</h1>
        <p className="mt-2 text-lg text-slate-400">
          Frontend SDK and React components for building WSTF Chain applications.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="px-2 py-1 text-xs rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
            React 18+
          </span>
          <span className="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            TypeScript
          </span>
          <span className="px-2 py-1 text-xs rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
            Tailwind CSS
          </span>
          <span className="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Tree-shakeable
          </span>
        </div>
      </div>

      {/* Features */}
      <Section title="Features">
        <SectionGrid>
          <SectionCard>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h3 className="font-medium text-white">Multi-Alg Wallets</h3>
            </div>
            <p className="text-sm text-slate-400">
              Ed25519 and secp256k1 support with encrypted browser storage and passkey integration.
            </p>
          </SectionCard>

          <SectionCard>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-medium text-white">React Hooks</h3>
            </div>
            <p className="text-sm text-slate-400">
              Data-fetching hooks with loading states, error handling, and automatic refetch.
            </p>
          </SectionCard>

          <SectionCard>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <h3 className="font-medium text-white">UI Components</h3>
            </div>
            <p className="text-sm text-slate-400">
              Tailwind-styled components for explorer, wallet, and trading interfaces.
            </p>
          </SectionCard>

          <SectionCard>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-red-500/10">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-medium text-white">Zero Trust</h3>
            </div>
            <p className="text-sm text-slate-400">
              Private keys never leave the client. All transactions are signed locally before being relayed.
            </p>
          </SectionCard>
        </SectionGrid>
      </Section>

      {/* Installation */}
      <Section title="Installation" description="Add the kit to your React project.">
        <CodePreview code={installCode} language="bash" title="Terminal" showLineNumbers={false} />
      </Section>

      {/* Quick Start */}
      <Section title="Quick Start">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">1. Wrap your app with WstfProvider</h3>
            <CodePreview code={providerCode} language="tsx" />
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">2. Use hooks to access chain data</h3>
            <CodePreview code={hooksCode} language="tsx" />
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">3. Add pre-built components</h3>
            <CodePreview code={componentsCode} language="tsx" />
          </div>
        </div>
      </Section>

      {/* Package Structure */}
      <Section title="Package Exports" description="Import only what you need for optimal bundle size.">
        <SectionGrid>
          <SectionCard>
            <code className="text-xs text-blue-400">@wasserstoff/wstf-kit/react</code>
            <p className="mt-2 text-sm text-slate-400">
              WstfProvider, useWallet, useAccount, useBalances, useMarkets, useExplorer hooks.
            </p>
          </SectionCard>

          <SectionCard>
            <code className="text-xs text-emerald-400">@wasserstoff/wstf-kit/components</code>
            <p className="mt-2 text-sm text-slate-400">
              UI components: AccountOverview, TxList, BlockList, WalletOnboard, Orderbook, etc.
            </p>
          </SectionCard>

          <SectionCard>
            <code className="text-xs text-purple-400">@wasserstoff/wstf-kit/core</code>
            <p className="mt-2 text-sm text-slate-400">
              Low-level client, config, wallet manager, and type definitions.
            </p>
          </SectionCard>

          <SectionCard>
            <code className="text-xs text-amber-400">@wasserstoff/wstf-kit</code>
            <p className="mt-2 text-sm text-slate-400">
              Main entry point that re-exports all modules (larger bundle size).
            </p>
          </SectionCard>
        </SectionGrid>
      </Section>
    </div>
  );
};
