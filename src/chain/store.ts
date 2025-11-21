/**
 * Chain store: persist blocks, headers, and metadata
 * In-memory implementation (can be swapped with RocksDB)
 */
import { Block, BlockHeader, BlockBody, BlockMeta, encodeBlockHeader, encodeBlockBody, decodeBlockHeader, decodeBlockBody } from '../block/types';

export interface ChainStoreAdapter {
  putHeader(hash: string, header: BlockHeader): Promise<void>;
  getHeader(hash: string): Promise<BlockHeader | undefined>;
  putBody(hash: string, body: BlockBody): Promise<void>;
  getBody(hash: string): Promise<BlockBody | undefined>;
  putMeta(hash: string, meta: BlockMeta): Promise<void>;
  getMeta(hash: string): Promise<BlockMeta | undefined>;
  putHeightIndex(height: bigint, hash: string): Promise<void>;
  getHashAtHeight(height: bigint): Promise<string | undefined>;
  setTip(hash: string): Promise<void>;
  getTip(): Promise<string | undefined>;
}

/**
 * In-memory chain store adapter
 */
export class InMemoryChainStore implements ChainStoreAdapter {
  private headers = new Map<string, BlockHeader>();
  private bodies = new Map<string, BlockBody>();
  private meta = new Map<string, BlockMeta>();
  private heightIndex = new Map<string, string>(); // height -> hash
  private tip?: string;

  async putHeader(hash: string, header: BlockHeader): Promise<void> {
    this.headers.set(hash, header);
  }

  async getHeader(hash: string): Promise<BlockHeader | undefined> {
    return this.headers.get(hash);
  }

  async putBody(hash: string, body: BlockBody): Promise<void> {
    this.bodies.set(hash, body);
  }

  async getBody(hash: string): Promise<BlockBody | undefined> {
    return this.bodies.get(hash);
  }

  async putMeta(hash: string, meta: BlockMeta): Promise<void> {
    this.meta.set(hash, meta);
  }

  async getMeta(hash: string): Promise<BlockMeta | undefined> {
    return this.meta.get(hash);
  }

  async putHeightIndex(height: bigint, hash: string): Promise<void> {
    this.heightIndex.set(height.toString(), hash);
  }

  async getHashAtHeight(height: bigint): Promise<string | undefined> {
    return this.heightIndex.get(height.toString());
  }

  async setTip(hash: string): Promise<void> {
    this.tip = hash;
  }

  async getTip(): Promise<string | undefined> {
    return this.tip;
  }

  // Helpers for testing
  clear(): void {
    this.headers.clear();
    this.bodies.clear();
    this.meta.clear();
    this.heightIndex.clear();
    this.tip = undefined;
  }

  getAllHeaders(): BlockHeader[] {
    return Array.from(this.headers.values());
  }
}

/**
 * Chain store service (high-level API)
 */
export class ChainStore {
  constructor(private adapter: ChainStoreAdapter) {}

  /**
   * Store a complete block
   */
  async putBlock(hash: string, block: Block, meta: BlockMeta): Promise<void> {
    await this.adapter.putHeader(hash, block.header);
    await this.adapter.putBody(hash, block.body);
    await this.adapter.putMeta(hash, meta);
    await this.adapter.putHeightIndex(block.header.height, hash);
  }

  /**
   * Get a complete block
   */
  async getBlock(hash: string): Promise<Block | undefined> {
    const header = await this.adapter.getHeader(hash);
    const body = await this.adapter.getBody(hash);

    if (!header || !body) {
      return undefined;
    }

    return { header, body };
  }

  /**
   * Get block header only
   */
  async getHeader(hash: string): Promise<BlockHeader | undefined> {
    return this.adapter.getHeader(hash);
  }

  /**
   * Get block metadata
   */
  async getMeta(hash: string): Promise<BlockMeta | undefined> {
    return this.adapter.getMeta(hash);
  }

  /**
   * Get block by height
   */
  async getBlockAtHeight(height: bigint): Promise<Block | undefined> {
    const hash = await this.adapter.getHashAtHeight(height);
    if (!hash) {
      return undefined;
    }
    return this.getBlock(hash);
  }

  /**
   * Get current tip
   */
  async getTip(): Promise<{ hash: string; header: BlockHeader; meta: BlockMeta } | undefined> {
    const hash = await this.adapter.getTip();
    if (!hash) {
      return undefined;
    }

    const header = await this.adapter.getHeader(hash);
    const meta = await this.adapter.getMeta(hash);

    if (!header || !meta) {
      return undefined;
    }

    return { hash, header, meta };
  }

  /**
   * Set new tip
   */
  async setTip(hash: string): Promise<void> {
    await this.adapter.setTip(hash);
  }

  /**
   * Check if block exists
   */
  async hasBlock(hash: string): Promise<boolean> {
    const header = await this.adapter.getHeader(hash);
    return header !== undefined;
  }

  /**
   * Get recent headers (for median time calculation, etc.)
   */
  async getRecentHeaders(count: number): Promise<BlockHeader[]> {
    const tip = await this.getTip();
    if (!tip) {
      return [];
    }

    const headers: BlockHeader[] = [tip.header];
    let current = tip.header;

    for (let i = 1; i < count; i++) {
      if (current.parentHash === '00'.repeat(32)) {
        break; // Genesis
      }

      const parent = await this.adapter.getHeader(current.parentHash);
      if (!parent) {
        break;
      }

      headers.unshift(parent);
      current = parent;
    }

    return headers;
  }
}
