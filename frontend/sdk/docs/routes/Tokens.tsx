/**
 * Tokens Demo Page
 *
 * Demonstrates token operations: deploy, transfer, and balance display.
 */

import React, { useState } from 'react';
import { useWallet, useBalances } from '../../react/hooks';
import { WalletOnboard } from '../../components/Wallet/WalletOnboard';
import { AddressPill } from '../../components/Wallet/AddressPill';
import { Section, SectionCard, SectionGrid, CodePreview } from '../components';

// ============================================================
// Source Code Export
// ============================================================

export const TokensDemoPageSource = `
import React, { useState } from 'react';
import { useWstf, useWallet, useBalances } from '@wasserstoff/wstf-kit/react';

export function TokensDemoPage() {
  const { sdk } = useWstf();
  const { activeSigner } = useWallet();
  const { data: balances, refetch } = useBalances(activeSigner?.address);

  const [deployForm, setDeployForm] = useState({
    name: '',
    symbol: '',
    decimals: '8',
    initialSupply: '1000000',
  });

  const [sendForm, setSendForm] = useState({
    tokenId: '',
    recipient: '',
    amount: '',
  });

  // Deploy a new fungible token
  async function handleDeploy() {
    const tx = await sdk.tokens.deployFungible({
      name: deployForm.name,
      symbol: deployForm.symbol,
      decimals: parseInt(deployForm.decimals),
      initialSupply: BigInt(deployForm.initialSupply),
    });

    console.log('Token deployed:', tx.tokenId);
    refetch();
  }

  // Transfer tokens
  async function handleSend() {
    await sdk.tokens.transfer({
      tokenId: sendForm.tokenId,
      to: sendForm.recipient,
      amount: BigInt(sendForm.amount),
    });

    console.log('Transfer complete');
    refetch();
  }

  return (
    <div className="space-y-6">
      <h1>Tokens Demo</h1>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-4">
        {balances?.map((b) => (
          <div key={b.asset} className="p-4 bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-400">{b.asset}</p>
            <p className="text-xl font-mono">{b.balance}</p>
          </div>
        ))}
      </div>

      {/* Deploy Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleDeploy(); }}>
        <input
          value={deployForm.name}
          onChange={(e) => setDeployForm({ ...deployForm, name: e.target.value })}
          placeholder="Token Name"
        />
        <input
          value={deployForm.symbol}
          onChange={(e) => setDeployForm({ ...deployForm, symbol: e.target.value })}
          placeholder="Symbol"
        />
        <button type="submit">Deploy Token</button>
      </form>

      {/* Transfer Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
        <input
          value={sendForm.tokenId}
          onChange={(e) => setSendForm({ ...sendForm, tokenId: e.target.value })}
          placeholder="Token ID"
        />
        <input
          value={sendForm.recipient}
          onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })}
          placeholder="Recipient Address"
        />
        <input
          value={sendForm.amount}
          onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
          placeholder="Amount"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
`.trim();

// ============================================================
// Component
// ============================================================

