/**
 * WalletOnboard Component
 *
 * Wallet creation and connection UI for new users.
 */

import React, { useState } from 'react';
import { useWallet } from '../../react/hooks';

// ============================================================
// Types
// ============================================================

export interface WalletOnboardProps {
  /** Additional CSS classes */
  className?: string;
  /** Callback when wallet is created */
  onWalletCreated?: (address: string) => void;
  /** Callback when wallet is connected */
  onWalletConnected?: (address: string) => void;
  /** Default signature algorithm */
  defaultSigAlg?: 'ed25519' | 'secp256k1';
}

// ============================================================
// Component
// ============================================================

export const WalletOnboard: React.FC<WalletOnboardProps> = ({
  className = '',
  onWalletCreated,
  onWalletConnected,
  defaultSigAlg = 'ed25519',
}) => {
  const { wallets, isConnecting, error, createWallet, connect } = useWallet();

  const [mode, setMode] = useState<'select' | 'create' | 'unlock'>('select');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [label, setLabel] = useState('');
  const [sigAlg, setSigAlg] = useState<'ed25519' | 'secp256k1'>(defaultSigAlg);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleCreateWallet = async () => {
    setLocalError('');

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      const signer = await createWallet({ sigAlg, label: label || undefined, password });
      onWalletCreated?.(signer.address);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Failed to create wallet');
    }
  };

  const handleUnlockWallet = async () => {
    setLocalError('');

    if (!selectedWalletId) {
      setLocalError('Please select a wallet');
      return;
    }

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    try {
      await connect(selectedWalletId, password);
      const wallet = wallets.find((w) => w.id === selectedWalletId);
      if (wallet) {
        onWalletConnected?.(wallet.address);
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Failed to unlock wallet');
    }
  };

  const displayError = localError || error;

  return (
    <div className={`bg-gradient-to-br from-slate-900 to-slate-950 border border-green-800/40 rounded-xl shadow-2xl ${className}`}
         style={{ boxShadow: '0 0 30px rgba(34, 197, 94, 0.15), 0 8px 32px rgba(0, 0, 0, 0.3)' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-green-700/30 bg-gradient-to-r from-slate-800/50 to-slate-900/50">
        <h3 className="text-xl font-bold text-green-100 flex items-center gap-2">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          {mode === 'create' ? 'Create WSTF Wallet' : mode === 'unlock' ? 'Unlock WSTF Wallet' : 'Connect to WSTF'}
        </h3>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {mode === 'select' && (
          <div className="space-y-5">
            {wallets.length > 0 ? (
              <>
                <p className="text-sm text-green-300/80">Select an existing wallet or create a new one.</p>

                {/* Wallet List */}
                <div className="space-y-3">
                  {wallets.map((wallet) => (
                    <button
                      key={wallet.id}
                      onClick={() => {
                        setSelectedWalletId(wallet.id);
                        setMode('unlock');
                      }}
                      className="w-full text-left px-4 py-4 border border-green-700/40 rounded-lg hover:bg-green-950/30 hover:border-green-600/50 transition-all duration-200 bg-slate-800/30"
                      style={{ boxShadow: '0 2px 8px rgba(34, 197, 94, 0.1)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-green-100">
                            {wallet.label || 'Unnamed Wallet'}
                          </p>
                          <p className="text-xs font-mono text-green-400/70 mt-1">
                            {wallet.address.slice(0, 12)}...{wallet.address.slice(-8)}
                          </p>
                        </div>
                        <span className="text-xs text-green-500 uppercase font-medium bg-green-950/50 px-2 py-1 rounded">
                          {wallet.sigAlg}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-green-700/40" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-gradient-to-r from-slate-900 to-slate-950 text-green-300/80">or</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-green-300/80">No wallets found. Create your first WSTF wallet to get started.</p>
            )}

            <button
              onClick={() => setMode('create')}
              className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg font-semibold hover:from-green-500 hover:to-green-600 transition-all duration-200 border border-green-500/30"
              style={{ boxShadow: '0 0 20px rgba(34, 197, 94, 0.3)' }}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Wallet
              </span>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-6">
            {/* Label */}
            <div>
              <label className="block text-sm font-semibold text-green-300 mb-2">
                Wallet Name (optional)
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="My WSTF Wallet"
                className="w-full px-4 py-3 border border-green-700/40 rounded-lg focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-green-100 bg-slate-800/50 placeholder:text-green-400/50 transition-all duration-200"
                style={{ boxShadow: '0 2px 8px rgba(34, 197, 94, 0.1)' }}
              />
            </div>

            {/* Signature Algorithm */}
            <div>
              <label className="block text-sm font-semibold text-green-300 mb-3">
                Signature Algorithm
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSigAlg('ed25519')}
                  className={`px-4 py-3 border rounded-lg text-sm font-semibold transition-all duration-200 ${
                    sigAlg === 'ed25519'
                      ? 'border-green-500 bg-green-500/20 text-green-300 shadow-lg'
                      : 'border-green-700/40 text-green-400/80 hover:bg-green-950/30 hover:border-green-600/50'
                  }`}
                  style={{
                    boxShadow: sigAlg === 'ed25519' ? '0 0 15px rgba(34, 197, 94, 0.4)' : '0 2px 4px rgba(34, 197, 94, 0.1)'
                  }}
                >
                  Ed25519
                </button>
                <button
                  onClick={() => setSigAlg('secp256k1')}
                  className={`px-4 py-3 border rounded-lg text-sm font-semibold transition-all duration-200 ${
                    sigAlg === 'secp256k1'
                      ? 'border-green-500 bg-green-500/20 text-green-300 shadow-lg'
                      : 'border-green-700/40 text-green-400/80 hover:bg-green-950/30 hover:border-green-600/50'
                  }`}
                  style={{
                    boxShadow: sigAlg === 'secp256k1' ? '0 0 15px rgba(34, 197, 94, 0.4)' : '0 2px 4px rgba(34, 197, 94, 0.1)'
                  }}
                >
                  secp256k1
                </button>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-green-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a strong password"
                className="w-full px-4 py-3 border border-green-700/40 rounded-lg focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-green-100 bg-slate-800/50 placeholder:text-green-400/50 transition-all duration-200"
                style={{ boxShadow: '0 2px 8px rgba(34, 197, 94, 0.1)' }}
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-semibold text-green-300 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-4 py-3 border border-green-700/40 rounded-lg focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-green-100 bg-slate-800/50 placeholder:text-green-400/50 transition-all duration-200"
                style={{ boxShadow: '0 2px 8px rgba(34, 197, 94, 0.1)' }}
              />
            </div>

            {/* Error */}
            {displayError && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/30">
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {displayError}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setMode('select');
                  setPassword('');
                  setConfirmPassword('');
                  setLocalError('');
                }}
                className="flex-1 px-4 py-3 border border-green-700/40 text-green-300 rounded-lg font-semibold hover:bg-green-950/30 hover:border-green-600/50 transition-all duration-200"
              >
                Back
              </button>
              <button
                onClick={handleCreateWallet}
                disabled={isConnecting}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg font-semibold hover:from-green-500 hover:to-green-600 disabled:opacity-50 transition-all duration-200 border border-green-500/30 disabled:cursor-not-allowed"
                style={{ boxShadow: !isConnecting ? '0 0 20px rgba(34, 197, 94, 0.3)' : 'none' }}
              >
                {isConnecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Wallet
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {mode === 'unlock' && (
          <div className="space-y-6">
            <p className="text-sm text-green-300/80">Enter your password to unlock your WSTF wallet.</p>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-green-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 border border-green-700/40 rounded-lg focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-green-100 bg-slate-800/50 placeholder:text-green-400/50 transition-all duration-200"
                style={{ boxShadow: '0 2px 8px rgba(34, 197, 94, 0.1)' }}
              />
            </div>

            {/* Error */}
            {displayError && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/30">
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {displayError}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setMode('select');
                  setPassword('');
                  setLocalError('');
                }}
                className="flex-1 px-4 py-3 border border-green-700/40 text-green-300 rounded-lg font-semibold hover:bg-green-950/30 hover:border-green-600/50 transition-all duration-200"
              >
                Back
              </button>
              <button
                onClick={handleUnlockWallet}
                disabled={isConnecting}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg font-semibold hover:from-green-500 hover:to-green-600 disabled:opacity-50 transition-all duration-200 border border-green-500/30 disabled:cursor-not-allowed"
                style={{ boxShadow: !isConnecting ? '0 0 20px rgba(34, 197, 94, 0.3)' : 'none' }}
              >
                {isConnecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Unlocking...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                    Unlock
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const WalletOnboardSource = `
import React, { useState } from 'react';
import { useWallet } from '@wasserstoff/wstf-kit/react';

export const WalletOnboard: React.FC = () => {
  const { wallets, createWallet, connect, isConnecting, error } = useWallet();
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [password, setPassword] = useState('');
  const [sigAlg, setSigAlg] = useState<'ed25519' | 'secp256k1'>('ed25519');

  const handleCreate = async () => {
    await createWallet({ sigAlg, password });
  };

  return (
    <div className="bg-white border rounded-lg p-6">
      {mode === 'select' ? (
        <>
          {wallets.map((w) => (
            <button key={w.id} onClick={() => connect(w.id, password)}>
              {w.label || w.address}
            </button>
          ))}
          <button onClick={() => setMode('create')}>Create New</button>
        </>
      ) : (
        <>
          <select value={sigAlg} onChange={(e) => setSigAlg(e.target.value as any)}>
            <option value="ed25519">Ed25519</option>
            <option value="secp256k1">secp256k1</option>
          </select>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button onClick={handleCreate} disabled={isConnecting}>Create</button>
          {error && <p className="text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
};
`.trim();
