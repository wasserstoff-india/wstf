/**
 * NetworkSwitcher - Component for switching between networks
 *
 * Provides a dropdown interface for selecting different WSTFChain networks
 * (local, devnet, testnet, mainnet).
 */

import React, { useState } from 'react';
import { useNetwork } from '../hooks/useNetwork';
import type { NetworkProfile, NetworkName, ComponentStyleProps } from '../types';

export interface NetworkSwitcherProps extends ComponentStyleProps {
  /** Show network labels in dropdown */
  showLabel?: boolean;

  /** Show chain IDs */
  showChainId?: boolean;

  /** Show network latency */
  showLatency?: boolean;

  /** Disable network switching */
  disabled?: boolean;

  /** Custom filter for available networks */
  networkFilter?: (network: NetworkProfile) => boolean;

  /** Callback when network changes */
  onNetworkChange?: (network: NetworkProfile) => void;
}

/**
 * Network switcher component
 */
export function NetworkSwitcher({
  showLabel = true,
  showChainId = false,
  showLatency = false,
  disabled = false,
  networkFilter,
  onNetworkChange,
  className = '',
  style,
}: NetworkSwitcherProps) {
  const { profile, availableNetworks, loading, switchNetwork } = useNetwork();
  const [switching, setSwitching] = useState(false);

  // Filter networks if filter provided
  const filteredNetworks = networkFilter
    ? availableNetworks.filter(networkFilter)
    : availableNetworks;

  const handleNetworkSwitch = async (networkName: NetworkName) => {
    if (disabled || switching) return;

    try {
      setSwitching(true);
      await switchNetwork(networkName);
      const newProfile = filteredNetworks.find(n => n.name === networkName);
      if (newProfile) {
        onNetworkChange?.(newProfile);
      }
    } catch (error) {
      console.error('Failed to switch network:', error);
    } finally {
      setSwitching(false);
    }
  };

  const getNetworkStatus = (network: NetworkProfile) => {
    if (network.name === 'local') return '🟡 Local';
    if (network.name === 'devnet') return '🟠 Devnet';
    if (network.name === 'testnet') return '🔵 Testnet';
    if (network.name === 'mainnet') return '🟢 Mainnet';
    return '⚪ Custom';
  };

  return (
    <div className={`relative ${className}`} style={style}>
      <select
        value={profile?.name || ''}
        onChange={(e) => handleNetworkSwitch(e.target.value as NetworkName)}
        disabled={disabled || loading || switching}
        className={`
          appearance-none bg-white border border-gray-300 rounded-md
          px-3 py-2 pr-8 text-sm font-medium text-gray-700
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:bg-gray-100 disabled:cursor-not-allowed
          ${disabled || loading || switching ? 'opacity-50' : ''}
        `}
      >
        {!profile && (
          <option value="" disabled>
            {loading ? 'Loading networks...' : 'Select network'}
          </option>
        )}

        {filteredNetworks.map((network) => (
          <option key={network.name} value={network.name}>
            {getNetworkStatus(network)}
            {showLabel && ` ${network.label}`}
            {showChainId && ` (${network.chainId})`}
          </option>
        ))}
      </select>

      {/* Dropdown arrow */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${
            switching ? 'animate-spin' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {switching ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          )}
        </svg>
      </div>

      {/* Network info tooltip */}
      {profile && showLatency && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-black text-white text-xs rounded shadow-lg z-50 hidden group-hover:block">
          <div>Network: {profile.label}</div>
          <div>Chain ID: {profile.chainId}</div>
          <div>RPC: {profile.rpcUrls.core}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Component source code for copy-paste usage
 */
export const NetworkSwitcherSource = `
import React from 'react';
import { NetworkSwitcher } from '@wasserstoff/wstf-kit';

function MyApp() {
  return (
    <div className="flex items-center gap-4">
      <h1>My WSTFChain App</h1>
      <NetworkSwitcher
        showLabel={true}
        showChainId={true}
        onNetworkChange={(network) => {
          console.log('Switched to network:', network.label);
        }}
      />
    </div>
  );
}
`;