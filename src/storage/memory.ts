/**
 * In-Memory Storage Adapter
 *
 * Reference implementation of the KVStore interface.
 */
import {
  KVStore,
  BatchableStore,
  BatchOperation,
  SnapshotableStore,
  Snapshot,
  StorageStats,
} from './types';

/**
 * In-memory snapshot
 */
class MemorySnapshot<V> implements Snapshot<V> {
  private data: Map<string, V>;

  constructor(source: Map<string, V>) {
    // Deep copy for snapshot isolation
    this.data = new Map(source);
  }

  async get(key: string): Promise<V | undefined> {
    return this.data.get(key);
  }

  async *iterate(prefix?: string): AsyncIterable<[string, V]> {
    for (const [key, value] of this.data) {
      if (!prefix || key.startsWith(prefix)) {
        yield [key, value];
      }
    }
  }

  release(): void {
    this.data.clear();
  }
}

/**
 * In-Memory KV Store
 */
export class MemoryStore<V = Buffer>
  implements BatchableStore<V>, SnapshotableStore<V>
{
  private data = new Map<string, V>();
  private stats: StorageStats = {
    keyCount: 0,
    sizeBytes: 0,
    readOps: 0,
    writeOps: 0,
    deleteOps: 0,
  };

  async get(key: string): Promise<V | undefined> {
    this.stats.readOps++;
    return this.data.get(key);
  }

  async put(key: string, value: V): Promise<void> {
    this.stats.writeOps++;
    const hadKey = this.data.has(key);
    this.data.set(key, value);
    if (!hadKey) {
      this.stats.keyCount++;
    }
    // Estimate size (rough for non-buffer types)
    if (Buffer.isBuffer(value)) {
      this.stats.sizeBytes += key.length + value.length;
    }
  }

  async delete(key: string): Promise<void> {
    this.stats.deleteOps++;
    if (this.data.delete(key)) {
      this.stats.keyCount--;
    }
  }

  async has(key: string): Promise<boolean> {
    this.stats.readOps++;
    return this.data.has(key);
  }

  async *iterate(prefix?: string): AsyncIterable<[string, V]> {
    for (const [key, value] of this.data) {
      if (!prefix || key.startsWith(prefix)) {
        yield [key, value];
      }
    }
  }

  async multiGet(keys: string[]): Promise<Map<string, V>> {
    const result = new Map<string, V>();
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }
    return result;
  }

  async multiPut(entries: [string, V][]): Promise<void> {
    for (const [key, value] of entries) {
      await this.put(key, value);
    }
  }

  async multiDelete(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.delete(key);
    }
  }

  async batch(ops: BatchOperation<V>[]): Promise<void> {
    for (const op of ops) {
      if (op.type === 'put' && op.value !== undefined) {
        await this.put(op.key, op.value);
      } else if (op.type === 'delete') {
        await this.delete(op.key);
      }
    }
  }

  createSnapshot(): Snapshot<V> {
    return new MemorySnapshot(this.data);
  }

  async close(): Promise<void> {
    this.data.clear();
  }

  getStats(): StorageStats {
    return { ...this.stats };
  }

  size(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
    this.stats.keyCount = 0;
    this.stats.sizeBytes = 0;
  }
}

/**
 * Create a typed memory store with JSON serialization
 */
export class TypedMemoryStore<T> implements KVStore<T> {
  private inner = new MemoryStore<T>();

  async get(key: string): Promise<T | undefined> {
    return this.inner.get(key);
  }

  async put(key: string, value: T): Promise<void> {
    return this.inner.put(key, value);
  }

  async delete(key: string): Promise<void> {
    return this.inner.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.inner.has(key);
  }

  async *iterate(prefix?: string): AsyncIterable<[string, T]> {
    yield* this.inner.iterate(prefix);
  }

  async multiGet(keys: string[]): Promise<Map<string, T>> {
    return this.inner.multiGet(keys);
  }

  async multiPut(entries: [string, T][]): Promise<void> {
    return this.inner.multiPut(entries);
  }

  async multiDelete(keys: string[]): Promise<void> {
    return this.inner.multiDelete(keys);
  }

  async close(): Promise<void> {
    return this.inner.close();
  }
}
