import crypto from 'crypto';

/**
 * INS (Instruction Name Service) entry
 */
export interface INSEntry {
  creatorPkHash: string;      // hex, 20 bytes
  moduleId: string;           // hex, 16 bytes
  version: number;            // u32
  gossipTopic: string;        // hex, 32 bytes
  rpcUrls: string[];          // List of RPC URLs
  schemaHash: string;         // hex, 32 bytes
  codeHash?: string;          // hex, 32 bytes (optional)
  contact?: string;           // Contact info (optional)
}

/**
 * INS key computation
 * key = sha256(creatorPkHash20 || moduleId16 || version_u32)
 */
export function computeINSKey(creatorPkHash: string, moduleId: string, version: number): string {
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeUInt32BE(version, 0);

  const buffer = Buffer.concat([
    Buffer.from(creatorPkHash, 'hex'),
    Buffer.from(moduleId, 'hex'),
    versionBuf
  ]);

  return crypto.createHash('sha256').update(buffer).digest().toString('hex');
}

/**
 * In-memory INS store
 */
export class InMemoryINS {
  private store = new Map<string, INSEntry>();

  async publish(entry: INSEntry): Promise<void> {
    const key = computeINSKey(entry.creatorPkHash, entry.moduleId, entry.version);
    this.store.set(key, entry);
  }

  async resolve(creatorPkHash: string, moduleId: string, version?: number): Promise<INSEntry | undefined> {
    if (version !== undefined) {
      const key = computeINSKey(creatorPkHash, moduleId, version);
      return this.store.get(key);
    }

    // Find latest version
    let latest: INSEntry | undefined;
    for (const entry of this.store.values()) {
      if (entry.creatorPkHash === creatorPkHash && entry.moduleId === moduleId) {
        if (!latest || entry.version > latest.version) {
          latest = entry;
        }
      }
    }
    return latest;
  }

  async list(): Promise<INSEntry[]> {
    return Array.from(this.store.values());
  }
}
