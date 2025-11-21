/**
 * Journal Module - Cross-chain finality
 */

// Types
export {
  StateDiffJournal,
  JournalEntry,
  JournalConfig,
  DEFAULT_JOURNAL_CONFIG,
  JournalWriter,
  JournalWriteResult,
  JournalCollectorState,
} from './types';

// Collector
export {
  JournalCollector,
  BlockWithChanges,
  computeJournalHash,
} from './collector';

// Finalizer
export {
  JournalFinalizer,
  FinalizerConfig,
  DEFAULT_FINALIZER_CONFIG,
  FinalizerCheckpoint,
} from './finalizer';

// Adapters
export { MockJournalWriter } from './adapters/mock';
