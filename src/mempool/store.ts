/**
 * Mempool transaction store with policy enforcement
 */
import crypto from 'crypto';
import { MempoolConfig } from '../config/types';

export interface MempoolTransaction {
  id: string; // Hash of the transaction
  from: string; // Sender address
  tx: any; // Full transaction object
  receivedAt: number;
  sizeBytes: number;
}

export interface MempoolStats {
  totalTxs: number;
  totalBytes: number;
  txsBySender: Record<string, number>;
}

export class MempoolStore {
  private txs = new Map<string, MempoolTransaction>();
  private txsBySender = new Map<string, Set<string>>();
  private totalBytes = 0;
  private config: MempoolConfig['policy'];

  constructor(config: MempoolConfig['policy']) {
    this.config = config;
  }

  /**
   * Add a transaction to the mempool
   * Returns { ok: true } or { ok: false, code: string, reason: string }
   */
  add(tx: any): { ok: boolean; code?: string; reason?: string; id?: string } {
    // Compute tx hash
    const txStr = JSON.stringify(tx);
    const txHash = crypto.createHash('sha256').update(txStr).digest('hex');
    const sizeBytes = Buffer.byteLength(txStr, 'utf8');

    // Check if already in mempool (duplicate suppression)
    if (this.txs.has(txHash)) {
      return { ok: false, code: 'DUPLICATE_TX', reason: 'Transaction already in mempool' };
    }

    // Check size limit
    if (sizeBytes > this.config.maxTxBytes) {
      return {
        ok: false,
        code: 'TX_TOO_LARGE',
        reason: `Transaction size ${sizeBytes} exceeds limit ${this.config.maxTxBytes}`
      };
    }

    // Check pool size limit
    if (this.txs.size >= this.config.maxPoolSize) {
      return {
        ok: false,
        code: 'MEMPOOL_FULL',
        reason: `Mempool at capacity (${this.config.maxPoolSize} txs)`
      };
    }

    // Check per-sender limit
    const from = tx.from;
    const senderTxs = this.txsBySender.get(from) || new Set();

    if (senderTxs.size >= this.config.maxTxPerSender) {
      return {
        ok: false,
        code: 'SENDER_LIMIT_EXCEEDED',
        reason: `Sender has ${senderTxs.size} txs in mempool (limit: ${this.config.maxTxPerSender})`
      };
    }

    // Add to mempool
    const mempoolTx: MempoolTransaction = {
      id: txHash,
      from,
      tx,
      receivedAt: Date.now(),
      sizeBytes
    };

    this.txs.set(txHash, mempoolTx);
    senderTxs.add(txHash);
    this.txsBySender.set(from, senderTxs);
    this.totalBytes += sizeBytes;

    return { ok: true, id: txHash };
  }

  /**
   * Get a transaction by ID
   */
  get(id: string): MempoolTransaction | undefined {
    return this.txs.get(id);
  }

  /**
   * Remove a transaction (e.g., after inclusion in block)
   */
  remove(id: string): boolean {
    const tx = this.txs.get(id);
    if (!tx) {
      return false;
    }

    this.txs.delete(id);
    this.totalBytes -= tx.sizeBytes;

    // Remove from sender index
    const senderTxs = this.txsBySender.get(tx.from);
    if (senderTxs) {
      senderTxs.delete(id);
      if (senderTxs.size === 0) {
        this.txsBySender.delete(tx.from);
      }
    }

    return true;
  }

  /**
   * Get all transactions (for block building)
   */
  getAll(): MempoolTransaction[] {
    return Array.from(this.txs.values()).sort((a, b) => a.receivedAt - b.receivedAt);
  }

  /**
   * Get transactions by sender
   */
  getBySender(from: string): MempoolTransaction[] {
    const ids = this.txsBySender.get(from);
    if (!ids) {
      return [];
    }

    return Array.from(ids).map(id => this.txs.get(id)!).filter(Boolean);
  }

  /**
   * Get mempool stats
   */
  getStats(): MempoolStats {
    const txsBySender: Record<string, number> = {};

    for (const [sender, txIds] of this.txsBySender.entries()) {
      txsBySender[sender] = txIds.size;
    }

    return {
      totalTxs: this.txs.size,
      totalBytes: this.totalBytes,
      txsBySender
    };
  }

  /**
   * Clear the mempool
   */
  clear(): void {
    this.txs.clear();
    this.txsBySender.clear();
    this.totalBytes = 0;
  }

  /**
   * Check if transaction exists
   */
  has(id: string): boolean {
    return this.txs.has(id);
  }
}
