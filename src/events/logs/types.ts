/**
 * Event Log Types - EVM-style log primitives for transaction receipts
 *
 * Events are:
 * - Indexable (up to 5 topics)
 * - Stored as receipt entries (not state)
 * - Immutable once tx is finalized
 * - Used by indexers/explorers for analysis
 */

// ============================================
// Type Aliases
// ============================================

/** 32-byte hex string */
export type Hex32 = `0x${string}`;

/** Event key (32 bytes) - event type signature */
export type EventKey = Hex32;

/** Topic (32 bytes) - indexed parameter */
export type Topic = Hex32;

/** Event data - arbitrary bytes (hex encoded) */
export type EventData = `0x${string}`;

// ============================================
// Constants & Limits
// ============================================

/** Maximum number of topics per event */
export const MAX_TOPICS = 5;

/** Maximum data bytes per event (8 KB) */
export const MAX_DATA_BYTES = 8192;

/** Maximum events per transaction */
export const MAX_EVENTS_PER_TX = 64;

/** Maximum payload bytes for CALL_LOCAL */
export const MAX_CALL_PAYLOAD_BYTES = 4096;

/** Maximum response preview bytes for CALL_RESULT */
export const MAX_RESPONSE_PREVIEW_BYTES = 1024;

// ============================================
// Well-known Event Keys
// ============================================

/**
 * Hash a string to get an event key
 */
export function eventKeyFromString(s: string): EventKey {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(s).digest('hex');
  return `0x${hash}` as EventKey;
}

/** CALL_LOCAL_REQUEST event key */
export const EVENT_KEY_CALL_LOCAL_REQUEST = eventKeyFromString('CALL_LOCAL_REQUEST');

/** CALL_LOCAL_RESULT event key */
export const EVENT_KEY_CALL_LOCAL_RESULT = eventKeyFromString('CALL_LOCAL_RESULT');

/** Generic user event key prefix */
export const EVENT_KEY_USER_PREFIX = '0x00';

// ============================================
// Event Log Structure
// ============================================

/**
 * Event log entry - attached to transaction receipts
 */
export interface EventLog {
  /** Transaction ID that emitted this event */
  txId: Hex32;

  /** Log index within the transaction (0-based) */
  index: number;

  /** Block hash containing this event */
  blockHash: Hex32;

  /** Block height */
  blockHeight: bigint;

  /** Module that emitted the event (e.g., "SYS.EVENT", "MYMOD.v1") */
  module: string;

  /** Address that emitted the event */
  emitter: string;

  /** Event key/signature (32 bytes) */
  key: EventKey;

  /** Indexed topics (0-5) */
  topics: Topic[];

  /** Raw event data (hex encoded, up to MAX_DATA_BYTES) */
  data: EventData;

  /** Timestamp when event was created */
  timestamp: number;
}

// ============================================
// Event Filter
// ============================================

/**
 * Filter for querying events
 */
export interface EventFilter {
  /** Starting block height (inclusive) */
  fromBlock?: bigint;

  /** Ending block height (inclusive) */
  toBlock?: bigint;

  /** Filter by emitter address */
  address?: string;

  /** Filter by event key */
  eventKey?: EventKey;

  /** Filter by topics (null = wildcard) */
  topics?: (Topic | null)[];

  /** Filter by module */
  module?: string;

  /** Maximum results */
  limit?: number;
}

// ============================================
// CALL_LOCAL Types
// ============================================

/**
 * Arguments for SYS.CALL_LOCAL instruction
 */
export interface CallLocalArgs {
  /** Program identifier (e.g., "my.cli.tool/v1" or INS module id) */
  programId: string;

  /** Unique call identifier (32-byte random, client-chosen) */
  callId: Hex32;

  /** Opaque payload bytes (hex encoded, up to MAX_CALL_PAYLOAD_BYTES) */
  payload: EventData;

  /** Hinted maximum response size in bytes */
  maxResponseSize: number;
}

/**
 * Arguments for SYS.CALL_RESULT instruction
 */
export interface CallResultArgs {
  /** Call identifier (matches request) */
  callId: Hex32;

  /** Program identifier */
  programId: string;

  /** Execution status */
  status: 'ok' | 'error';

  /** Hash of full response */
  responseHash: Hex32;

  /** Optional short preview/body snippet */
  responsePreview?: EventData;

  /** Error message if status is 'error' */
  errorMessage?: string;

  /** Execution duration in milliseconds */
  durationMs?: number;
}

// ============================================
// Validation
// ============================================

/**
 * Validation result
 */
export interface EventValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

