/**
 * Vars Demo Page
 *
 * Demonstrates vars namespace operations: account vars and app config.
 */

import React, { useState, useEffect } from 'react';
import { useWallet } from '../../react/hooks';
import { WalletOnboard } from '../../components/Wallet/WalletOnboard';
import { Section, SectionCard, SectionGrid, CodePreview } from '../components';

// ============================================================
// Source Code Export
// ============================================================

export const VarsDemoPageSource = `
import React, { useState, useEffect } from 'react';
import { useWstf, useWallet } from '@wasserstoff/wstf-kit/react';

export function VarsDemoPage() {
  const { sdk, client } = useWstf();
  const { activeSigner } = useWallet();

  const [accountVars, setAccountVars] = useState<Record<string, string>>({});
  const [appVars, setAppVars] = useState<Record<string, string>>({});

  // Load account vars on mount
  useEffect(() => {
    if (!activeSigner) return;

    async function loadVars() {
      // Account-scoped vars (e.g., user preferences)
      const accVars = await client.rpc('vars.list', {
        namespace: \`account:\${activeSigner.address}\`,
      });
      setAccountVars(accVars || {});

      // App-scoped vars (e.g., app config)
      const appVars = await client.rpc('vars.list', {
        namespace: 'app:my-dapp',
      });
      setAppVars(appVars || {});
    }

    loadVars();
  }, [activeSigner, client]);

  // Set an account var
  async function setAccountVar(key: string, value: string) {
    await sdk.vars.set({
      namespace: \`account:\${activeSigner.address}\`,
      key,
      value,
    });

    setAccountVars((prev) => ({ ...prev, [key]: value }));
  }

  // Set an app var
  async function setAppVar(key: string, value: string) {
    await sdk.vars.set({
      namespace: 'app:my-dapp',
      key,
      value,
    });

    setAppVars((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <h1>Vars Demo</h1>

      {/* Account Vars */}
      <section>
        <h2>Account Vars</h2>
        <p>User-specific preferences stored on-chain.</p>

        <form onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.target);
          setAccountVar(data.get('key'), data.get('value'));
        }}>
          <input name="key" placeholder="Key (e.g., theme)" />
          <input name="value" placeholder="Value (e.g., dark)" />
          <button type="submit">Save</button>
        </form>

        <ul>
          {Object.entries(accountVars).map(([k, v]) => (
            <li key={k}>{k}: {v}</li>
          ))}
        </ul>
      </section>

      {/* App Vars */}
      <section>
        <h2>App Config</h2>
        <p>Application-level configuration.</p>

        <form onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.target);
          setAppVar(data.get('key'), data.get('value'));
        }}>
          <input name="key" placeholder="Key" />
          <input name="value" placeholder="Value" />
          <button type="submit">Save</button>
        </form>

        <ul>
          {Object.entries(appVars).map(([k, v]) => (
            <li key={k}>{k}: {v}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
`.trim();

// ============================================================
// Types
// ============================================================

interface VarEntry {
  key: string;
  value: string;
  namespace: string;
  updatedAt: Date;
}

// ============================================================
// Component
// ============================================================

