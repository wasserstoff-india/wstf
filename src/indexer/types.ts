/**
 * Indexer Types - Transaction and state indexing for queries
 */

/**
 * Indexed transaction
 */
export interface IndexedTx {
  /** Transaction hash */
  txId: string;
  /** Block hash containing this tx */
  blockHash: string;
  /** Block height */
  blockHeight: bigint;
  /** Position in block */
  txIndex: number;
  /** Sender address */
  from: string;
  /** Nonce */
  nonce: bigint;
  /** Timestamp (block time) */
  timestamp: number;
  /** States touched */
  statesTouched: string[];
  /** Success/failure */
  success: boolean;
  /** Gas used (if applicable) */
  gasUsed?: bigint;
  /** Raw transaction data */
  rawTx?: string;
}

/**
 * Indexed state change
 */
export interface IndexedStateChange {
  /** State ID */
  stateId: string;
  /** Block hash */
  blockHash: string;
  /** Block height */
  blockHeight: bigint;
  /** Transaction that caused the change */
  txId: string;
  /** Previous value (null if created) */
  prevValue: string | null;
  /** New value (null if deleted) */
  newValue: string | null;
  /** Version before */
  prevVersion: string | null;
  /** Version after */
  newVersion: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Search query for transactions
 */
export interface TxSearchQuery {
  /** Filter by sender */
  from?: string;
  /** Filter by state touched */
  stateTouched?: string;
  /** Filter by block height range */
  heightFrom?: bigint;
  heightTo?: bigint;
  /** Filter by timestamp range */
  timestampFrom?: number;
  timestampTo?: number;
  /** Filter by success/failure */
  success?: boolean;
  /** Pagination */
  offset?: number;
  limit?: number;
  /** Sort order */
  sortBy?: 'height' | 'timestamp';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search query for state changes
 */
export interface StateSearchQuery {
  /** Filter by state ID */
  stateId?: string;
  /** Filter by transaction */
  txId?: string;
  /** Filter by block height range */
  heightFrom?: bigint;
  heightTo?: bigint;
  /** Pagination */
  offset?: number;
  limit?: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search result
 */
export interface SearchResult<T> {
  /** Results */
  items: T[];
  /** Total count (without pagination) */
  total: number;
  /** Offset used */
  offset: number;
  /** Limit used */
  limit: number;
  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Indexer configuration
 */
export interface IndexerConfig {
  /** Enable indexing */
  enabled: boolean;
  /** Max transactions to keep indexed */
  maxIndexedTxs: number;
  /** Max state changes to keep indexed */
  maxStateChanges: number;
  /** Index raw transaction data */
  indexRawTx: boolean;
  /** Persist to disk */
  persist: boolean;
  /** Persist path */
  persistPath?: string;
}

/**
 * Default indexer config
 */
export const DEFAULT_INDEXER_CONFIG: IndexerConfig = {
  enabled: true,
  maxIndexedTxs: 1_000_000,
  maxStateChanges: 5_000_000,
  indexRawTx: false,
  persist: false,
};

/**
 * Indexer statistics
 */
export interface IndexerStats {
  /** Total indexed transactions */
  totalTxs: number;
  /** Total indexed state changes */
  totalStateChanges: number;
  /** Indexed height range */
  heightFrom: bigint;
  heightTo: bigint;
  /** Unique senders indexed */
  uniqueSenders: number;
  /** Unique states indexed */
  uniqueStates: number;
  /** Memory estimate in bytes */
  memoryBytes: number;
}
