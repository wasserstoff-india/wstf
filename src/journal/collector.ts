/**
 * Journal Collector - Collects state diffs after K-depth for cross-chain journaling
 */
import crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  StateDiffJournal,
  JournalEntry,
  JournalConfig,
  DEFAULT_JOURNAL_CONFIG,
  JournalWriter,
  JournalWriteResult,
  JournalCollectorState,
} from './types';

/**
 * Block with state changes
 */
export interface BlockWithChanges {
  hash: string;
  height: bigint;
  timestamp: number;
  stateRootBefore: string;
  stateRootAfter: string;
  changes: JournalEntry[];
}

/**
 * Journal Collector
 */
export class JournalCollector extends EventEmitter {
  private config: JournalConfig;
  private writers = new Map<string, JournalWriter>();
  private pendingBlocks: BlockWithChanges[] = [];
  private lastProcessedHeight: bigint = 0n;
  private totalWritten = 0;
  private totalEntries = 0;
  private processingTimer?: NodeJS.Timeout;

  constructor(config: Partial<JournalConfig> = {}) {
    super();
    this.config = { ...DEFAULT_JOURNAL_CONFIG, ...config };
  }

  /**
   * Register a journal writer adapter
   */
  registerWriter(writer: JournalWriter): void {
    this.writers.set(writer.chain, writer);
  }

  /**
   * Start the collector
   */
  start(): void {
    if (!this.config.enabled) return;

    // Start processing timer
    this.processingTimer = setInterval(() => {
      this.processReadyBatches();
    }, this.config.delayAfterKDepthMs);
  }

  /**
   * Stop the collector
   */
  stop(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
  }

  /**
   * Add a block that has reached K-depth
   */
  addKDepthBlock(block: BlockWithChanges): void {
    if (!this.config.enabled) return;

    this.pendingBlocks.push(block);

    // Sort by height
    this.pendingBlocks.sort((a, b) => Number(a.height - b.height));

    this.emit('block:added', { hash: block.hash, height: block.height });
  }

  /**
   * Process batches that are ready
   */
  private async processReadyBatches(): Promise<void> {
    if (this.pendingBlocks.length < this.config.batchSize) {
      return;
    }

    // Take a batch
    const batch = this.pendingBlocks.splice(0, this.config.batchSize);

    if (batch.length === 0) return;

    // Create journal
    const journal = this.createJournal(batch);

    // Write to all adapters
    const results = await this.writeToAdapters(journal);

    this.emit('batch:processed', {
      journalId: journal.id,
      heightStart: journal.heightStart,
      heightEnd: journal.heightEnd,
      entries: journal.entries.length,
      results,
    });
  }

  /**
   * Create a journal from a batch of blocks
   */
  private createJournal(blocks: BlockWithChanges[]): StateDiffJournal {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];

    // Collect all entries
    const entries: JournalEntry[] = [];
    for (const block of blocks) {
      for (const entry of block.changes) {
        if (entries.length < this.config.maxEntriesPerJournal) {
          entries.push(entry);
        }
      }
    }

    // Compute journal ID
    const idData = `${first.hash}:${last.hash}:${Date.now()}`;
    const id = crypto.createHash('sha256').update(idData).digest('hex');

    const journal: StateDiffJournal = {
      id,
      blockHashStart: first.hash,
      blockHashEnd: last.hash,
      heightStart: first.height,
      heightEnd: last.height,
      timestamp: Date.now(),
      stateRootBefore: first.stateRootBefore,
      stateRootAfter: last.stateRootAfter,
      entries,
      attestations: [], // TODO: collect attestations from validators
    };

    this.totalEntries += entries.length;
    this.lastProcessedHeight = last.height;

    return journal;
  }

  /**
   * Write journal to all registered adapters
   */
  private async writeToAdapters(journal: StateDiffJournal): Promise<Map<string, JournalWriteResult>> {
    const results = new Map<string, JournalWriteResult>();

    for (const adapterName of this.config.adapters) {
      const writer = this.writers.get(adapterName);
      if (!writer) {
        results.set(adapterName, {
          ok: false,
          chain: adapterName,
          error: 'ADAPTER_NOT_FOUND',
        });
        continue;
      }

      try {
        const result = await writer.write(journal);
        results.set(adapterName, result);

        if (result.ok) {
          this.totalWritten++;
          this.emit('journal:written', {
            chain: adapterName,
            journalId: journal.id,
            txHash: result.txHash,
          });
        } else {
          this.emit('journal:failed', {
            chain: adapterName,
            journalId: journal.id,
            error: result.error,
          });
        }
      } catch (e: any) {
        results.set(adapterName, {
          ok: false,
          chain: adapterName,
          error: e.message,
        });
        this.emit('journal:error', {
          chain: adapterName,
          journalId: journal.id,
          error: e.message,
        });
      }
    }

    return results;
  }

  /**
   * Force process all pending blocks
   */
  async flush(): Promise<void> {
    while (this.pendingBlocks.length > 0) {
      const batch = this.pendingBlocks.splice(0, this.config.batchSize);
      if (batch.length === 0) break;

      const journal = this.createJournal(batch);
      await this.writeToAdapters(journal);
    }
  }

  /**
   * Get collector state
   */
  getState(): JournalCollectorState {
    return {
      lastProcessedHeight: this.lastProcessedHeight,
      pendingJournals: Math.ceil(this.pendingBlocks.length / this.config.batchSize),
      totalWritten: this.totalWritten,
      totalEntries: this.totalEntries,
      activeAdapters: Array.from(this.writers.keys()),
    };
  }

  /**
   * Get pending blocks count
   */
  getPendingCount(): number {
    return this.pendingBlocks.length;
  }
}

/**
 * Compute hash for a journal (for signing)
 */
export function computeJournalHash(journal: StateDiffJournal): string {
  const data = JSON.stringify({
    id: journal.id,
    blockHashStart: journal.blockHashStart,
    blockHashEnd: journal.blockHashEnd,
    heightStart: journal.heightStart.toString(),
    heightEnd: journal.heightEnd.toString(),
    stateRootBefore: journal.stateRootBefore,
    stateRootAfter: journal.stateRootAfter,
    entriesHash: crypto.createHash('sha256')
      .update(JSON.stringify(journal.entries))
      .digest('hex'),
  });

  return crypto.createHash('sha256').update(data).digest('hex');
}