export const VarsDemoPage: React.FC = () => {
  const { activeSigner } = useWallet();
  const [showOnboard, setShowOnboard] = useState(false);

  // Account vars (user preferences)
  const [accountVars, setAccountVars] = useState<VarEntry[]>([
    { key: 'theme', value: 'dark', namespace: 'account', updatedAt: new Date() },
    { key: 'favoriteMarket', value: 'WCO_USDC', namespace: 'account', updatedAt: new Date() },
  ]);

  // App vars (app config)
  const [appVars, setAppVars] = useState<VarEntry[]>([
    { key: 'appName', value: 'My DApp', namespace: 'app', updatedAt: new Date() },
    { key: 'version', value: '1.0.0', namespace: 'app', updatedAt: new Date() },
  ]);

  // Form state
  const [accountForm, setAccountForm] = useState({ key: '', value: '' });
  const [appForm, setAppForm] = useState({ key: '', value: '' });

  const handleSetAccountVar = () => {
    if (!accountForm.key) return;

    setAccountVars((prev) => {
      const existing = prev.findIndex((v) => v.key === accountForm.key);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], value: accountForm.value, updatedAt: new Date() };
        return updated;
      }
      return [{ key: accountForm.key, value: accountForm.value, namespace: 'account', updatedAt: new Date() }, ...prev];
    });
    setAccountForm({ key: '', value: '' });
  };

  const handleSetAppVar = () => {
    if (!appForm.key) return;

    setAppVars((prev) => {
      const existing = prev.findIndex((v) => v.key === appForm.key);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], value: appForm.value, updatedAt: new Date() };
        return updated;
      }
      return [{ key: appForm.key, value: appForm.value, namespace: 'app', updatedAt: new Date() }, ...prev];
    });
    setAppForm({ key: '', value: '' });
  };

  const handleDeleteVar = (namespace: string, key: string) => {
    if (namespace === 'account') {
      setAccountVars((prev) => prev.filter((v) => v.key !== key));
    } else {
      setAppVars((prev) => prev.filter((v) => v.key !== key));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white">Vars Demo</h1>
        <p className="mt-1 text-sm text-slate-400">
          On-chain key-value storage for user preferences and app configuration.
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
              <p className="text-slate-400 mb-4">Connect a wallet to manage vars.</p>
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

      {/* Namespace Overview */}
      <Section title="Namespaces" description="Vars are organized by namespace for scoping.">
        <SectionGrid cols={3}>
          <SectionCard>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-xs rounded bg-blue-500/10 text-blue-400">account:</span>
            </div>
            <p className="text-sm text-slate-400">
              User-specific data. Scoped to wallet address. Great for preferences, settings, favorites.
            </p>
            <code className="block mt-2 text-xs text-slate-500">
              account:gc1234...
            </code>
          </SectionCard>

          <SectionCard>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-400">app:</span>
            </div>
            <p className="text-sm text-slate-400">
              Application-level config. Shared across all users. Good for feature flags, settings.
            </p>
            <code className="block mt-2 text-xs text-slate-500">
              app:my-dapp
            </code>
          </SectionCard>

          <SectionCard>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-xs rounded bg-purple-500/10 text-purple-400">custom:</span>
            </div>
            <p className="text-sm text-slate-400">
              Any custom namespace. Use for game state, social data, or domain-specific storage.
            </p>
            <code className="block mt-2 text-xs text-slate-500">
              game:leaderboard
            </code>
          </SectionCard>
        </SectionGrid>
      </Section>

      {/* Account Vars */}
      <Section
        title="Account Vars"
        description={`Vars scoped to your wallet: account:${activeSigner?.address?.slice(0, 12) || '...'}...`}
      >
        <SectionCard>
          {/* Add Form */}
          <div className="flex gap-2 mb-4">
            <input
              value={accountForm.key}
              onChange={(e) => setAccountForm({ ...accountForm, key: e.target.value })}
              placeholder="Key (e.g., theme)"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
            <input
              value={accountForm.value}
              onChange={(e) => setAccountForm({ ...accountForm, value: e.target.value })}
              placeholder="Value (e.g., dark)"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
            <button
              onClick={handleSetAccountVar}
              disabled={!accountForm.key || !activeSigner}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Set
            </button>
          </div>

          {/* Vars List */}
          {accountVars.length > 0 ? (
            <div className="space-y-2">
              {accountVars.map((v) => (
                <div
                  key={v.key}
                  className="flex items-center justify-between py-2 px-3 bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <code className="text-sm text-blue-400">{v.key}</code>
                    <span className="text-slate-500">=</span>
                    <span className="text-sm text-white">{v.value}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteVar('account', v.key)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">
              No account vars set.
            </p>
          )}
        </SectionCard>
      </Section>

      {/* App Vars */}
      <Section title="App Config" description="Application-level configuration vars.">
        <SectionCard>
          {/* Add Form */}
          <div className="flex gap-2 mb-4">
            <input
              value={appForm.key}
              onChange={(e) => setAppForm({ ...appForm, key: e.target.value })}
              placeholder="Key (e.g., featureFlag)"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
            <input
              value={appForm.value}
              onChange={(e) => setAppForm({ ...appForm, value: e.target.value })}
              placeholder="Value (e.g., enabled)"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
            <button
              onClick={handleSetAppVar}
              disabled={!appForm.key || !activeSigner}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              Set
            </button>
          </div>

          {/* Vars List */}
          {appVars.length > 0 ? (
            <div className="space-y-2">
              {appVars.map((v) => (
                <div
                  key={v.key}
                  className="flex items-center justify-between py-2 px-3 bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <code className="text-sm text-emerald-400">{v.key}</code>
                    <span className="text-slate-500">=</span>
                    <span className="text-sm text-white">{v.value}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteVar('app', v.key)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">
              No app vars set.
            </p>
          )}
        </SectionCard>
      </Section>

      {/* Source Code */}
      <Section title="Source Code" description="Full implementation for vars operations.">
        <CodePreview code={VarsDemoPageSource} language="tsx" />
      </Section>
    </div>
  );
};
