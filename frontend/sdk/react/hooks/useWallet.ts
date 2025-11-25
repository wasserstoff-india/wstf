/**
 * useWallet Hook
 *
 * Wallet connection and management.
 */

import { useWstf } from '../WstfProvider';
import type { FrontendSigner, StoredWalletMeta } from '../../core/types';

export interface UseWalletReturn {
  /** Currently connected wallet */
  wallet: FrontendSigner | undefined;
  /** Current wallet address */
  address: string | undefined;
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Whether connection is in progress */
  isConnecting: boolean;
  /** List of stored wallets */
  wallets: StoredWalletMeta[];
  /** Connection error */
  error: string | undefined;
  /** Connect to a wallet */
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
  /** Sign data with current wallet */
  sign: (data: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Hook for wallet operations
 */
export function useWallet(): UseWalletReturn {
  const {
    wallet,
    wallets,
    isConnecting,
    error,
    connect,
    disconnect,
    createWallet,
    deleteWallet,
  } = useWstf();

  const sign = async (data: Uint8Array): Promise<Uint8Array> => {
    if (!wallet) {
      throw new Error('No wallet connected');
    }
    return wallet.sign(data);
  };

  return {
    wallet,
    address: wallet?.address,
    isConnected: !!wallet,
    isConnecting,
    wallets,
    error,
    connect,
    disconnect,
    createWallet,
    deleteWallet,
    sign,
  };
}
