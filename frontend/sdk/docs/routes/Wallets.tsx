/**
 * Wallets Page
 *
 * Documentation for wallet components and hooks.
 */

import React, { useState } from 'react';
import { useWallet } from '../../react/hooks';
import {
  WalletOnboard,
  WalletOnboardSource,
  AddressPill,
  AddressPillSource,
  PaperWalletCard,
  PaperWalletCardSource,
  WalletSwitcher,
  WalletSwitcherSource,
} from '../../components/Wallet';
import { Section, SectionCard, SectionGrid, CodePreview } from '../components';

// ============================================================
// Component
// ============================================================

export const WalletsPage: React.FC = () => {
  const { wallets, activeSigner, createWallet, disconnect } = useWallet();
  const [showCode, setShowCode] = useState<string | null>(null);
  const [demoSecret, setDemoSecret] = useState<string | null>(null);

  const handleCreateDemo = async () => {
    // Generate a demo secret for paper wallet preview
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    setDemoSecret(hex);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white">Wallet Components</h1>
        <p className="mt-1 text-sm text-slate-400">
          Multi-algorithm wallet management with encrypted browser storage.
        </p>
      </div>

      {/* Current Wallet Status */}
      <Section title="Current State">
        <SectionCard>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Wallets:</span>
              <span className="ml-2 text-white">{wallets.length}</span>
            </div>
            <div>
              <span className="text-slate-500">Active:</span>
              <span className="ml-2 text-white">
                {activeSigner ? (
                  <AddressPill address={activeSigner.address} size="sm" />
                ) : (
                  'None'
                )}
              </span>
            </div>
          </div>
        </SectionCard>
      </Section>

      {/* WalletOnboard */}
      <Section
        title="WalletOnboard"
        description="Full wallet creation and unlock flow."
      >
        <SectionGrid>
          <div>
            <WalletOnboard
              onWalletCreated={(address) => console.log('Created:', address)}
              onWalletConnected={(address) => console.log('Connected:', address)}
            />
          </div>
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Features</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Create new wallets with Ed25519 or secp256k1
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Password-protected encrypted storage
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Select from existing wallets
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Unlock with password
              </li>
            </ul>
            <button
              onClick={() => setShowCode(showCode === 'onboard' ? null : 'onboard')}
              className="mt-4 text-xs text-blue-400 hover:text-blue-300"
            >
              {showCode === 'onboard' ? 'Hide Code' : 'View Code'}
            </button>
          </SectionCard>
        </SectionGrid>
        {showCode === 'onboard' && <CodePreview code={WalletOnboardSource} language="tsx" />}
      </Section>

      {/* AddressPill */}
      <Section
        title="AddressPill"
        description="Compact address display with copy functionality."
      >
        <SectionGrid cols={3}>
          <SectionCard>
            <h4 className="text-xs text-slate-500 mb-2">Size: sm</h4>
            <AddressPill address="gc1234567890abcdef1234567890abcdef12345678" size="sm" />
          </SectionCard>
          <SectionCard>
            <h4 className="text-xs text-slate-500 mb-2">Size: md (default)</h4>
            <AddressPill address="gc1234567890abcdef1234567890abcdef12345678" size="md" />
          </SectionCard>
          <SectionCard>
            <h4 className="text-xs text-slate-500 mb-2">Size: lg</h4>
            <AddressPill address="gc1234567890abcdef1234567890abcdef12345678" size="lg" />
          </SectionCard>
        </SectionGrid>
        <div className="mt-4">
          <button
            onClick={() => setShowCode(showCode === 'pill' ? null : 'pill')}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showCode === 'pill' ? 'Hide Code' : 'View Code'}
          </button>
        </div>
        {showCode === 'pill' && <CodePreview code={AddressPillSource} language="tsx" />}
      </Section>

      {/* WalletSwitcher */}
      <Section
        title="WalletSwitcher"
        description="Dropdown for switching between wallets."
      >
        <SectionGrid>
          <SectionCard>
            <div className="flex justify-center py-4">
              <WalletSwitcher
                onSwitch={(id) => console.log('Switch to:', id)}
                onCreateNew={() => console.log('Create new')}
              />
            </div>
          </SectionCard>
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Features</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Shows all available wallets
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Highlights active wallet
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Quick switch between accounts
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Add new wallet button
              </li>
            </ul>
          </SectionCard>
        </SectionGrid>
        <div className="mt-4">
          <button
            onClick={() => setShowCode(showCode === 'switcher' ? null : 'switcher')}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showCode === 'switcher' ? 'Hide Code' : 'View Code'}
          </button>
        </div>
        {showCode === 'switcher' && <CodePreview code={WalletSwitcherSource} language="tsx" />}
      </Section>

      {/* PaperWalletCard */}
      <Section
        title="PaperWalletCard"
        description="Display recovery phrase or private key for backup."
      >
        <SectionGrid>
          <div>
            {demoSecret ? (
              <PaperWalletCard
                secret={demoSecret}
                secretType="privateKey"
                address="gc1234567890abcdef1234567890abcdef12345678"
                sigAlg="ed25519"
                label="Demo Wallet"
                onBackupConfirmed={() => console.log('Backup confirmed')}
              />
            ) : (
              <SectionCard>
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400 mb-4">
                    Click to generate a demo private key preview.
                  </p>
                  <button
                    onClick={handleCreateDemo}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                  >
                    Generate Demo Key
                  </button>
                </div>
              </SectionCard>
            )}
          </div>
          <SectionCard>
            <h4 className="text-sm font-medium text-white mb-2">Features</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-amber-400">!</span>
                Click to reveal pattern for security
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Supports mnemonic or private key display
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Copy to clipboard functionality
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">+</span>
                Backup confirmation callback
              </li>
            </ul>
          </SectionCard>
        </SectionGrid>
        <div className="mt-4">
          <button
            onClick={() => setShowCode(showCode === 'paper' ? null : 'paper')}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showCode === 'paper' ? 'Hide Code' : 'View Code'}
          </button>
        </div>
        {showCode === 'paper' && <CodePreview code={PaperWalletCardSource} language="tsx" />}
      </Section>

      {/* useWallet Hook */}
      <Section
        title="useWallet Hook"
        description="React hook for wallet management."
      >
        <CodePreview
          code={`import { useWallet } from '@wasserstoff/wstf-kit/react';

function WalletManager() {
  const {
    // State
    wallets,           // WalletInfo[] - all stored wallets
    activeSigner,      // Signer | null - currently unlocked wallet
    isConnecting,      // boolean - loading state
    error,             // string | null - error message

    // Actions
    createWallet,      // (opts: CreateWalletOpts) => Promise<Signer>
    connect,           // (walletId: string, password: string) => Promise<void>
    disconnect,        // () => void
    removeWallet,      // (walletId: string) => Promise<void>
  } = useWallet();

  // Create a new wallet
  const handleCreate = async () => {
    const signer = await createWallet({
      sigAlg: 'ed25519',
      label: 'My Wallet',
      password: 'secure-password',
    });
    console.log('Created:', signer.address);
  };

  // Unlock existing wallet
  const handleConnect = async (id: string) => {
    await connect(id, 'user-password');
  };

  return (
    <div>
      {wallets.map(w => (
        <button key={w.id} onClick={() => handleConnect(w.id)}>
          {w.label || w.address}
        </button>
      ))}
    </div>
  );
}`}
          language="tsx"
        />
      </Section>
    </div>
  );
};
