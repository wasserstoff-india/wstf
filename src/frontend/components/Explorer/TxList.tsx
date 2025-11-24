/**
 * TxList Component
 *
 * Displays a list of recent transactions.
 */

import React from 'react';
import { useLatestTransactions } from '../../react/hooks';

// ============================================================
// Types
// ============================================================

export interface TxListProps {
  /** Number of transactions to show */
  limit?: number;
  /** Additional CSS classes */
  className?: string;
  /** Refetch interval in ms */
  refetchInterval?: number;
  /** Callback when transaction is clicked */
  onTxClick?: (txId: string) => void;
}

// ============================================================
// Helpers
// ============================================================

function truncateHash(hash: string, chars: number = 8): string {
  if (hash.length <= chars * 2) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

function formatTimestamp(ts: bigint): string {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleString();
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-slate-100 text-slate-800';
  }
}

// ============================================================
// Component
// ============================================================

export const TxList: React.FC<TxListProps> = ({
  limit = 10,
  className = '',
  refetchInterval,
  onTxClick,
}) => {
  const { data: transactions, loading, error, refetch } = useLatestTransactions({
    limit,
    refetchInterval,
  });

  if (loading && !transactions) {
    return (
      <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
        </div>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
        </div>
        <div className="p-6">
          <p className="text-red-600 text-sm">Error: {error}</p>
          <button
            onClick={refetch}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
        <button
          onClick={refetch}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              <th className="px-6 py-3">TX Hash</th>
              <th className="px-6 py-3">Type</th>
              <th className="px-6 py-3">From</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions && transactions.length > 0 ? (
              transactions.map((tx) => (
                <tr
                  key={tx.txId}
                  className={`hover:bg-slate-50 ${onTxClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onTxClick?.(tx.txId)}
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-blue-600">
                      {truncateHash(tx.txId)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-700 capitalize">{tx.type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-slate-600">
                      {truncateHash(tx.from)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(tx.status)}`}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-500">
                      {formatTimestamp(tx.timestamp)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No transactions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const TxListSource = `
import React from 'react';
import { useLatestTransactions } from '@wasserstoff/wstf-kit/react';

export const TxList: React.FC<{ limit?: number; onTxClick?: (txId: string) => void }> = ({
  limit = 10,
  onTxClick,
}) => {
  const { data: transactions, loading, error, refetch } = useLatestTransactions({ limit });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="bg-white border rounded-lg">
      <div className="px-6 py-4 border-b flex justify-between">
        <h3 className="font-semibold">Recent Transactions</h3>
        <button onClick={refetch} className="text-blue-600">Refresh</button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-xs text-slate-500 uppercase">
            <th className="px-6 py-3 text-left">TX Hash</th>
            <th className="px-6 py-3 text-left">Type</th>
            <th className="px-6 py-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions?.map((tx) => (
            <tr key={tx.txId} onClick={() => onTxClick?.(tx.txId)} className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono text-sm">{tx.txId.slice(0, 16)}...</td>
              <td className="px-6 py-4">{tx.type}</td>
              <td className="px-6 py-4">{tx.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
`.trim();
