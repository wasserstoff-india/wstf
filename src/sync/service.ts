/**
 * Sync Service - Headers-first block synchronization
 *
 * Implements:
 * 1. Header-first download (download headers, validate chain, then bodies)
 * 2. Block locator generation for finding common ancestor
 * 3. Orphan pool for blocks received out of order
 * 4. Parallel block body download
 */
import { EventEmitter } from 'events';
import { BlockHeader, Block } from '../block/types';
import { ChainStore } from '../chain/store';
import {
  SyncState,
  SyncConfig,
  SyncPeer,
  SyncProgress,
  OrphanBlock,
  BlockLocator,
  HeaderValidation,
  DEFAULT_SYNC_CONFIG,
} from './types';
import {
  CompactHeader,
  createGetHeaders,
  createGetBlocks,
} from '../p2p/messages';

/**
 * Sync events
 */
export interface SyncEvents {
  'state:change': (from: SyncState, to: SyncState) => void;
  'headers:received': (count: number, from: string) => void;
  'block:received': (hash: string, from: string) => void;
  'block:validated': (hash: string, height: bigint) => void;
  'orphan:added': (hash: string) => void;
  'orphan:connected': (hash: string) => void;
  'progress': (progress: SyncProgress) => void;
  'synced': () => void;
  'error': (error: Error, context: string) => void;
}

/**
 * Header chain entry - validated headers waiting for bodies
 */
interface HeaderChainEntry {
  header: BlockHeader;
  hash: string;
  height: bigint;
  totalWork: bigint;
  bodyDownloaded: boolean;
}

/**
 * Sync Service
 */
export class SyncService extends EventEmitter {
  private state: SyncState = SyncState.IDLE;
  private config: SyncConfig;
  private chainStore: ChainStore;

  // Peer tracking
  private peers = new Map<string, SyncPeer>();
  private syncPeer?: string;

  // Header chain (validated headers awaiting bodies)
  private headerChain: HeaderChainEntry[] = [];
  private headerChainTip?: { hash: string; height: bigint; work: bigint };

  // Orphan pool
  private orphans = new Map<string, OrphanBlock>();
  private orphansByParent = new Map<string, Set<string>>();

  // Download tracking
  private pendingBlockDownloads = new Set<string>();
  private blockDownloadQueue: string[] = [];

  // Stats
  private headersDownloaded = 0;
  private blocksDownloaded = 0;
  private syncStartTime?: number;

  constructor(chainStore: ChainStore, config: SyncConfig = DEFAULT_SYNC_CONFIG) {
    super();
    this.chainStore = chainStore;
    this.config = config;
  }

  /**
   * Start sync process
   */
  async start(): Promise<void> {
    if (this.state !== SyncState.IDLE) {
      return;
    }

    this.syncStartTime = Date.now();
    this.setState(SyncState.HEADERS);
    this.emitProgress();
  }

  /**
   * Stop sync process
   */
  stop(): void {
    this.setState(SyncState.IDLE);
    this.headerChain = [];
    this.orphans.clear();
    this.orphansByParent.clear();
    this.pendingBlockDownloads.clear();
    this.blockDownloadQueue = [];
  }

  /**
   * Register a peer with its tip info
   */
  registerPeer(peerId: string, tipHash: string, tipHeight: bigint): void {
    this.peers.set(peerId, {
      peerId,
      tipHash,
      tipHeight,
      lastSeen: Date.now(),
      pendingHeaders: false,
      pendingBlocks: new Set(),
      latency: 100,
    });

    // If we don't have a sync peer, pick this one
    if (!this.syncPeer && this.state === SyncState.HEADERS) {
      this.syncPeer = peerId;
    }
  }

  /**
   * Remove a peer
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);

    if (this.syncPeer === peerId) {
      this.syncPeer = undefined;
      // Pick another peer
      const nextPeer = this.getBestPeer();
      if (nextPeer) {
        this.syncPeer = nextPeer.peerId;
      }
    }
  }

  /**
   * Get best peer for sync (highest tip)
   */
  private getBestPeer(): SyncPeer | undefined {
    let best: SyncPeer | undefined;

    for (const peer of this.peers.values()) {
      if (!best || peer.tipHeight > best.tipHeight) {
        best = peer;
      }
    }

    return best;
  }

