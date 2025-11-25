/**
 * ConnectWallet - Component for wallet connection
 */

import React from 'react';
import { useWallet } from '../hooks';
import type { ComponentStyleProps } from '../types';

export interface ConnectWalletProps extends ComponentStyleProps {
  /** Custom button text */
  buttonText?: string;
  /** Show account info when connected */
  showAccount?: boolean;
}

export function ConnectWallet({
  buttonText = 'Connect Wallet',
  showAccount = true,
  className = '',
  style,
}: ConnectWalletProps) {
  const { connected, account, connecting, connect, disconnect } = useWallet();

  if (connected && account) {
    return (
      <div className={`flex items-center gap-3 ${className}`} style={style}>
        {showAccount && (
          <div className="text-sm text-gray-600">
            {account.address.slice(0, 8)}...{account.address.slice(-6)}
          </div>
        )}
        <button
          onClick={disconnect}
          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 ${className}`}
      style={style}
    >
      {connecting ? 'Connecting...' : buttonText}
    </button>
  );
}