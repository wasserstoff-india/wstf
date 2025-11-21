/**
 * Sync types for headers-first block synchronization
 */
import { BlockHeader } from '../block/types';

/**
 * Sync state machine states
 */
export enum SyncState {
  /** Not syncing */
  IDLE = 'IDLE',
  /** Downloading headers */
  HEADERS = 'HEADERS',
  /** Downloading block bodies */
  BLOCKS = 'BLOCKS',
  /** Validating and applying blocks */
  VALIDATING = 'VALIDATING',
  /** Fully synced, following tip */
  SYNCED = 'SYNCED',
}

/**
 * Orphan block entry
 */
export interface OrphanBlock {
  hash: string;
  parentHash: string;
  header: BlockHeader;
  body?: any; // BlockBody when downloaded
  receivedAt: number;
}

/**
 * Sync peer state
 */
export interface SyncPeer {
  peerId: string;
  tipHash: string;
  tipHeight: bigint;
  lastSeen: number;
  /** Headers we're waiting for from this peer */
  pendingHeaders: boolean;
  /** Blocks we're waiting for from this peer */
  pendingBlocks: Set<string>;
  /** Latency estimate (ms) */
  latency: number;
}

/**
 * Sync configuration
 */
export interface SyncConfig {
  /** Max headers to request at once */
  maxHeadersPerRequest: number;
  /** Max blocks to request at once */
  maxBlocksPerRequest: number;
  /** Max orphan pool size */
  maxOrphans: number;
  /** Timeout for header requests (ms) */
  headerTimeoutMs: number;
  /** Timeout for block requests (ms) */
  blockTimeoutMs: number;
  /** Max concurrent block downloads */
  maxConcurrentBlocks: number;
  /** How often to check for stalled syncs (ms) */
  stallCheckIntervalMs: number;
}

/**
 * Default sync configuration
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  maxHeadersPerRequest: 2000,
  maxBlocksPerRequest: 16,
  maxOrphans: 100,
  headerTimeoutMs: 30000,
  blockTimeoutMs: 60000,
  maxConcurrentBlocks: 4,
  stallCheckIntervalMs: 5000,
};

/**
 * Block locator - list of block hashes from tip back exponentially
 */
export interface BlockLocator {
  /** Hashes from tip going back (newest first) */
  hashes: string[];
}

/**
 * Sync progress info
 */
export interface SyncProgress {
  state: SyncState;
  /** Current local height */
  localHeight: bigint;
  /** Best known height across peers */
  networkHeight: bigint;
  /** Number of headers downloaded */
  headersDownloaded: number;
  /** Number of blocks downloaded */
  blocksDownloaded: number;
  /** Number of blocks pending download */
  blocksPending: number;
  /** Current sync peer */
  syncPeerId?: string;
  /** Estimated progress percentage */
  progress: number;
  /** Estimated time remaining (ms) */
  estimatedRemainingMs?: number;
}

/**
 * Header validation result
 */
export interface HeaderValidation {
  valid: boolean;
  error?: string;
  /** Work contributed by this header */
  work?: bigint;
}