/**
 * Validate event log structure
 */
export function validateEventLog(event: Partial<EventLog>): EventValidationResult {
  // Check topics count
  if (event.topics && event.topics.length > MAX_TOPICS) {
    return {
      valid: false,
      error: `Too many topics: ${event.topics.length} > ${MAX_TOPICS}`,
      code: 'EVENT_TOPIC_LIMIT',
    };
  }

  // Check data size
  if (event.data) {
    const dataBytes = (event.data.length - 2) / 2; // Remove 0x prefix, hex to bytes
    if (dataBytes > MAX_DATA_BYTES) {
      return {
        valid: false,
        error: `Data too large: ${dataBytes} > ${MAX_DATA_BYTES}`,
        code: 'EVENT_DATA_TOO_LARGE',
      };
    }
  }

  // Check key format
  if (event.key && !event.key.startsWith('0x')) {
    return {
      valid: false,
      error: 'Event key must start with 0x',
      code: 'EVENT_KEY_INVALID',
    };
  }

  return { valid: true };
}

/**
 * Validate CALL_LOCAL args
 */
export function validateCallLocalArgs(args: CallLocalArgs): EventValidationResult {
  // Check payload size
  if (args.payload) {
    const payloadBytes = (args.payload.length - 2) / 2;
    if (payloadBytes > MAX_CALL_PAYLOAD_BYTES) {
      return {
        valid: false,
        error: `Payload too large: ${payloadBytes} > ${MAX_CALL_PAYLOAD_BYTES}`,
        code: 'CALL_PAYLOAD_TOO_LARGE',
      };
    }
  }

  // Check programId
  if (!args.programId || args.programId.length === 0) {
    return {
      valid: false,
      error: 'programId is required',
      code: 'CALL_PROGRAM_MISSING',
    };
  }

  // Check callId format
  if (!args.callId || !args.callId.startsWith('0x')) {
    return {
      valid: false,
      error: 'callId must be a valid hex string',
      code: 'CALL_ID_INVALID',
    };
  }

  return { valid: true };
}

/**
 * Validate CALL_RESULT args
 */
export function validateCallResultArgs(args: CallResultArgs): EventValidationResult {
  // Check callId
  if (!args.callId || !args.callId.startsWith('0x')) {
    return {
      valid: false,
      error: 'callId must be a valid hex string',
      code: 'RESULT_CALL_ID_INVALID',
    };
  }

  // Check status
  if (args.status !== 'ok' && args.status !== 'error') {
    return {
      valid: false,
      error: 'status must be "ok" or "error"',
      code: 'RESULT_STATUS_INVALID',
    };
  }

  // Check responsePreview size
  if (args.responsePreview) {
    const previewBytes = (args.responsePreview.length - 2) / 2;
    if (previewBytes > MAX_RESPONSE_PREVIEW_BYTES) {
      return {
        valid: false,
        error: `Response preview too large: ${previewBytes} > ${MAX_RESPONSE_PREVIEW_BYTES}`,
        code: 'RESULT_PREVIEW_TOO_LARGE',
      };
    }
  }

  return { valid: true };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a topic from an address
 */
export function topicFromAddress(address: string): Topic {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(address).digest('hex');
  return `0x${hash}` as Topic;
}

/**
 * Create a topic from a string
 */
export function topicFromString(s: string): Topic {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(s).digest('hex');
  return `0x${hash}` as Topic;
}

/**
 * Create a topic from a number/bigint
 */
export function topicFromNumber(n: bigint | number): Topic {
  const hex = BigInt(n).toString(16).padStart(64, '0');
  return `0x${hex}` as Topic;
}

/**
 * Check if a log matches a filter
 */
export function matchesFilter(log: EventLog, filter: EventFilter): boolean {
  // Block range
  if (filter.fromBlock !== undefined && log.blockHeight < filter.fromBlock) {
    return false;
  }
  if (filter.toBlock !== undefined && log.blockHeight > filter.toBlock) {
    return false;
  }

  // Address
  if (filter.address && log.emitter !== filter.address) {
    return false;
  }

  // Event key
  if (filter.eventKey && log.key !== filter.eventKey) {
    return false;
  }

  // Module
  if (filter.module && log.module !== filter.module) {
    return false;
  }

  // Topics (null = wildcard)
  if (filter.topics) {
    for (let i = 0; i < filter.topics.length; i++) {
      const filterTopic = filter.topics[i];
      if (filterTopic !== null) {
        if (i >= log.topics.length || log.topics[i] !== filterTopic) {
          return false;
        }
      }
    }
  }

  return true;
}
