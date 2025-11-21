/**
 * Snapshot Manager
 *
 * Manages state snapshots for fast node sync and recovery.
 */
import crypto from 'crypto';
import {
  SnapshotableStore,
  Snapshot,
  KVStore,
} from './types';

/**
 * Snapshot metadata
 */
export interface SnapshotMetadata {
  /** Unique snapshot ID */
  id: string;

  /** Block height at snapshot */
  height: bigint;

  /** Block hash at snapshot */
  blockHash: string;

  /** State root hash */
  stateRoot: string;

  /** Timestamp when created */
  timestamp: number;

  /** Number of keys in snapshot */
  keyCount: number;

  /** Size in bytes */
  sizeBytes: number;

  /** Format version */
  version: number;
}

/**
 * Snapshot chunk for streaming
 */
export interface SnapshotChunk {
  /** Chunk index */
  index: number;

  /** Total chunks */
  total: number;

  /** Key-value pairs in this chunk */
  entries: [string, Buffer][];

  /** Chunk hash for verification */
  hash: string;
}

/**
 * Snapshot export options
 */
export interface SnapshotExportOptions {
  /** Maximum entries per chunk */
  chunkSize?: number;

  /** Include only keys with prefix */
  prefix?: string;

  /** Compression (not implemented) */
  compress?: boolean;
}

const DEFAULT_CHUNK_SIZE = 1000;

/**
 * Snapshot Manager
 */
export class SnapshotManager {
  private store: SnapshotableStore<Buffer>;
  private snapshots = new Map<string, SnapshotMetadata>();

  constructor(store: SnapshotableStore<Buffer>) {
    this.store = store;
  }

  /**
   * Create a new snapshot
   */
  async createSnapshot(
    height: bigint,
    blockHash: string
  ): Promise<SnapshotMetadata> {
    const snapshot = this.store.createSnapshot();

    try {
      // Calculate state root and count keys
      const hasher = crypto.createHash('sha256');
      let keyCount = 0;
      let sizeBytes = 0;

      for await (const [key, value] of snapshot.iterate()) {
        hasher.update(key);
        hasher.update(value);
        keyCount++;
        sizeBytes += key.length + value.length;
      }

      const stateRoot = hasher.digest('hex');
      const id = crypto.randomUUID();

      const metadata: SnapshotMetadata = {
        id,
        height,
        blockHash,
        stateRoot,
        timestamp: Date.now(),
        keyCount,
        sizeBytes,
        version: 1,
      };

      this.snapshots.set(id, metadata);

      return metadata;
    } finally {
      snapshot.release();
    }
  }

  /**
   * Export snapshot as chunks
   */
  async *exportSnapshot(
    options: SnapshotExportOptions = {}
  ): AsyncIterable<SnapshotChunk> {
    const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    const snapshot = this.store.createSnapshot();

    try {
      let entries: [string, Buffer][] = [];
      let chunkIndex = 0;
      let totalEntries = 0;

      // First pass: count entries
      for await (const [key] of snapshot.iterate(options.prefix)) {
        totalEntries++;
      }

      const totalChunks = Math.ceil(totalEntries / chunkSize);

      // Second pass: create chunks
      const snapshot2 = this.store.createSnapshot();
      try {
        for await (const [key, value] of snapshot2.iterate(options.prefix)) {
          entries.push([key, value]);

          if (entries.length >= chunkSize) {
            yield this.createChunk(entries, chunkIndex, totalChunks);
            entries = [];
            chunkIndex++;
          }
        }

        // Yield remaining entries
        if (entries.length > 0) {
          yield this.createChunk(entries, chunkIndex, totalChunks);
        }
      } finally {
        snapshot2.release();
      }
    } finally {
      snapshot.release();
    }
  }

  /**
   * Create a chunk with hash
   */
  private createChunk(
    entries: [string, Buffer][],
    index: number,
    total: number
  ): SnapshotChunk {
    const hasher = crypto.createHash('sha256');
    for (const [key, value] of entries) {
      hasher.update(key);
      hasher.update(value);
    }

    return {
      index,
      total,
      entries,
      hash: hasher.digest('hex'),
    };
  }

  /**
   * Import snapshot from chunks
   */
  async importSnapshot(
    target: KVStore<Buffer>,
    chunks: AsyncIterable<SnapshotChunk>
  ): Promise<{ imported: number; verified: boolean }> {
    let imported = 0;
    let verified = true;

    for await (const chunk of chunks) {
      // Verify chunk hash
      const hasher = crypto.createHash('sha256');
      for (const [key, value] of chunk.entries) {
        hasher.update(key);
        hasher.update(value);
      }

      if (hasher.digest('hex') !== chunk.hash) {
        verified = false;
        console.warn(`Chunk ${chunk.index} hash mismatch`);
      }

      // Import entries
      for (const [key, value] of chunk.entries) {
        await target.put(key, value);
        imported++;
      }
    }

    return { imported, verified };
  }

  /**
   * Get snapshot metadata
   */
  getSnapshot(id: string): SnapshotMetadata | undefined {
    return this.snapshots.get(id);
  }

  /**
   * List all snapshots
   */
  listSnapshots(): SnapshotMetadata[] {
    return Array.from(this.snapshots.values()).sort(
      (a, b) => Number(b.height - a.height)
    );
  }

  /**
   * Delete a snapshot
   */
  deleteSnapshot(id: string): boolean {
    return this.snapshots.delete(id);
  }

  /**
   * Prune old snapshots, keeping only the latest N
   */
  pruneSnapshots(keepCount: number): number {
    const sorted = this.listSnapshots();
    let pruned = 0;

    for (let i = keepCount; i < sorted.length; i++) {
      this.snapshots.delete(sorted[i].id);
      pruned++;
    }

    return pruned;
  }
}

/**
 * Compute state root from store
 */
export async function computeStateRoot(
  store: KVStore<Buffer>,
  prefix?: string
): Promise<string> {
  const hasher = crypto.createHash('sha256');

  for await (const [key, value] of store.iterate(prefix)) {
    hasher.update(key);
    hasher.update(value);
  }

  return hasher.digest('hex');
}
