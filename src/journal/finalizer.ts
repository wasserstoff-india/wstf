/**
 * Journal Finalizer
 *
 * Integrates the Journal Collector with the Confirmation Tracker
 * to emit cross_chain_final events and handle retry logic.
 */
import { EventEmitter } from 'events';
import { JournalCollector, BlockWithChanges } from './collector';
import { JournalWriter, JournalWriteResult, StateDiffJournal } from './types';
import { ConfirmationTracker } from '../trust/confirmationTracker';
import { SSEService } from '../events/sse.service';

/**
 * Finalizer configuration
 */
export interface FinalizerConfig {
  /** Max retry attempts for failed writes */
  maxRetries: number;
  /** Retry delay (ms) */
  retryDelayMs: number;
  /** Whether to emit SSE events */
  emitSSE: boolean;
  /** Checkpoint interval (number of journals) */
  checkpointInterval: number;
}

/**
 * Default finalizer config
 */
export const DEFAULT_FINALIZER_CONFIG: FinalizerConfig = {
  maxRetries: 3,
  retryDelayMs: 5000,
  emitSSE: true,
  checkpointInterval: 10,
};

/**
 * Checkpoint data
 */
export interface FinalizerCheckpoint {
  lastHeight: bigint;
  lastJournalId: string;
  timestamp: number;
  totalFinalized: number;
}

/**
 * Failed write for retry
 */
interface FailedWrite {
  journal: StateDiffJournal;
  chain: string;
  attempts: number;
  lastError: string;
  nextRetryAt: number;
}

/**
 * Journal Finalizer
 */
export class JournalFinalizer extends EventEmitter {
  private collector: JournalCollector;
  private tracker: ConfirmationTracker | null;
  private sse: SSEService | null;
  private config: FinalizerConfig;

  // Retry queue
  private failedWrites: FailedWrite[] = [];
  private retryTimer?: NodeJS.Timeout;

  // Checkpoint
  private checkpoint: FinalizerCheckpoint = {
    lastHeight: 0n,
    lastJournalId: '',
    timestamp: 0,
    totalFinalized: 0,
  };
  private journalsSinceCheckpoint = 0;

  // Tx tracking: journalId -> txIds included in that journal
  private journalTxMap = new Map<string, Set<string>>();

  constructor(
    collector: JournalCollector,
    tracker: ConfirmationTracker | null = null,
    sse: SSEService | null = null,
    config: FinalizerConfig = DEFAULT_FINALIZER_CONFIG
  ) {
    super();
    this.collector = collector;
    this.tracker = tracker;
    this.sse = sse;
    this.config = config;

    this.setupListeners();
  }

  /**
   * Set up event listeners
   */
  private setupListeners(): void {
    // Listen for successful journal writes
    this.collector.on('journal:written', (info: { chain: string; journalId: string; txHash?: string }) => {
      this.onJournalWritten(info.journalId, info.chain, info.txHash || '');
    });

    // Listen for failed writes
    this.collector.on('journal:failed', (info: { chain: string; journalId: string; error: string }) => {
      // Note: We'd need access to the journal here for retry
      // For now, just emit an event
      this.emit('finalize:failed', info);
    });

    // Listen for batch processing
    this.collector.on('batch:processed', (info: { journalId: string; heightStart: bigint; heightEnd: bigint; entries: number }) => {
      this.onBatchProcessed(info);
    });
  }

  /**
   * Start the finalizer
   */
  start(): void {
    this.collector.start();

    // Start retry timer
    if (this.config.maxRetries > 0) {
      this.retryTimer = setInterval(() => {
        this.processRetries();
      }, this.config.retryDelayMs);
    }
  }

