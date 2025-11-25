/**
 * WSTF Provider
 *
 * React context provider for WSTF Chain integration.
 * Provides access to client, wallet, and chain state throughout the app.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { FrontendConfig, FrontendSigner, StoredWalletMeta, WalletEvent } from '../core/types';
import { WstfClient, createClient } from '../core/client';
import { WalletManager, createWalletManager } from '../core/wallet';
import { getDefaultConfig } from '../core/config';

// ============================================================
// Context Types
// ============================================================

export interface WstfContextValue {
  /** RPC client instance */
  client: WstfClient;
  /** Wallet manager instance */
  walletManager: WalletManager;
  /** Current configuration */
  config: FrontendConfig;
  /** Currently connected wallet */
  wallet: FrontendSigner | undefined;
  /** List of stored wallets */
  wallets: StoredWalletMeta[];
  /** Whether wallet is connecting */
  isConnecting: boolean;
  /** Connection error */
  error: string | undefined;
  /** Connect/select a wallet */
  connect: (walletId: string, password: string) => Promise<void>;
  /** Disconnect current wallet */
  disconnect: () => void;
  /** Create a new wallet */
  createWallet: (options: {
    sigAlg: 'ed25519' | 'secp256k1';
    label?: string;
    password: string;
  }) => Promise<FrontendSigner>;
  /** Delete a wallet */
  deleteWallet: (walletId: string) => Promise<void>;
  /** Refresh wallet list */
  refreshWallets: () => void;
}

// ============================================================
// Context
// ============================================================

const WstfContext = createContext<WstfContextValue | null>(null);

// ============================================================
// Provider Props
// ============================================================

export interface WstfProviderProps {
  /** Configuration or network profile */
  config?: FrontendConfig | 'devnet' | 'testnet' | 'mainnet';
  /** Child components */
  children: React.ReactNode;
  /** Auto-connect to last used wallet */
  autoConnect?: boolean;
  /** Callback when wallet connects */
  onConnect?: (wallet: FrontendSigner) => void;
  /** Callback when wallet disconnects */
  onDisconnect?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

// ============================================================
// Provider Component
// ============================================================

export function WstfProvider({
  config: configProp,
  children,
  autoConnect = false,
  onConnect,
  onDisconnect,
  onError,
}: WstfProviderProps): React.ReactElement {
  // Resolve configuration
  const config = useMemo(() => {
    if (!configProp || typeof configProp === 'string') {
      return getDefaultConfig(configProp || 'devnet');
    }
    return configProp;
  }, [configProp]);

  // Create client and wallet manager
  const client = useMemo(() => createClient(config), [config]);
  const walletManager = useMemo(() => createWalletManager(), []);

  // State
  const [wallet, setWallet] = useState<FrontendSigner | undefined>();
  const [wallets, setWallets] = useState<StoredWalletMeta[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Load wallets on mount
  useEffect(() => {
    setWallets(walletManager.listWallets());

    // Don't auto-set dummy wallets - let user explicitly connect
    // This prevents address mismatches between localStorage metadata and actual accounts
  }, [walletManager, autoConnect]);

  // Subscribe to wallet events
  useEffect(() => {
    const unsubscribe = walletManager.on((event: WalletEvent) => {
      if (event.type === 'connected') {
        setWallet(walletManager.current);
        // Store last connected wallet ID
        if (walletManager.current) {
          const meta = walletManager.current.getMeta();
          if (meta?.id) {
            localStorage.setItem('wstf-last-wallet-id', meta.id);
          }
        }
        onConnect?.(walletManager.current!);
      } else if (event.type === 'disconnected') {
        setWallet(undefined);
        // Remove stored wallet ID
        localStorage.removeItem('wstf-last-wallet-id');
        onDisconnect?.();
      }
    });
    return unsubscribe;
  }, [walletManager, onConnect, onDisconnect]);

  // Connect to wallet
  const connect = useCallback(
    async (walletId: string, password: string) => {
      setIsConnecting(true);
      setError(undefined);
      try {
        const signer = await walletManager.selectWallet(walletId, password);
        if (!signer) {
          throw new Error('Invalid password or wallet not found');
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error('Connection failed');
        setError(err.message);
        onError?.(err);
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [walletManager, onError]
  );

  // Disconnect wallet
  const disconnect = useCallback(() => {
    walletManager.disconnect();
  }, [walletManager]);

  // Create new wallet
  const createWallet = useCallback(
    async (options: { sigAlg: 'ed25519' | 'secp256k1'; label?: string; password: string }) => {
      setIsConnecting(true);
      setError(undefined);
      try {
        // Create local wallet
        const signer = await walletManager.createLocalWallet(options);

        // Also create the account in the backend
        const accountResponse = await client.createAccount({
          sigAlg: options.sigAlg,
          username: options.label, // Optional username
        });

        if (!accountResponse.success) {
          // If backend account creation fails, clean up local wallet
          const meta = signer.getMeta();
          if (meta?.id) {
            await walletManager.deleteWallet(meta.id);
          }
          throw new Error(accountResponse.error || 'Failed to create backend account');
        }

        setWallets(walletManager.listWallets());
        return signer;
      } catch (e) {
        const err = e instanceof Error ? e : new Error('Wallet creation failed');
        setError(err.message);
        onError?.(err);
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [walletManager, client, onError]
  );

  // Delete wallet
  const deleteWallet = useCallback(
    async (walletId: string) => {
      await walletManager.deleteWallet(walletId);
      setWallets(walletManager.listWallets());
    },
    [walletManager]
  );

  // Refresh wallet list
  const refreshWallets = useCallback(() => {
    setWallets(walletManager.listWallets());
  }, [walletManager]);

  // Context value
  const value = useMemo<WstfContextValue>(
    () => ({
      client,
      walletManager,
      config,
      wallet,
      wallets,
      isConnecting,
      error,
      connect,
      disconnect,
      createWallet,
      deleteWallet,
      refreshWallets,
    }),
    [
      client,
      walletManager,
      config,
      wallet,
      wallets,
      isConnecting,
      error,
      connect,
      disconnect,
      createWallet,
      deleteWallet,
      refreshWallets,
    ]
  );

  return <WstfContext.Provider value={value}>{children}</WstfContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

/**
 * Access WSTF context
 */
export function useWstf(): WstfContextValue {
  const context = useContext(WstfContext);
  if (!context) {
    throw new Error('useWstf must be used within a WstfProvider');
  }
  return context;
}
