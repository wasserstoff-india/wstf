/**
 * SSE Event types for real-time transaction tracking
 */
import { ConfirmationTier } from '../trust/types';

/**
 * Base event structure
 */
export interface BaseEvent {
  /** Event ID (for SSE) */
  id: string;

  /** Event timestamp (ms) */
  ts: number;
}

/**
 * Transaction event types
 */
export type TxEventType =
  | 'preflight_ok'
  | 'preflight_conflict'
  | 'mempool_admit'
  | 'mempool_reject'
  | 'block_include'
  | 'k_depth'
  | 'cross_chain_final'
  | 'reorg_undo'
  | 'reorg_redo'
  | 'orphaned_tx'
  | 'reinstated_tx'
  | 'tier_update';

/**
 * Preflight OK event
 */
export interface PreflightOkEvent extends BaseEvent {
  type: 'preflight_ok';
  txId: string;
  from: string;
  tier: ConfirmationTier.PREFLIGHT;
}

/**
 * Preflight conflict event
 */
export interface PreflightConflictEvent extends BaseEvent {
  type: 'preflight_conflict';
  txId?: string;
  from: string;
  conflicts: any[];
}

/**
 * Mempool admit event
 */
export interface MempoolAdmitEvent extends BaseEvent {
  type: 'mempool_admit';
  txId: string;
  from: string;
  nonce: string;
  tier: ConfirmationTier.ADMITTED;
}

/**
 * Mempool reject event
 */
export interface MempoolRejectEvent extends BaseEvent {
  type: 'mempool_reject';
  txId: string;
  from: string;
  reason: string;
  code: string;
}

/**
 * Block include event
 */
export interface BlockIncludeEvent extends BaseEvent {
  type: 'block_include';
  txId: string;
  from: string;
  blockHash: string;
  blockHeight: string;
  txIndex: number;
  tier: ConfirmationTier.INCLUDED;
}

/**
 * K-depth reached event
 */
export interface KDepthEvent extends BaseEvent {
  type: 'k_depth';
  txId: string;
  from: string;
  blockHash: string;
  depth: number;
  tier: ConfirmationTier.K_DEPTH;
}

/**
 * Cross-chain finality event
 */
export interface CrossChainFinalEvent extends BaseEvent {
  type: 'cross_chain_final';
  txId: string;
  from: string;
  journalTxHash: string;
  chain: string;
  tier: ConfirmationTier.CROSS_CHAIN;
}

/**
 * Reorg undo event
 */
export interface ReorgUndoEvent extends BaseEvent {
  type: 'reorg_undo';
  txId: string;
  from: string;
  fromTier: ConfirmationTier;
  orphanedBlockHash: string;
}

/**
 * Reorg redo event
 */
export interface ReorgRedoEvent extends BaseEvent {
  type: 'reorg_redo';
  txId: string;
  from: string;
  toTier: ConfirmationTier;
  newBlockHash: string;
}

/**
 * Orphaned transaction event
 */
export interface OrphanedTxEvent extends BaseEvent {
  type: 'orphaned_tx';
  txId: string;
  from: string;
  orphanedBlockHash: string;
}

/**
 * Reinstated transaction event
 */
export interface ReinstatedTxEvent extends BaseEvent {
  type: 'reinstated_tx';
  txId: string;
  from: string;
  newBlockHash?: string;
}

/**
 * Tier update event - generic tier change notification
 */
export interface TierUpdateEvent extends BaseEvent {
  type: 'tier_update';
  txId: string;
  from: string;
  /** Previous tier */
  fromTier: ConfirmationTier;
  /** New tier */
  toTier: ConfirmationTier;
  /** Progress percentage (0-100) */
  progress: number;
  /** Whether required tier has been reached */
  isComplete: boolean;
  /** Required tier for this transaction */
  requiredTier: ConfirmationTier;
  /** Current confirms (blocks deep) */
  confirms: number;
  /** Estimated time to completion (ms) */
  estimatedCompleteMs?: number;
}

/**
 * Union of all transaction events
 */
export type TxEvent =
  | PreflightOkEvent
  | PreflightConflictEvent
  | MempoolAdmitEvent
  | MempoolRejectEvent
  | BlockIncludeEvent
  | KDepthEvent
  | CrossChainFinalEvent
  | ReorgUndoEvent
  | ReorgRedoEvent
  | OrphanedTxEvent
  | ReinstatedTxEvent
  | TierUpdateEvent;

/**
 * Event filter for subscriptions
 */
export interface EventFilter {
  /** Filter by sender address */
  addr?: string;

  /** Filter by transaction ID */
  txId?: string;

  /** Filter by state ID */
  stateId?: string;

  /** Filter by event types */
  types?: TxEventType[];
}

/**
 * SSE service configuration
 */
export interface SSEConfig {
  /** Heartbeat interval (ms) */
  heartbeatMs: number;

  /** Max events buffered per client */
  maxBufferSize: number;

  /** Max clients per IP */
  maxClientsPerIp: number;

  /** Max total clients */
  maxTotalClients: number;

  /** Event retention for replay (ms) */
  retentionMs: number;
}

/**
 * Default SSE configuration
 */
export const DEFAULT_SSE_CONFIG: SSEConfig = {
  heartbeatMs: 10000,
  maxBufferSize: 10000,
  maxClientsPerIp: 10,
  maxTotalClients: 1000,
  retentionMs: 60000,
};