  /**
   * Stop the finalizer
   */
  stop(): void {
    this.collector.stop();

    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  /**
   * Add a finalized block
   */
  addFinalizedBlock(block: BlockWithChanges, txIds: string[]): void {
    this.collector.addKDepthBlock(block);

    // Track which txIds are in pending journals
    // We'll associate them with the journal when it's created
    this.emit('block:finalized', { hash: block.hash, height: block.height, txCount: txIds.length });
  }

  /**
   * Handle successful journal write
   */
  private onJournalWritten(journalId: string, chain: string, txHash: string): void {
    // Get txIds associated with this journal
    const txIds = this.journalTxMap.get(journalId);

    // Mark transactions as cross-chain finalized
    if (this.tracker && txIds) {
      for (const txId of txIds) {
        this.tracker.markCrossChain(txId, txHash, chain);
      }
    }

    // Emit SSE events
    if (this.sse && this.config.emitSSE && txIds) {
      for (const txId of txIds) {
        const tracked = this.tracker?.get(txId);
        if (tracked) {
          this.sse.emitCrossChainFinal(txId, tracked.from, txHash, chain);
        }
      }
    }

    // Update checkpoint
    this.checkpoint.totalFinalized++;
    this.checkpoint.lastJournalId = journalId;
    this.checkpoint.timestamp = Date.now();
    this.journalsSinceCheckpoint++;

    // Emit checkpoint if needed
    if (this.journalsSinceCheckpoint >= this.config.checkpointInterval) {
      this.emitCheckpoint();
    }

    // Clean up tx map
    this.journalTxMap.delete(journalId);

    this.emit('finalize:complete', { journalId, chain, txHash });
  }

  /**
   * Handle batch processing
   */
  private onBatchProcessed(info: { journalId: string; heightStart: bigint; heightEnd: bigint; entries: number }): void {
    this.checkpoint.lastHeight = info.heightEnd;
    this.emit('batch:finalized', info);
  }

  /**
   * Queue a failed write for retry
   */
  queueRetry(journal: StateDiffJournal, chain: string, error: string): void {
    // Check if already queued
    const existing = this.failedWrites.find(
      f => f.journal.id === journal.id && f.chain === chain
    );

    if (existing) {
      existing.attempts++;
      existing.lastError = error;
      existing.nextRetryAt = Date.now() + this.config.retryDelayMs;
      return;
    }

    if (this.failedWrites.length >= 100) {
      // Drop oldest
      this.failedWrites.shift();
    }

    this.failedWrites.push({
      journal,
      chain,
      attempts: 1,
      lastError: error,
      nextRetryAt: Date.now() + this.config.retryDelayMs,
    });
  }

  /**
   * Process retry queue
   */
  private async processRetries(): Promise<void> {
    const now = Date.now();
    const ready = this.failedWrites.filter(f => f.nextRetryAt <= now);

    for (const failed of ready) {
      if (failed.attempts > this.config.maxRetries) {
        // Give up
        this.failedWrites = this.failedWrites.filter(f => f !== failed);
        this.emit('finalize:abandoned', {
          journalId: failed.journal.id,
          chain: failed.chain,
          attempts: failed.attempts,
          lastError: failed.lastError,
        });
        continue;
      }

      // Try again through the collector
      // Note: In a real implementation, we'd call the writer directly
      this.emit('retry:attempt', {
        journalId: failed.journal.id,
        chain: failed.chain,
        attempt: failed.attempts,
      });
    }
  }

  /**
   * Emit checkpoint event
   */
  private emitCheckpoint(): void {
    this.emit('checkpoint', { ...this.checkpoint });
    this.journalsSinceCheckpoint = 0;
  }

  /**
   * Get current checkpoint
   */
  getCheckpoint(): FinalizerCheckpoint {
    return { ...this.checkpoint };
  }

  /**
   * Load checkpoint (for recovery)
   */
  loadCheckpoint(checkpoint: FinalizerCheckpoint): void {
    this.checkpoint = { ...checkpoint };
  }

  /**
   * Get retry queue stats
   */
  getRetryStats(): {
    pending: number;
    byChain: Map<string, number>;
  } {
    const byChain = new Map<string, number>();

    for (const failed of this.failedWrites) {
      const count = byChain.get(failed.chain) || 0;
      byChain.set(failed.chain, count + 1);
    }

    return {
      pending: this.failedWrites.length,
      byChain,
    };
  }

  /**
   * Flush pending and retry failed
   */
  async flush(): Promise<void> {
    await this.collector.flush();
    await this.processRetries();
  }

  /**
   * Get collector state
   */
  getCollectorState() {
    return this.collector.getState();
  }
}
