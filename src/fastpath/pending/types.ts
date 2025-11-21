/**
 * Pending Index types - conflict detection for mempool transactions
 */

/**
 * Reference to a pending transaction
 */
export interface PendingTxRef {
  /** Transaction ID */
  txId: string;

  /** Sender address */
  from: string;

  /** Transaction nonce */
  nonce: bigint;

  /** State IDs this tx reads/writes */
  stateTouches: string[];

  /** Expected versions for each state (stateId -> version) */
  expected: Map<string, string>;

  /** Whether this tx requests exclusive write lock */
  lockWrites: boolean;

  /** When the tx arrived in mempool */
  arrivedAt: number;
}

/**
 * Conflict types
 */
export type ConflictType = 'nonce' | 'state' | 'lock';

/**
 * Conflict details
 */
export interface Conflict {
  type: ConflictType;

  // For nonce conflicts
  from?: string;
  expectedNonce?: bigint;
  gotNonce?: bigint;

  // For state conflicts
  stateId?: string;
  expectedVersion?: string;
  pendingTxId?: string;
  pendingLockWrites?: boolean;
}

/**
 * Check request
 */
export interface PendingCheckRequest {
  from: string;
  nonce: bigint;
  states: string[];
  expected: [string, string][]; // [stateId, version][]
  lockWrites?: boolean;
}

/**
 * Check response
 */
export interface PendingCheckResponse {
  ok: boolean;
  conflicts: Conflict[];
  senderNextNonce: bigint;
}

/**
 * Pending index configuration
 */
export interface PendingIndexConfig {
  /** Maximum pending txs per state */
  perStateMax: number;

  /** Enable strict nonce sequencing (reject gaps) */
  strictNonce: boolean;
}

/**
 * Default pending index configuration
 */
export const DEFAULT_PENDING_INDEX_CONFIG: PendingIndexConfig = {
  perStateMax: 1024,
  strictNonce: true,
};

/**
 * Pending index statistics
 */
export interface PendingIndexStats {
  /** Total pending transactions */
  totalTxs: number;

  /** Number of unique senders with pending txs */
  senderCount: number;

  /** Number of unique states with pending txs */
  stateCount: number;

  /** Number of transactions with lockWrites */
  lockedCount: number;
}
