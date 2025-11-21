/**
 * Warm Mirror Types - State prefetch with local caching
 */

/**
 * Cache entry for a state value
 */
export interface CacheEntry {
  /** State ID */
  stateId: string;
  /** State value (serialized) */
  value: string;
  /** Version hash for optimistic locking */
  version: string;
  /** When this entry was fetched */
  fetchedAt: number;
  /** Block height when fetched */
  fetchedAtHeight: bigint;
  /** Time-to-live in ms */
  ttlMs: number;
  /** Hit count */
  hits: number;
}

/**
 * Prefetch request
 */
export interface PrefetchRequest {
  /** State IDs to prefetch */
  stateIds: string[];
  /** Optional: sender address for nonce lookup */
  sender?: string;
  /** Budget in ms for prefetch */
  budgetMs?: number;
}

/**
 * Prefetch result
 */
export interface PrefetchResult {
  /** States that were fetched */
  fetched: Map<string, CacheEntry>;
  /** States that failed to fetch */
  failed: string[];
  /** Time taken in ms */
  timeMs: number;
  /** Whether all states were fetched within budget */
  complete: boolean;
}

/**
 * Warm state stamp for preflight
 */
export interface WarmStateStamp {
  /** Header hash at time of prefetch */
  headerHash: string;
  /** Block height at time of prefetch */
  height: bigint;
  /** Hash of reads (state IDs) */
  readsHash: string;
  /** Hash of values (state values) */
  pairsHash: string;
  /** Timestamp */
  ts: number;
}

/**
 * Mirror configuration
 */
export interface MirrorConfig {
  /** Enable warm mirror */
  enabled: boolean;
  /** Max entries in cache */
  maxEntries: number;
  /** Default TTL in ms */
  defaultTtlMs: number;
  /** Max TTL in ms */
  maxTtlMs: number;
  /** Prefetch budget in ms */
  prefetchBudgetMs: number;
  /** Enable background refresh */
  backgroundRefresh: boolean;
  /** Refresh threshold (% of TTL remaining) */
  refreshThreshold: number;
  /** Max concurrent fetches */
  maxConcurrentFetches: number;
  /** Eviction policy */
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
}

/**
 * Default mirror config
 */
export const DEFAULT_MIRROR_CONFIG: MirrorConfig = {
  enabled: true,
  maxEntries: 100_000,
  defaultTtlMs: 10_000,
  maxTtlMs: 60_000,
  prefetchBudgetMs: 80,
  backgroundRefresh: true,
  refreshThreshold: 0.2,
  maxConcurrentFetches: 10,
  evictionPolicy: 'lru',
};

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries */
  entries: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit ratio */
  hitRatio: number;
  /** Total prefetches */
  prefetches: number;
  /** Evictions */
  evictions: number;
  /** Background refreshes */
  refreshes: number;
  /** Memory estimate in bytes */
  memoryBytes: number;
}

/**
 * State provider interface for fetching state
 */
export interface StateProvider {
  /** Fetch a single state */
  getState(stateId: string): Promise<{ value: string; version: string } | null>;

  /** Fetch multiple states */
  getStates(stateIds: string[]): Promise<Map<string, { value: string; version: string }>>;

  /** Get current header hash */
  getCurrentHeader(): { hash: string; height: bigint };
}
