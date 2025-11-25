/**
 * WstfProvider - Main context provider for @wasserstoff/wstf-kit
 *
 * Provides network configuration, SDK instance, and wallet connection
 * to all child components.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { WSTFSDK } from '../../sdk/sdk';
import type { NetworkName, NetworkProfile } from '../../sdk/types';
import type { WalletConnection, WalletAccount } from '../types';
import { DEFAULT_NETWORKS } from '../../sdk/network/config';

/**
 * WSTF Context data
 */
export interface WstfContextData {
  // SDK and network
  sdk: WSTFSDK | null;
  networkProfile: NetworkProfile | null;
  loading: boolean;
  error: string | null;

  // Network management
  switchNetwork: (nameOrProfile: NetworkName | NetworkProfile) => Promise<void>;
  availableNetworks: NetworkProfile[];

  // Wallet connection
  wallet: WalletConnection;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

/**
 * WSTF Context
 */
export const WstfContext = createContext<WstfContextData | null>(null);

/**
 * Provider props
 */
export interface WstfProviderProps {
  /** Initial network to connect to */
  network?: NetworkName | NetworkProfile;

  /** Custom network profiles */
  customNetworks?: NetworkProfile[];

  /** Auto-connect wallet on load */
  autoConnect?: boolean;

  /** Children components */
  children: ReactNode;

  /** Callback when network changes */
  onNetworkChange?: (profile: NetworkProfile) => void;

  /** Callback when wallet connects/disconnects */
  onWalletChange?: (wallet: WalletConnection) => void;
}

/**
 * WSTF Provider component
 */
export function WstfProvider({
  network = 'local',
  customNetworks = [],
  autoConnect = false,
  children,
  onNetworkChange,
  onWalletChange,
}: WstfProviderProps) {
  const [sdk, setSdk] = useState<WSTFSDK | null>(null);
  const [networkProfile, setNetworkProfile] = useState<NetworkProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletConnection>({
    connected: false,
    connecting: false,
  });

  // Available networks (default + custom)
  const availableNetworks = [
    ...Object.values(DEFAULT_NETWORKS),
    ...customNetworks,
  ];

  // Initialize SDK with network
  const initializeSdk = async (networkConfig: NetworkName | NetworkProfile) => {
    try {
      setLoading(true);
      setError(null);

      // Resolve network profile
      let profile: NetworkProfile;
      if (typeof networkConfig === 'string') {
        const found = availableNetworks.find(n => n.name === networkConfig);
        if (!found) {
          throw new Error(`Network not found: ${networkConfig}`);
        }
        profile = found;
      } else {
        profile = networkConfig;
      }

      // Create SDK instance
      const newSdk = WSTFSDK.create({
        network: profile,
        rpcUrls: profile.rpcUrls,
        timeoutMs: 30000,
      });

      // Test connectivity
      const connectivity = await newSdk.testConnectivity();
      if (!connectivity.healthy) {
        throw new Error(connectivity.error || 'Network unreachable');
      }

      setSdk(newSdk);
      setNetworkProfile(profile);
      onNetworkChange?.(profile);

    } catch (err) {
      setError(String(err));
      setSdk(null);
      setNetworkProfile(null);
    } finally {
      setLoading(false);
    }
  };

  // Switch network
  const switchNetwork = async (nameOrProfile: NetworkName | NetworkProfile) => {
    await initializeSdk(nameOrProfile);
  };

  // Connect wallet (placeholder implementation)
  const connectWallet = async () => {
    try {
      setWallet({ ...wallet, connecting: true });

      // Placeholder: In a real implementation, this would:
      // 1. Check for installed wallet extensions
      // 2. Request connection permission
      // 3. Get account info and balances

      // For demo purposes, create a mock account
      const mockAccount: WalletAccount = {
        address: 'gc1demo12345678901234567890123456789012345678',
        publicKey: 'demo_public_key_base64_encoded_string',
        sigAlg: 'ed25519',
        balance: 1000000000n, // 1000 WSTF
      };

      const newWallet: WalletConnection = {
        connected: true,
        account: mockAccount,
        connecting: false,
      };

      setWallet(newWallet);
      onWalletChange?.(newWallet);

    } catch (err) {
      setWallet({
        connected: false,
        connecting: false,
        error: String(err),
      });
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    const newWallet: WalletConnection = {
      connected: false,
      connecting: false,
    };
    setWallet(newWallet);
    onWalletChange?.(newWallet);
  };

  // Initialize on mount
  useEffect(() => {
    initializeSdk(network);
  }, []);

  // Auto-connect wallet
  useEffect(() => {
    if (autoConnect && !wallet.connected && !wallet.connecting) {
      connectWallet();
    }
  }, [autoConnect, sdk]);

  const contextValue: WstfContextData = {
    sdk,
    networkProfile,
    loading,
    error,
    switchNetwork,
    availableNetworks,
    wallet,
    connectWallet,
    disconnectWallet,
  };

  return (
    <WstfContext.Provider value={contextValue}>
      {children}
    </WstfContext.Provider>
  );
}

/**
 * Hook to use WSTF context
 */
export function useWstfContext(): WstfContextData {
  const context = useContext(WstfContext);
  if (!context) {
    throw new Error('useWstfContext must be used within a WstfProvider');
  }
  return context;
}

/**
 * Hook to get the current SDK instance
 */
export function useWstfClient() {
  const { sdk, loading, error } = useWstfContext();
  return { sdk, loading, error };
}

/**
 * Hook to get wallet connection status
 */
export function useWallet() {
  const { wallet, connectWallet, disconnectWallet } = useWstfContext();
  return {
    ...wallet,
    connect: connectWallet,
    disconnect: disconnectWallet,
  };
}