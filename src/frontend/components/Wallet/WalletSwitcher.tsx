/**
 * WalletSwitcher Component
 *
 * Dropdown component for switching between multiple wallets.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '../../react/hooks';

// ============================================================
// Types
// ============================================================

export interface WalletSwitcherProps {
  /** Additional CSS classes */
  className?: string;
  /** Callback when wallet is switched */
  onSwitch?: (walletId: string) => void;
  /** Callback to create new wallet */
  onCreateNew?: () => void;
}

// ============================================================
// Component
// ============================================================

export const WalletSwitcher: React.FC<WalletSwitcherProps> = ({
  className = '',
  onSwitch,
  onCreateNew,
}) => {
  const { wallets, activeSigner } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const activeWallet = wallets.find((w) => w.address === activeSigner?.address);

  const handleSelect = (walletId: string) => {
    setIsOpen(false);
    onSwitch?.(walletId);
  };

  if (wallets.length === 0) {
    return (
      <button
        onClick={onCreateNew}
        className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors ${className}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Connect Wallet
      </button>
    );
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
      >
        {/* Wallet Icon */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
          <span className="text-xs font-bold text-white">
            {(activeWallet?.label || 'W')[0].toUpperCase()}
          </span>
        </div>

        <div className="text-left">
          <p className="text-sm font-medium text-slate-900">
            {activeWallet?.label || 'Unnamed Wallet'}
          </p>
          {activeSigner && (
            <p className="text-xs font-mono text-slate-500">
              {activeSigner.address.slice(0, 8)}...{activeSigner.address.slice(-4)}
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
          {/* Wallet List */}
          <div className="max-h-64 overflow-y-auto py-2">
            {wallets.map((wallet) => {
              const isActive = wallet.address === activeSigner?.address;

              return (
                <button
                  key={wallet.id}
                  onClick={() => handleSelect(wallet.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${
                    isActive ? 'bg-blue-50' : ''
                  }`}
                >
                  {/* Wallet Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isActive
                        ? 'bg-gradient-to-br from-blue-400 to-purple-500'
                        : 'bg-slate-200'
                    }`}
                  >
                    <span className={`text-xs font-bold ${isActive ? 'text-white' : 'text-slate-600'}`}>
                      {(wallet.label || 'W')[0].toUpperCase()}
                    </span>
                  </div>

                  {/* Wallet Info */}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-slate-900">
                      {wallet.label || 'Unnamed Wallet'}
                    </p>
                    <p className="text-xs font-mono text-slate-500">
                      {wallet.address.slice(0, 8)}...{wallet.address.slice(-4)}
                    </p>
                  </div>

                  {/* Active Indicator */}
                  {isActive && (
                    <div className="flex items-center gap-1 text-blue-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Algorithm Badge */}
                  <span className="text-xs text-slate-400 uppercase">{wallet.sigAlg}</span>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200" />

          {/* Create New */}
          <button
            onClick={() => {
              setIsOpen(false);
              onCreateNew?.();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-blue-600"
          >
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-sm font-medium">Add Wallet</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const WalletSwitcherSource = `
import React, { useState } from 'react';
import { useWallet } from '@wasserstoff/wstf-kit/react';

export const WalletSwitcher: React.FC = () => {
  const { wallets, activeSigner } = useWallet();
  const [isOpen, setIsOpen] = useState(false);

  const activeWallet = wallets.find((w) => w.address === activeSigner?.address);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 border rounded-lg"
      >
        <span>{activeWallet?.label || 'Select Wallet'}</span>
        <span className="text-xs font-mono">
          {activeSigner?.address.slice(0, 8)}...
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white border rounded-lg shadow-lg">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-left hover:bg-slate-50"
            >
              <p className="font-medium">{wallet.label}</p>
              <p className="text-xs text-slate-500">{wallet.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
`.trim();