export const TokensDemoPage: React.FC = () => {
  const { activeSigner } = useWallet();
  const { data: balances, refetch, isLoading } = useBalances(activeSigner?.address);
  const [showOnboard, setShowOnboard] = useState(false);

  // Deploy form state
  const [deployForm, setDeployForm] = useState({
    name: '',
    symbol: '',
    decimals: '8',
    initialSupply: '1000000',
  });

  // Transfer form state
  const [sendForm, setSendForm] = useState({
    tokenId: '',
    recipient: '',
    amount: '',
  });

  // Activity log
  const [activity, setActivity] = useState<Array<{
    type: 'deploy' | 'transfer';
    message: string;
    time: Date;
  }>>([]);

  const handleDeploy = () => {
    // Demo: log the action
    setActivity((prev) => [
      {
        type: 'deploy',
        message: `Deployed ${deployForm.symbol} (${deployForm.name}) with ${deployForm.initialSupply} initial supply`,
        time: new Date(),
      },
      ...prev.slice(0, 9),
    ]);
    setDeployForm({ name: '', symbol: '', decimals: '8', initialSupply: '1000000' });
  };

  const handleSend = () => {
    // Demo: log the action
    setActivity((prev) => [
      {
        type: 'transfer',
        message: `Sent ${sendForm.amount} of ${sendForm.tokenId} to ${sendForm.recipient.slice(0, 12)}...`,
        time: new Date(),
      },
      ...prev.slice(0, 9),
    ]);
    setSendForm({ tokenId: '', recipient: '', amount: '' });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white">Tokens Demo</h1>
        <p className="mt-1 text-sm text-slate-400">
          Deploy fungible tokens and transfer between accounts.
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
              <p className="text-slate-400 mb-4">Connect a wallet to manage tokens.</p>
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

      {/* Connected Content */}
      {activeSigner && (
        <>
          {/* Current Balances */}
          <Section title="Your Balances" description="Token balances for your connected wallet.">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {isLoading ? (
                <SectionCard>
                  <div className="animate-pulse">
                    <div className="h-4 bg-slate-700 rounded w-20 mb-2"></div>
                    <div className="h-6 bg-slate-700 rounded w-32"></div>
                  </div>
                </SectionCard>
              ) : balances && balances.length > 0 ? (
                balances.map((balance) => (
                  <SectionCard key={balance.asset}>
                    <p className="text-xs text-slate-500 mb-1 font-mono truncate">{balance.asset}</p>
                    <p className="text-xl font-mono text-white">{balance.balance}</p>
                  </SectionCard>
                ))
              ) : (
                <SectionCard className="col-span-full">
                  <p className="text-sm text-slate-500 text-center py-4">
                    No token balances found. Deploy a token to get started.
                  </p>
                </SectionCard>
              )}
            </div>
          </Section>

          {/* Deploy Token */}
          <Section title="Deploy Token" description="Create a new fungible token on-chain.">
            <SectionCard>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Token Name</label>
                  <input
                    value={deployForm.name}
                    onChange={(e) => setDeployForm({ ...deployForm, name: e.target.value })}
                    placeholder="My Token"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Symbol</label>
                  <input
                    value={deployForm.symbol}
                    onChange={(e) => setDeployForm({ ...deployForm, symbol: e.target.value.toUpperCase() })}
                    placeholder="MTK"
                    maxLength={10}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Decimals</label>
                  <input
                    type="number"
                    value={deployForm.decimals}
                    onChange={(e) => setDeployForm({ ...deployForm, decimals: e.target.value })}
                    min="0"
                    max="18"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Initial Supply</label>
                  <input
                    type="number"
                    value={deployForm.initialSupply}
                    onChange={(e) => setDeployForm({ ...deployForm, initialSupply: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleDeploy}
                disabled={!deployForm.name || !deployForm.symbol}
                className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                Deploy Token
              </button>
            </SectionCard>
          </Section>

          {/* Transfer Tokens */}
          <Section title="Send Tokens" description="Transfer tokens to another address.">
            <SectionCard>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Token ID</label>
                  <input
                    value={sendForm.tokenId}
                    onChange={(e) => setSendForm({ ...sendForm, tokenId: e.target.value })}
                    placeholder="token_abc123..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Recipient</label>
                  <input
                    value={sendForm.recipient}
                    onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })}
                    placeholder="gc1234..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount</label>
                  <input
                    type="number"
                    value={sendForm.amount}
                    onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                    placeholder="100"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleSend}
                disabled={!sendForm.tokenId || !sendForm.recipient || !sendForm.amount}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Send Tokens
              </button>
            </SectionCard>
          </Section>

          {/* Activity Log */}
          <Section title="Activity" description="Recent token operations.">
            <SectionCard>
              {activity.length > 0 ? (
                <div className="space-y-2">
                  {activity.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start justify-between py-2 border-b border-slate-700 last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`px-2 py-0.5 text-xs rounded ${
                            item.type === 'deploy'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-blue-500/10 text-blue-400'
                          }`}
                        >
                          {item.type}
                        </span>
                        <p className="text-sm text-slate-300">{item.message}</p>
                      </div>
                      <span className="text-xs text-slate-500">
                        {item.time.toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">
                  No activity yet. Deploy or transfer tokens to see activity.
                </p>
              )}
            </SectionCard>
          </Section>
        </>
      )}

      {/* Source Code */}
      <Section title="Source Code" description="Full implementation for token operations.">
        <CodePreview code={TokensDemoPageSource} language="tsx" />
      </Section>
    </div>
  );
};
