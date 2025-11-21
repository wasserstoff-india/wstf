/**
 * Warm Mirror Cache - LRU cache with TTL for state prefetching
 */
import crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  CacheEntry,
  CacheStats,
  MirrorConfig,
  DEFAULT_MIRROR_CONFIG,
  PrefetchRequest,
  PrefetchResult,
  WarmStateStamp,
  StateProvider,
} from './types';

/**
 * LRU node for doubly-linked list
 */
interface LRUNode {
  key: string;
  prev: LRUNode | null;
  next: LRUNode | null;
}

/**
 * Warm Mirror Cache
 */
export class WarmMirrorCache extends EventEmitter {
  private config: MirrorConfig;
  private cache = new Map<string, CacheEntry>();
  private provider: StateProvider | null = null;

  // LRU tracking
  private lruHead: LRUNode | null = null;
  private lruTail: LRUNode | null = null;
  private lruMap = new Map<string, LRUNode>();

  // Stats
  private hits = 0;
  private misses = 0;
  private prefetches = 0;
  private evictions = 0;
  private refreshes = 0;

  // Background refresh
  private refreshTimer?: NodeJS.Timeout;
  private pendingRefreshes = new Set<string>();
  private activeFetches = 0;

  constructor(config: Partial<MirrorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_MIRROR_CONFIG, ...config };
  }

  /**
   * Set the state provider
   */
  setProvider(provider: StateProvider): void {
    this.provider = provider;
  }

  /**
   * Start background refresh
   */
  start(): void {
    if (!this.config.backgroundRefresh) return;

    this.refreshTimer = setInterval(() => {
      this.checkRefreshes();
    }, 1000);
  }

  /**
   * Stop background refresh
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Get a cached state
   */
  get(stateId: string): CacheEntry | null {
    const entry = this.cache.get(stateId);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now > entry.fetchedAt + entry.ttlMs) {
      this.cache.delete(stateId);
      this.removeLRU(stateId);
      this.misses++;
      return null;
    }

    // Update LRU
    this.touchLRU(stateId);

    // Update stats
    this.hits++;
    entry.hits++;

    // Schedule refresh if needed
    const remaining = entry.fetchedAt + entry.ttlMs - now;
    const threshold = entry.ttlMs * this.config.refreshThreshold;
    if (remaining < threshold && this.config.backgroundRefresh) {
      this.scheduleRefresh(stateId);
    }

    return entry;
  }

  /**
   * Set a cached state
   */
  set(
    stateId: string,
    value: string,
    version: string,
    height: bigint,
    ttlMs: number = this.config.defaultTtlMs
  ): void {
    // Enforce TTL limit
    const effectiveTtl = Math.min(ttlMs, this.config.maxTtlMs);

    // Check capacity and evict if needed
    while (this.cache.size >= this.config.maxEntries) {
      this.evictOne();
    }

    const entry: CacheEntry = {
      stateId,
      value,
      version,
      fetchedAt: Date.now(),
      fetchedAtHeight: height,
      ttlMs: effectiveTtl,
      hits: 0,
    };

    this.cache.set(stateId, entry);
    this.addLRU(stateId);
  }

  /**
   * Invalidate a cached state
   */
  invalidate(stateId: string): boolean {
    const existed = this.cache.delete(stateId);
    if (existed) {
      this.removeLRU(stateId);
    }
    return existed;
  }

  /**
   * Invalidate multiple states
   */
  invalidateMany(stateIds: string[]): number {
    let count = 0;
    for (const id of stateIds) {
      if (this.invalidate(id)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Invalidate all states fetched before a certain height
   */
  invalidateBeforeHeight(height: bigint): number {
    let count = 0;
    for (const [id, entry] of this.cache) {
      if (entry.fetchedAtHeight < height) {
        this.cache.delete(id);
        this.removeLRU(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Prefetch states
   */
  async prefetch(request: PrefetchRequest): Promise<PrefetchResult> {
    if (!this.provider) {
      return {
        fetched: new Map(),
        failed: request.stateIds,
        timeMs: 0,
        complete: false,
      };
    }

    const start = Date.now();
    const budget = request.budgetMs ?? this.config.prefetchBudgetMs;
    const fetched = new Map<string, CacheEntry>();
    const failed: string[] = [];

    // Filter out already cached states
    const toFetch: string[] = [];
    for (const stateId of request.stateIds) {
      const cached = this.get(stateId);
      if (cached) {
        fetched.set(stateId, cached);
      } else {
        toFetch.push(stateId);
      }
    }

    if (toFetch.length === 0) {
      this.prefetches++;
      return {
        fetched,
        failed: [],
        timeMs: Date.now() - start,
        complete: true,
      };
    }

    // Fetch from provider
    try {
      const header = this.provider.getCurrentHeader();
      const results = await Promise.race([
        this.provider.getStates(toFetch),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), budget)),
      ]);

      if (results === null) {
        // Timeout
        failed.push(...toFetch);
      } else {
        for (const stateId of toFetch) {
          const result = results.get(stateId);
          if (result) {
            this.set(stateId, result.value, result.version, header.height);
            const entry = this.cache.get(stateId)!;
            fetched.set(stateId, entry);
          } else {
            failed.push(stateId);
          }
        }
      }
    } catch (e) {
      failed.push(...toFetch);
    }

    this.prefetches++;
    this.emit('prefetch', { requested: request.stateIds.length, fetched: fetched.size, failed: failed.length });

    return {
      fetched,
      failed,
      timeMs: Date.now() - start,
      complete: failed.length === 0,
    };
  }

  /**
   * Create warm state stamp for preflight
   */
  createStamp(stateIds: string[]): WarmStateStamp | null {
    if (!this.provider) return null;

    const header = this.provider.getCurrentHeader();
    const pairs: Array<[string, string]> = [];

    for (const stateId of stateIds) {
      const entry = this.get(stateId);
      if (entry) {
        pairs.push([stateId, entry.value]);
      }
    }

    const readsHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(stateIds.sort()))
      .digest('hex');

    const pairsHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(pairs.sort((a, b) => a[0].localeCompare(b[0]))))
      .digest('hex');

    return {
      headerHash: header.hash,
      height: header.height,
      readsHash,
      pairsHash,
      ts: Date.now(),
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    let memoryBytes = 0;

    for (const entry of this.cache.values()) {
      memoryBytes += entry.stateId.length * 2 + entry.value.length * 2 + entry.version.length * 2 + 64;
    }

    return {
      entries: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: total > 0 ? this.hits / total : 0,
      prefetches: this.prefetches,
      evictions: this.evictions,
      refreshes: this.refreshes,
      memoryBytes,
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.lruHead = null;
    this.lruTail = null;
    this.lruMap.clear();
    this.pendingRefreshes.clear();
  }

  // LRU helpers

  private addLRU(key: string): void {
    const node: LRUNode = { key, prev: null, next: null };

    if (!this.lruHead) {
      this.lruHead = node;
      this.lruTail = node;
    } else {
      node.next = this.lruHead;
      this.lruHead.prev = node;
      this.lruHead = node;
    }

    this.lruMap.set(key, node);
  }

  private removeLRU(key: string): void {
    const node = this.lruMap.get(key);
    if (!node) return;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.lruHead = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.lruTail = node.prev;
    }

    this.lruMap.delete(key);
  }

  private touchLRU(key: string): void {
    this.removeLRU(key);
    this.addLRU(key);
  }

  private evictOne(): void {
    if (!this.lruTail) return;

    const key = this.lruTail.key;
    this.removeLRU(key);
    this.cache.delete(key);
    this.evictions++;
  }

  // Background refresh

  private scheduleRefresh(stateId: string): void {
    if (this.pendingRefreshes.has(stateId)) return;
    if (this.activeFetches >= this.config.maxConcurrentFetches) return;

    this.pendingRefreshes.add(stateId);
  }

  private async checkRefreshes(): Promise<void> {
    if (!this.provider || this.pendingRefreshes.size === 0) return;

    const toRefresh = Array.from(this.pendingRefreshes).slice(
      0,
      this.config.maxConcurrentFetches - this.activeFetches
    );

    if (toRefresh.length === 0) return;

    for (const stateId of toRefresh) {
      this.pendingRefreshes.delete(stateId);
    }

    this.activeFetches += toRefresh.length;

    try {
      const header = this.provider.getCurrentHeader();
      const results = await this.provider.getStates(toRefresh);

      for (const stateId of toRefresh) {
        const result = results.get(stateId);
        if (result) {
          this.set(stateId, result.value, result.version, header.height);
          this.refreshes++;
        }
      }
    } finally {
      this.activeFetches -= toRefresh.length;
    }
  }
}
