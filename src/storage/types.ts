/**
 * Storage Types - Abstract storage interface
 *
 * Provides a common interface for different storage backends (memory, RocksDB, etc.)
 */

/**
 * Key-value storage interface
 */
export interface KVStore<V = Buffer> {
  /** Get value by key */
  get(key: string): Promise<V | undefined>;

  /** Set value for key */
  put(key: string, value: V): Promise<void>;

  /** Delete key */
  delete(key: string): Promise<void>;

  /** Check if key exists */
  has(key: string): Promise<boolean>;

  /** Iterate over key-value pairs with optional prefix */
  iterate(prefix?: string): AsyncIterable<[string, V]>;

  /** Get multiple values */
  multiGet(keys: string[]): Promise<Map<string, V>>;

  /** Set multiple values */
  multiPut(entries: [string, V][]): Promise<void>;

  /** Delete multiple keys */
  multiDelete(keys: string[]): Promise<void>;

  /** Close the store */
  close(): Promise<void>;
}

/**
 * Batch operation
 */
export interface BatchOperation<V = Buffer> {
  type: 'put' | 'delete';
  key: string;
  value?: V;
}

/**
 * Batch-capable store
 */
export interface BatchableStore<V = Buffer> extends KVStore<V> {
  /** Execute operations atomically */
  batch(ops: BatchOperation<V>[]): Promise<void>;
}

/**
 * Snapshot interface for point-in-time reads
 */
export interface Snapshot<V = Buffer> {
  /** Get value at snapshot time */
  get(key: string): Promise<V | undefined>;

  /** Iterate at snapshot time */
  iterate(prefix?: string): AsyncIterable<[string, V]>;

  /** Release snapshot resources */
  release(): void;
}

/**
 * Snapshotable store
 */
export interface SnapshotableStore<V = Buffer> extends KVStore<V> {
  /** Create a read snapshot */
  createSnapshot(): Snapshot<V>;
}

/**
 * Column family configuration
 */
export interface ColumnFamilyConfig {
  name: string;
  options?: Record<string, unknown>;
}

/**
 * Storage backend configuration
 */
export interface StorageConfig {
  /** Backend type */
  type: 'memory' | 'rocksdb' | 'leveldb';

  /** Data directory (for persistent backends) */
  path?: string;

  /** Column families */
  columnFamilies?: ColumnFamilyConfig[];

  /** Enable compression */
  compression?: boolean;

  /** Cache size in bytes */
  cacheSize?: number;

  /** Write buffer size */
  writeBufferSize?: number;

  /** Max open files */
  maxOpenFiles?: number;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  type: 'memory',
  compression: true,
  cacheSize: 64 * 1024 * 1024, // 64MB
  writeBufferSize: 16 * 1024 * 1024, // 16MB
  maxOpenFiles: 1000,
};

/**
 * Checkpoint/restore interface
 */
export interface CheckpointableStore<V = Buffer> extends KVStore<V> {
  /** Create checkpoint at path */
  createCheckpoint(path: string): Promise<void>;

  /** Restore from checkpoint */
  restoreFromCheckpoint(path: string): Promise<void>;
}

/**
 * Stats for storage
 */
export interface StorageStats {
  keyCount: number;
  sizeBytes: number;
  readOps: number;
  writeOps: number;
  deleteOps: number;
}