  /**
   * Build a block locator from current chain
   */
  async buildLocator(): Promise<BlockLocator> {
    const hashes: string[] = [];
    const tip = await this.chainStore.getTip();

    if (!tip) {
      // No chain yet, just return empty
      return { hashes: [] };
    }

    // Start from tip
    let current = tip.header;
    let currentHash = tip.hash;
    let step = 1;
    let count = 0;

    while (true) {
      hashes.push(currentHash);

      if (current.height === 0n) {
        break; // Genesis
      }

      // Skip back by `step` blocks
      let height = current.height - BigInt(step);
      if (height < 0n) height = 0n;

      const block = await this.chainStore.getBlockAtHeight(height);
      if (!block) break;

      currentHash = block.header.parentHash;
      current = block.header;
      count++;

      // Exponential backoff after first 10
      if (count > 10) {
        step *= 2;
      }

      // Limit locator size
      if (hashes.length >= 50) break;
    }

    return { hashes };
  }

  /**
   * Create GetHeaders request
   */
  async createHeaderRequest(): Promise<{ peerId: string; message: ReturnType<typeof createGetHeaders> } | null> {
    if (!this.syncPeer) {
      const best = this.getBestPeer();
      if (!best) return null;
      this.syncPeer = best.peerId;
    }

    const peer = this.peers.get(this.syncPeer);
    if (!peer || peer.pendingHeaders) {
      return null;
    }

    const locator = await this.buildLocator();

    peer.pendingHeaders = true;

    return {
      peerId: this.syncPeer,
      message: createGetHeaders(locator.hashes, undefined, this.config.maxHeadersPerRequest),
    };
  }

  /**
   * Handle received headers
   */
  async handleHeaders(peerId: string, headers: CompactHeader[]): Promise<void> {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.pendingHeaders = false;
      peer.lastSeen = Date.now();
    }

    if (headers.length === 0) {
      // No more headers, switch to block download
      if (this.state === SyncState.HEADERS && this.headerChain.length > 0) {
        this.setState(SyncState.BLOCKS);
        this.startBlockDownload();
      } else if (this.headerChain.length === 0) {
        this.setState(SyncState.SYNCED);
        this.emit('synced');
      }
      return;
    }

    // Validate and add headers
    let lastValid: HeaderChainEntry | undefined;

    for (const compactHeader of headers) {
      const validation = await this.validateHeader(compactHeader);

      if (!validation.valid) {
        this.emit('error', new Error(validation.error || 'Invalid header'), 'header_validation');
        break;
      }

      const header = this.compactToHeader(compactHeader);
      const entry: HeaderChainEntry = {
        header,
        hash: compactHeader.hash,
        height: BigInt(compactHeader.height),
        totalWork: validation.work || 0n,
        bodyDownloaded: false,
      };

      this.headerChain.push(entry);
      lastValid = entry;
      this.headersDownloaded++;
    }

    this.emit('headers:received', headers.length, peerId);

    // Update header chain tip
    if (lastValid) {
      this.headerChainTip = {
        hash: lastValid.hash,
        height: lastValid.height,
        work: lastValid.totalWork,
      };
    }

    this.emitProgress();

