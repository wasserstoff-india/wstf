/**
 * Program Cache - LRU cache for compiled programs
 */
import { EventEmitter } from 'events';
import {
  CachedProgram,
  CompilerConfig,
  DEFAULT_COMPILER_CONFIG,
  dslHash,
} from './types';

/**
 * Program Cache
 */
export class ProgramCache extends EventEmitter {
  private config: CompilerConfig;

  // Cache by instructions hash
  private byHash = new Map<string, CachedProgram>();

  // Cache by DSL hash (for dedup)
  private byDslHash = new Map<string, string>(); // dslHash -> instructionsHash

  // LRU tracking
  private accessOrder: string[] = [];

  // Stats
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CompilerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_COMPILER_CONFIG, ...config };
  }

  /**
   * Get program by instructions hash
   */
  getByHash(instructionsHash: string): CachedProgram | null {
    const entry = this.byHash.get(instructionsHash);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() > entry.createdAt + this.config.cacheTtlMs) {
      this.remove(instructionsHash);
      this.misses++;
      return null;
    }

    // Update access order
    this.touch(instructionsHash);
    entry.hits++;
    this.hits++;

    return entry;
  }

  /**
   * Get program by DSL source
   */
  getByDsl(dsl: string): CachedProgram | null {
    const hash = dslHash(dsl);
    const instructionsHash = this.byDslHash.get(hash);

    if (!instructionsHash) {
      return null;
    }

    return this.getByHash(instructionsHash);
  }

  /**
   * Store a compiled program
   */
  set(
    dsl: string,
    programHex: string,
    instructionsHash: string,
    estimatedGas: bigint
  ): CachedProgram {
    const hash = dslHash(dsl);

    // Evict if needed
    while (this.byHash.size >= this.config.cacheMax) {
      this.evictLRU();
    }

    const entry: CachedProgram = {
      instructionsHash,
      programHex,
      dslHash: hash,
      createdAt: Date.now(),
      hits: 0,
      estimatedGas,
    };

    this.byHash.set(instructionsHash, entry);
    this.byDslHash.set(hash, instructionsHash);
    this.accessOrder.push(instructionsHash);

    this.emit('cache:set', { instructionsHash, dslHash: hash });

    return entry;
  }

  /**
   * Remove a program from cache
   */
  remove(instructionsHash: string): boolean {
    const entry = this.byHash.get(instructionsHash);
    if (!entry) return false;

    this.byHash.delete(instructionsHash);
    this.byDslHash.delete(entry.dslHash);
    this.accessOrder = this.accessOrder.filter(h => h !== instructionsHash);

    return true;
  }

  /**
   * Check if program exists
   */
  has(instructionsHash: string): boolean {
    return this.byHash.has(instructionsHash);
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hits: number; misses: number; hitRatio: number } {
    const total = this.hits + this.misses;
    return {
      size: this.byHash.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.byHash.clear();
    this.byDslHash.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  // Touch for LRU
  private touch(instructionsHash: string): void {
    const idx = this.accessOrder.indexOf(instructionsHash);
    if (idx >= 0) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(instructionsHash);
  }

  // Evict LRU entry
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const oldest = this.accessOrder.shift()!;
    const entry = this.byHash.get(oldest);

    if (entry) {
      this.byHash.delete(oldest);
      this.byDslHash.delete(entry.dslHash);
      this.emit('cache:evict', { instructionsHash: oldest });
    }
  }
}
