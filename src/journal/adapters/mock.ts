/**
 * Mock Journal Writer - For testing
 */
import crypto from 'crypto';
import {
  JournalWriter,
  StateDiffJournal,
  JournalWriteResult,
} from '../types';

/**
 * In-memory mock journal storage
 */
interface MockJournalEntry {
  journal: StateDiffJournal;
  txHash: string;
  blockNumber: bigint;
  timestamp: number;
}

/**
 * Mock Journal Writer
 *
 * Stores journals in memory for testing.
 */
export class MockJournalWriter implements JournalWriter {
  readonly chain = 'mock';

  private journals = new Map<string, MockJournalEntry>();
  private blockNumber = 1000n;
  private writeDelay: number;
  private failRate: number;

  constructor(options: { writeDelay?: number; failRate?: number } = {}) {
    this.writeDelay = options.writeDelay ?? 100;
    this.failRate = options.failRate ?? 0;
  }

  async write(journal: StateDiffJournal): Promise<JournalWriteResult> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, this.writeDelay));

    // Simulate random failures
    if (Math.random() < this.failRate) {
      return {
        ok: false,
        chain: this.chain,
        error: 'MOCK_RANDOM_FAILURE',
      };
    }

    // Generate mock tx hash
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');

    // Increment block number
    this.blockNumber++;

    // Store
    this.journals.set(txHash, {
      journal,
      txHash,
      blockNumber: this.blockNumber,
      timestamp: Date.now(),
    });

    return {
      ok: true,
      txHash,
      chain: this.chain,
      confirmationUrl: `https://mock-explorer.local/tx/${txHash}`,
      gasUsed: BigInt(journal.entries.length * 21000),
      cost: `${journal.entries.length * 0.001} MOCK`,
    };
  }

  async checkConfirmation(txHash: string): Promise<{ confirmed: boolean; blockNumber?: bigint }> {
    const entry = this.journals.get(txHash);
    if (!entry) {
      return { confirmed: false };
    }

    return {
      confirmed: true,
      blockNumber: entry.blockNumber,
    };
  }

  async estimateCost(journal: StateDiffJournal): Promise<{ cost: string; gasEstimate: bigint }> {
    const gasPerEntry = 21000n;
    const gasEstimate = BigInt(journal.entries.length) * gasPerEntry;

    return {
      cost: `${Number(gasEstimate) * 0.00001} MOCK`,
      gasEstimate,
    };
  }

  /**
   * Get all stored journals (for testing)
   */
  getAll(): MockJournalEntry[] {
    return Array.from(this.journals.values());
  }

  /**
   * Get journal by tx hash (for testing)
   */
  get(txHash: string): MockJournalEntry | undefined {
    return this.journals.get(txHash);
  }

  /**
   * Clear all journals (for testing)
   */
  clear(): void {
    this.journals.clear();
    this.blockNumber = 1000n;
  }

  /**
   * Get count (for testing)
   */
  count(): number {
    return this.journals.size;
  }
}
