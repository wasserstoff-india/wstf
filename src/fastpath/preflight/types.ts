/**
 * Preflight API types
 */
import { ConfirmationTier } from '../../trust/types';
import { Conflict } from '../pending/types';

/**
 * Warm state stamp - coherence marker for sticky-node pattern
 */
export interface WarmStateStamp {
  /** Current tip hash on this node */
  header: string;

  /** Hash of reads declared in the tx */
  readsHash: string;

  /** Hash of (stateId, version) pairs consulted */
  pairsHash: string;

  /** Server timestamp (ms) */
  ts: number;
}

/**
 * Preflight request
 */
export interface PreflightRequest {
  /** Sender address */
  from: string;

  /** Transaction nonce */
  nonce: string | bigint;

  /** Binary program (hex) - if provided, server decodes to get states */
  programHex?: string;

  /** Explicit state IDs to check */
  states?: string[];

  /** Expected versions: [stateId, version][] */
  expected?: [string, string][];

  /** Whether tx will request exclusive write locks */
  lockWrites?: boolean;

  /** Trust score (from application layer) */
  trustScore?: number;

  /** Action risk level */
  actionRisk?: 'low' | 'medium' | 'high';
}

/**
 * Preflight response
 */
export interface PreflightResponse {
  /** Whether preflight passed without conflicts */
  ok: boolean;

  /** List of conflicts if any */
  conflicts: Conflict[];

  /** Next expected nonce for this sender */
  senderNextNonce: string;

  /** Warm state stamp for coherence tracking */
  warmStateStamp: WarmStateStamp;

  /** Confirmation timing guidance */
  confirmation: {
    /** Estimated times to each tier (ms) */
    estimatedMs: {
      admitted: number;
      included: number;
      kDepth: number;
      crossChain: number;
    };

    /** Current network state */
    tipHeight: string;
    tipHash: string;
    pendingBlocks: number;

    /** Suggested tier based on trust/risk */
    suggestedTier: ConfirmationTier;

    /** Required tier for this action */
    requiredTier: ConfirmationTier;
  };

  /** Lease token (if enabled and granted) */
  leaseToken?: string;
}

/**
 * Preflight service configuration
 */
export interface PreflightConfig {
  /** Budget for state prefetch (ms) */
  prefetchBudgetMs: number;

  /** Whether to decode programHex to extract states */
  decodeProgram: boolean;

  /** Enable lease tokens */
  enableLeases: boolean;

  /** Lease TTL (ms) */
  leaseTtlMs: number;

  /** Max leases per sender */
  maxLeasesPerSender: number;
}

/**
 * Default preflight configuration
 */
export const DEFAULT_PREFLIGHT_CONFIG: PreflightConfig = {
  prefetchBudgetMs: 80,
  decodeProgram: true,
  enableLeases: false,
  leaseTtlMs: 10000,
  maxLeasesPerSender: 4,
};
