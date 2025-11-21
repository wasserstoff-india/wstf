/**
 * Hot Window types - recent committed transactions
 */

/**
 * Transaction metadata stored in the hot window
 */
export interface TxMeta {
  /** Transaction ID (integrity hash) */
  txId: string;

  /** Sender address */
  from: string;

  /** Transaction nonce */
  nonce: bigint;

  /** State IDs touched by this transaction */
  touchedStates: string[];

  /** Instruction IDs used (creator|module|selector) */
  iidList: string[];

  /** Block height where tx was committed */
  height: bigint;

  /** Block hash where tx was committed */
  blockHash: string;

  /** Timestamp when committed (ms) */
  timestamp: number;

  /** Transaction version (1 or 2) */
  version: number;
}

/**
 * Hot window configuration
 */
export interface HotWindowConfig {
  /** Maximum number of transactions to keep */
  size: number;

  /** Maximum entries per sender in the sender index */
  perSenderDepth: number;

  /** Maximum entries per state in the state index */
  perStateDepth: number;

  /** Maximum entries per instruction ID in the iid index */
  perIidDepth: number;

  /** TTL for entries (ms) - 0 means no TTL */
  ttlMs: number;

  /** Enable persistence to disk */
  persist: boolean;
}

/**
 * Default hot window configuration
 */
export const DEFAULT_HOT_WINDOW_CONFIG: HotWindowConfig = {
  size: 1_000_000,
  perSenderDepth: 4096,
  perStateDepth: 64,
  perIidDepth: 256,
  ttlMs: 0, // No TTL by default
  persist: false,
};

/**
 * Query options for hot window
 */
export interface HotWindowQuery {
  /** Starting height (inclusive) */
  sinceHeight?: bigint;

  /** Starting nonce for sender queries */
  fromNonce?: bigint;

  /** Maximum results to return */
  limit?: number;
}

/**
 * Hot window statistics
 */
export interface HotWindowStats {
  /** Current number of entries */
  size: number;

  /** Memory usage estimate (bytes) */
  memoryBytes: number;

  /** Number of unique senders indexed */
  senderCount: number;

  /** Number of unique states indexed */
  stateCount: number;

  /** Number of unique instruction IDs indexed */
  iidCount: number;

  /** Oldest entry timestamp */
  oldestTimestamp: number;

  /** Newest entry timestamp */
  newestTimestamp: number;
}
