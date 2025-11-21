/**
 * Sync Module - Headers-first block synchronization
 */

// Types
export {
  SyncState,
  SyncConfig,
  SyncPeer,
  SyncProgress,
  OrphanBlock,
  BlockLocator,
  HeaderValidation,
  DEFAULT_SYNC_CONFIG,
} from './types';

// Service
export {
  SyncService,
  SyncEvents,
} from './service';
