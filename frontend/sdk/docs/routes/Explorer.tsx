/**
 * Explorer Page
 *
 * Documentation for explorer components.
 */

import React, { useState } from 'react';
import { useWallet } from '../../react/hooks';
import {
  AccountOverview,
  AccountOverviewSource,
  TxList,
  TxListSource,
  BlockList,
  BlockListSource,
} from '../../components/Explorer';
import { Section, SectionCard, SectionGrid, CodePreview } from '../components';

// ============================================================
// Component
// ============================================================

export const ExplorerPage: React.FC = () => {
  const { activeSigner } = useWallet();
  const [showCode, setShowCode] = useState<string | null>(null);
  const [demoAddress, setDemoAddress] = useState(
    activeSigner?.address || 'gc1234567890abcdef1234567890abcdef12345678'
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white">Explorer Components</h1>
        <p className="mt-1 text-sm text-slate-400">
          Chain data visualization components for accounts, transactions, and blocks.
        </p>
      </div>

      {/* Address Input */}
      <Section title="Demo Address">
        <div className="flex gap-2">
          <input
            value={demoAddress}
            onChange={(e) => setDemoAddress(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono"
            placeholder="Enter an address to preview..."
          />
          {activeSigner && (
            <button
              onClick={() => setDemoAddress(activeSigner.address)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Use My Address
            </button>
          )}
        </div>
      </Section>

      {/* AccountOverview */}
      <Section
        title="AccountOverview"
        description="Display account balances and basic info."
      >
        <SectionGrid>
          <AccountOverview address={demoAddress} />
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Props</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="text-blue-400">address</code>
                <span className="text-slate-500">string (required)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">className</code>
                <span className="text-slate-500">string</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">refetchInterval</code>
                <span className="text-slate-500">number (ms)</span>
              </div>
            </div>
            <button
              onClick={() => setShowCode(showCode === 'account' ? null : 'account')}
              className="mt-4 text-xs text-blue-400 hover:text-blue-300"
            >
              {showCode === 'account' ? 'Hide Code' : 'View Code'}
            </button>
          </SectionCard>
        </SectionGrid>
        {showCode === 'account' && <CodePreview code={AccountOverviewSource} language="tsx" />}
      </Section>

      {/* TxList */}
      <Section
        title="TxList"
        description="List recent transactions for an address."
      >
        <SectionGrid>
          <TxList
            address={demoAddress}
            limit={5}
            onTxClick={(hash) => console.log('Clicked:', hash)}
          />
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Props</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="text-blue-400">address</code>
                <span className="text-slate-500">string (required)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">limit</code>
                <span className="text-slate-500">number (default: 10)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">onTxClick</code>
                <span className="text-slate-500">(hash) =&gt; void</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">refetchInterval</code>
                <span className="text-slate-500">number (ms)</span>
              </div>
            </div>
            <button
              onClick={() => setShowCode(showCode === 'txlist' ? null : 'txlist')}
              className="mt-4 text-xs text-blue-400 hover:text-blue-300"
            >
              {showCode === 'txlist' ? 'Hide Code' : 'View Code'}
            </button>
          </SectionCard>
        </SectionGrid>
        {showCode === 'txlist' && <CodePreview code={TxListSource} language="tsx" />}
      </Section>

      {/* BlockList */}
      <Section
        title="BlockList"
        description="Display recent blocks from the chain."
      >
        <SectionGrid>
          <BlockList
            limit={5}
            onBlockClick={(height) => console.log('Block:', height)}
          />
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Props</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="text-blue-400">limit</code>
                <span className="text-slate-500">number (default: 10)</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">onBlockClick</code>
                <span className="text-slate-500">(height) =&gt; void</span>
              </div>
              <div className="flex justify-between">
                <code className="text-blue-400">refetchInterval</code>
                <span className="text-slate-500">number (ms)</span>
              </div>
            </div>
            <button
              onClick={() => setShowCode(showCode === 'blocklist' ? null : 'blocklist')}
              className="mt-4 text-xs text-blue-400 hover:text-blue-300"
            >
              {showCode === 'blocklist' ? 'Hide Code' : 'View Code'}
            </button>
          </SectionCard>
        </SectionGrid>
        {showCode === 'blocklist' && <CodePreview code={BlockListSource} language="tsx" />}
      </Section>

      {/* useExplorer Hook */}
      <Section
        title="Explorer Hooks"
        description="React hooks for chain data."
      >
        <CodePreview
          code={`import {
  useAccount,
  useBalances,
  useLatestBlocks,
  useBlock,
  useLatestTransactions,
  useTransaction,
  useChainStatus,
} from '@wasserstoff/wstf-kit/react';

function ChainExplorer() {
  // Account data
  const { data: account, isLoading } = useAccount('gc...');
  const { data: balances } = useBalances('gc...');

  // Block data
  const { data: blocks } = useLatestBlocks({ limit: 10 });
  const { data: block } = useBlock(12345);

  // Transaction data
  const { data: txs } = useLatestTransactions({ limit: 20 });
  const { data: tx } = useTransaction('tx_hash...');

  // Chain status
  const { data: status } = useChainStatus();

  return (
    <div>
      <p>Height: {status?.height}</p>
      <p>Account Nonce: {account?.nonce}</p>
      <p>Balances: {balances?.length}</p>
      <p>Recent Blocks: {blocks?.length}</p>
    </div>
  );
}`}
          language="tsx"
        />
      </Section>
    </div>
  );
};
