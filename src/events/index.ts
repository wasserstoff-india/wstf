/**
 * Events Module - SSE and real-time notifications
 */

// Types
export {
  TxEvent,
  TxEventType,
  BaseEvent,
  PreflightOkEvent,
  PreflightConflictEvent,
  MempoolAdmitEvent,
  MempoolRejectEvent,
  BlockIncludeEvent,
  KDepthEvent,
  CrossChainFinalEvent,
  ReorgUndoEvent,
  ReorgRedoEvent,
  OrphanedTxEvent,
  ReinstatedTxEvent,
  TierUpdateEvent,
  EventFilter,
  SSEConfig,
  DEFAULT_SSE_CONFIG,
} from './types';

// SSE Service
export { SSEService } from './sse.service';

// Hardening
export {
  RateLimitConfig,
  DEFAULT_RATE_LIMIT_CONFIG,
  TokenBucket,
  ConnectionHealth,
  ConnectionManager,
  DegradationMode,
  DegradationConfig,
  DEFAULT_DEGRADATION_CONFIG,
  DegradationController,
  ESSENTIAL_EVENT_TYPES,
} from './hardening';
