/**
 * BlockList Component
 *
 * Displays a list of recent blocks.
 */

import React from 'react';
import { useLatestBlocks } from '../../react/hooks';

// ============================================================
// Types
// ============================================================

export interface BlockListProps {
  /** Number of blocks to show */
  limit?: number;
  /** Additional CSS classes */
  className?: string;
  /** Refetch interval in ms */
  refetchInterval?: number;
  /** Callback when block is clicked */
  onBlockClick?: (height: bigint) => void;
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

function timeAgo(ts: bigint): string {
  const now = Date.now() / 1000;
  const diff = now - Number(ts);

  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ============================================================
// Component
// ============================================================

export const BlockList: React.FC<BlockListProps> = ({
  limit = 10,
  className = '',
  refetchInterval,
  onBlockClick,
}) => {
  const { data: blocks, loading, error, refetch } = useLatestBlocks({
    limit,
    refetchInterval,
  });

  if (loading && !blocks) {
    return (
      <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Recent Blocks</h3>
        </div>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded" />
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
          <h3 className="text-lg font-semibold text-slate-900">Recent Blocks</h3>
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
        <h3 className="text-lg font-semibold text-slate-900">Recent Blocks</h3>
        <button
          onClick={refetch}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {/* Block List */}
      <div className="divide-y divide-slate-100">
        {blocks && blocks.length > 0 ? (
          blocks.map((block) => (
            <div
              key={block.height.toString()}
              className={`px-6 py-4 hover:bg-slate-50 ${onBlockClick ? 'cursor-pointer' : ''}`}
              onClick={() => onBlockClick?.(block.height)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Block Icon */}
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                  </div>

                  {/* Block Info */}
                  <div>
                    <p className="font-semibold text-slate-900">
                      Block #{block.height.toString()}
                    </p>
                    <p className="text-sm text-slate-500">
                      {block.txCount} transaction{block.txCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Time */}
                <div className="text-right">
                  <p className="text-sm text-slate-600">{timeAgo(block.timestamp)}</p>
                  <p className="text-xs font-mono text-slate-400">
                    {truncateHash(block.hash)}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="px-6 py-8 text-center text-slate-500">No blocks found</div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const BlockListSource = `
import React from 'react';
import { useLatestBlocks } from '@wasserstoff/wstf-kit/react';

export const BlockList: React.FC<{ limit?: number; onBlockClick?: (height: bigint) => void }> = ({
  limit = 10,
  onBlockClick,
}) => {
  const { data: blocks, loading, error, refetch } = useLatestBlocks({ limit });

  if (loading) return <div>Loading blocks...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="bg-white border rounded-lg">
      <div className="px-6 py-4 border-b flex justify-between">
        <h3 className="font-semibold">Recent Blocks</h3>
        <button onClick={refetch}>Refresh</button>
      </div>
      <div className="divide-y">
        {blocks?.map((block) => (
          <div
            key={block.height.toString()}
            onClick={() => onBlockClick?.(block.height)}
            className="px-6 py-4 hover:bg-slate-50 cursor-pointer"
          >
            <p className="font-semibold">Block #{block.height.toString()}</p>
            <p className="text-sm text-slate-500">{block.txCount} transactions</p>
          </div>
        ))}
      </div>
    </div>
  );
};
`.trim();