    // Request more headers if we got a full batch
    if (headers.length >= this.config.maxHeadersPerRequest) {
      // Continue requesting
    }
  }

  /**
   * Validate a header
   */
  private async validateHeader(header: CompactHeader): Promise<HeaderValidation> {
    // Check parent exists (either in chain store or header chain)
    const parentInChain = await this.chainStore.hasBlock(header.parentHash);
    const parentInHeaders = this.headerChain.some(e => e.hash === header.parentHash);

    if (!parentInChain && !parentInHeaders && header.parentHash !== '00'.repeat(32)) {
      return { valid: false, error: 'PARENT_NOT_FOUND' };
    }

    // Check height is correct
    if (parentInHeaders) {
      const parent = this.headerChain.find(e => e.hash === header.parentHash);
      if (parent && BigInt(header.height) !== parent.height + 1n) {
        return { valid: false, error: 'INVALID_HEIGHT' };
      }
    }

    // Check timestamp is reasonable (not too far in future)
    const now = Date.now();
    if (header.timestamp > now + 2 * 60 * 60 * 1000) { // 2 hours in future
      return { valid: false, error: 'TIMESTAMP_TOO_FAR_FUTURE' };
    }

    // TODO: Validate PoW against target
    // For now, assume valid

    // Calculate work
    const work = this.calculateWork(header.target);

    return { valid: true, work };
  }

  /**
   * Calculate work from target
   */
  private calculateWork(target: string): bigint {
    // Work = 2^256 / (target + 1)
    // Simplified: work = MAX_TARGET / target
    const targetBigInt = BigInt('0x' + target);
    if (targetBigInt === 0n) return 0n;

    const maxTarget = BigInt('0x' + 'ff'.repeat(32));
    return maxTarget / targetBigInt;
  }

  /**
   * Convert compact header to full header
   */
  private compactToHeader(compact: CompactHeader): BlockHeader {
    return {
      version: 1,
      parentHash: compact.parentHash,
      height: BigInt(compact.height),
      time: BigInt(Math.floor(compact.timestamp / 1000)), // Convert ms to unix seconds
      target: compact.target,
      nonce: BigInt(compact.nonce),
      stateRoot: compact.stateRoot,
      txRoot: compact.txRoot,
      effectsRoot: '00'.repeat(32), // Placeholder - filled during block validation
    };
  }

  /**
   * Start downloading block bodies
   */
  private startBlockDownload(): void {
    // Queue all headers that need bodies
    this.blockDownloadQueue = this.headerChain
      .filter(e => !e.bodyDownloaded)
      .map(e => e.hash);

    this.downloadNextBlocks();
  }

  /**
   * Download next batch of blocks
   */
  private downloadNextBlocks(): void {
    while (
      this.pendingBlockDownloads.size < this.config.maxConcurrentBlocks &&
      this.blockDownloadQueue.length > 0
    ) {
      const hash = this.blockDownloadQueue.shift()!;
      this.pendingBlockDownloads.add(hash);
    }
  }

  /**
   * Create GetBlocks request
   */
  createBlockRequest(): { peerId: string; message: ReturnType<typeof createGetBlocks> } | null {
    if (this.pendingBlockDownloads.size === 0) {
      return null;
    }

    // Find a peer to request from
    let peer: SyncPeer | undefined;

    for (const p of this.peers.values()) {
      if (p.pendingBlocks.size < this.config.maxBlocksPerRequest) {
        peer = p;
        break;
      }
    }

    if (!peer) return null;

    // Get hashes to request
    const hashes: string[] = [];
    for (const hash of this.pendingBlockDownloads) {
      if (hashes.length >= this.config.maxBlocksPerRequest) break;
      if (!peer.pendingBlocks.has(hash)) {
        hashes.push(hash);
        peer.pendingBlocks.add(hash);
      }
    }

    if (hashes.length === 0) return null;

    return {
      peerId: peer.peerId,
      message: createGetBlocks(hashes),
    };
  }

  /**
   * Handle received block
   */
  async handleBlock(peerId: string, hash: string, block: Block): Promise<void> {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.pendingBlocks.delete(hash);
      peer.lastSeen = Date.now();
    }

    // Check if this is in our header chain
    const entry = this.headerChain.find(e => e.hash === hash);

    if (entry) {
      entry.bodyDownloaded = true;
      this.pendingBlockDownloads.delete(hash);
      this.blocksDownloaded++;

      this.emit('block:received', hash, peerId);

      // Try to process validated blocks
      await this.processValidatedBlocks();
    } else {
      // Check if it's an orphan
      await this.handleOrphanBlock(hash, block);
    }

    this.emitProgress();

    // Download more blocks
    this.downloadNextBlocks();
  }

  /**
   * Process blocks that have both header and body validated
   */
  private async processValidatedBlocks(): Promise<void> {
    // Process blocks in order
    while (this.headerChain.length > 0) {
      const entry = this.headerChain[0];

      if (!entry.bodyDownloaded) {
        break; // Wait for body
      }

      // Block is ready to apply
      this.emit('block:validated', entry.hash, entry.height);
      this.headerChain.shift();
    }

    // Check if we're done
    if (this.headerChain.length === 0 && this.blockDownloadQueue.length === 0) {
      this.setState(SyncState.SYNCED);
      this.emit('synced');
    }
  }

  /**
   * Handle orphan block (received out of order)
   */
  private async handleOrphanBlock(hash: string, block: Block): Promise<void> {
    // Check if parent exists
    const parentExists = await this.chainStore.hasBlock(block.header.parentHash);

    if (parentExists) {
      // Not an orphan, can process directly
      return;
    }

    // Check orphan pool limit
    if (this.orphans.size >= this.config.maxOrphans) {
      // Evict oldest orphan
      let oldest: OrphanBlock | undefined;
      for (const orphan of this.orphans.values()) {
        if (!oldest || orphan.receivedAt < oldest.receivedAt) {
          oldest = orphan;
        }
      }
      if (oldest) {
        this.removeOrphan(oldest.hash);
      }
    }

    // Add to orphan pool
    const orphan: OrphanBlock = {
      hash,
      parentHash: block.header.parentHash,
      header: block.header,
      body: block.body,
      receivedAt: Date.now(),
    };

    this.orphans.set(hash, orphan);

    // Index by parent
    let byParent = this.orphansByParent.get(block.header.parentHash);
    if (!byParent) {
      byParent = new Set();
      this.orphansByParent.set(block.header.parentHash, byParent);
    }
    byParent.add(hash);

    this.emit('orphan:added', hash);
  }

  /**
   * Check if any orphans can be connected after a new block
   */
  async checkOrphans(newBlockHash: string): Promise<void> {
    const children = this.orphansByParent.get(newBlockHash);
    if (!children) return;

    for (const childHash of children) {
      const orphan = this.orphans.get(childHash);
      if (!orphan) continue;

      this.removeOrphan(childHash);
      this.emit('orphan:connected', childHash);

      // Recursively check for more orphans
      await this.checkOrphans(childHash);
    }
  }

  /**
   * Remove orphan from pool
   */
  private removeOrphan(hash: string): void {
    const orphan = this.orphans.get(hash);
    if (!orphan) return;

    this.orphans.delete(hash);

    const byParent = this.orphansByParent.get(orphan.parentHash);
    if (byParent) {
      byParent.delete(hash);
      if (byParent.size === 0) {
        this.orphansByParent.delete(orphan.parentHash);
      }
    }
  }

  /**
   * Set state and emit event
   */
  private setState(newState: SyncState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;
    this.emit('state:change', oldState, newState);
  }

  /**
   * Emit progress event
   */
  private emitProgress(): void {
    const progress = this.getProgress();
    this.emit('progress', progress);
  }

  /**
   * Get current sync progress
   */
  getProgress(): SyncProgress {
    const networkHeight = this.getBestPeer()?.tipHeight || 0n;
    const localHeight = this.headerChainTip?.height || 0n;

    let progress = 0;
    if (networkHeight > 0n) {
      progress = Math.min(100, Number((localHeight * 100n) / networkHeight));
    }

    let estimatedRemainingMs: number | undefined;
    if (this.syncStartTime && progress > 0 && progress < 100) {
      const elapsed = Date.now() - this.syncStartTime;
      const rate = progress / elapsed;
      estimatedRemainingMs = Math.round((100 - progress) / rate);
    }

    return {
      state: this.state,
      localHeight,
      networkHeight,
      headersDownloaded: this.headersDownloaded,
      blocksDownloaded: this.blocksDownloaded,
      blocksPending: this.blockDownloadQueue.length + this.pendingBlockDownloads.size,
      syncPeerId: this.syncPeer,
      progress,
      estimatedRemainingMs,
    };
  }

  /**
   * Get orphan count
   */
  getOrphanCount(): number {
    return this.orphans.size;
  }

  /**
   * Get current state
   */
  getState(): SyncState {
    return this.state;
  }
}
