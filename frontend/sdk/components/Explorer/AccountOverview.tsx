/**
 * AccountOverview Component
 *
 * Displays account information including address, balances, and nonce.
 */

import React from 'react';
import { useAccount, useBalances } from '../../react/hooks';

// ============================================================
// Types
// ============================================================

export interface AccountOverviewProps {
  /** Account address to display */
  address: string;
  /** Additional CSS classes */
  className?: string;
  /** Show balances */
  showBalances?: boolean;
  /** Refetch interval in ms */
  refetchInterval?: number;
}

// ============================================================
// Component
// ============================================================

export const AccountOverview: React.FC<AccountOverviewProps> = ({
  address,
  className = '',
  showBalances = true,
  refetchInterval,
}) => {
  const { data: account, loading: accountLoading, error: accountError } = useAccount(address, {
    refetchInterval,
  });
  const { data: balances, loading: balancesLoading } = useBalances(address, {
    enabled: showBalances,
    refetchInterval,
  });

  if (accountLoading) {
    return (
      <div className={`animate-pulse bg-slate-100 rounded-lg p-6 ${className}`}>
        <div className="h-4 bg-slate-200 rounded w-3/4 mb-4" />
        <div className="h-4 bg-slate-200 rounded w-1/2" />
      </div>
    );
  }

  if (accountError) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
        <p className="text-red-600 text-sm">Error: {accountError}</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className={`bg-slate-50 border border-slate-200 rounded-lg p-6 ${className}`}>
        <p className="text-slate-500 text-sm">Account not found</p>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Account Overview</h3>
      </div>

      {/* Content */}
      <div className="px-6 py-4 space-y-4">
        {/* Address */}
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Address
          </label>
          <p className="mt-1 font-mono text-sm text-slate-900 break-all">{account.address}</p>
        </div>

        {/* Username */}
        {account.username && (
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Username
            </label>
            <p className="mt-1 text-sm text-slate-900">@{account.username}</p>
          </div>
        )}

        {/* Nonce */}
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Nonce
          </label>
          <p className="mt-1 text-sm text-slate-900">{account.nonce?.toString() || '0'}</p>
        </div>

        {/* Signature Algorithm */}
        {account.sigAlgId !== undefined && (
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Signature Algorithm
            </label>
            <p className="mt-1 text-sm text-slate-900">
              {account.sigAlgId === 1 ? 'Ed25519' : account.sigAlgId === 2 ? 'secp256k1' : `ID: ${account.sigAlgId}`}
            </p>
          </div>
        )}

        {/* Balances */}
        {showBalances && (
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Token Balances
            </label>
            {balancesLoading ? (
              <div className="mt-2 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/2" />
              </div>
            ) : balances && balances.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {balances.map((balance) => (
                  <li
                    key={balance.tokenId}
                    className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded"
                  >
                    <span className="text-sm font-medium text-slate-700">{balance.symbol}</span>
                    <span className="text-sm text-slate-900">{balance.formatted}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No token balances</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const AccountOverviewSource = `
import React from 'react';
import { useAccount, useBalances } from '@wasserstoff/wstf-kit/react';

export interface AccountOverviewProps {
  address: string;
  className?: string;
  showBalances?: boolean;
  refetchInterval?: number;
}

export const AccountOverview: React.FC<AccountOverviewProps> = ({
  address,
  className = '',
  showBalances = true,
  refetchInterval,
}) => {
  const { data: account, loading, error } = useAccount(address, { refetchInterval });
  const { data: balances } = useBalances(address, { enabled: showBalances, refetchInterval });

  if (loading) {
    return <div className="animate-pulse bg-slate-100 rounded-lg p-6">Loading...</div>;
  }

  if (error || !account) {
    return <div className="bg-red-50 rounded-lg p-6">Error: {error || 'Not found'}</div>;
  }

  return (
    <div className={\`bg-white border border-slate-200 rounded-lg \${className}\`}>
      <div className="px-6 py-4 border-b">
        <h3 className="text-lg font-semibold">Account Overview</h3>
      </div>
      <div className="px-6 py-4 space-y-4">
        <div>
          <label className="text-xs text-slate-500 uppercase">Address</label>
          <p className="font-mono text-sm">{account.address}</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase">Nonce</label>
          <p className="text-sm">{account.nonce?.toString()}</p>
        </div>
        {showBalances && balances?.map((b) => (
          <div key={b.tokenId} className="flex justify-between">
            <span>{b.symbol}</span>
            <span>{b.formatted}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
`.trim();
