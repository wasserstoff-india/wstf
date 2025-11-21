/**
 * Stable error code catalog for WSTFChain
 * These codes are part of the protocol and must not change
 */

// Parsing/format errors
export const DECODE_ERROR = 'DECODE_ERROR';
export const BAD_ADDRESS_FORMAT = 'BAD_ADDRESS_FORMAT';
export const BAD_PREIMAGE_FIELDS = 'BAD_PREIMAGE_FIELDS';
export const BAD_CBOR_CANONICAL = 'BAD_CBOR_CANONICAL';
export const VARINT_OVERFLOW = 'VARINT_OVERFLOW';
export const BUFFER_TRUNCATED = 'BUFFER_TRUNCATED';

// Signature errors
export const BAD_SIGNATURE = 'BAD_SIGNATURE';
export const SIG_ALGO_MISMATCH = 'SIG_ALGO_MISMATCH';
export const ADDR_PUBKEY_MISMATCH = 'ADDR_PUBKEY_MISMATCH';
export const NO_PUBKEY = 'NO_PUBKEY';

// Transaction semantics
export const BAD_VERSION = 'BAD_VERSION';
export const BAD_NONCE = 'BAD_NONCE';
export const BAD_INTEGRITY_HASH = 'BAD_INTEGRITY_HASH';
export const BAD_INSTRUCTIONS_HASH = 'BAD_INSTRUCTIONS_HASH';
export const BAD_READS_HASH = 'BAD_READS_HASH';
export const BAD_LOCKS_HASH = 'BAD_LOCKS_HASH';
export const BAD_PAYLOAD_HASH = 'BAD_PAYLOAD_HASH';
export const UNKNOWN_ACCOUNT = 'UNKNOWN_ACCOUNT';
export const BAD_ADDRESS = 'BAD_ADDRESS';

// Authority/State errors
export const STATE_NOT_FOUND = 'STATE_NOT_FOUND';
export const STATE_EXISTS = 'STATE_EXISTS';
export const ACL_DENIED = 'ACL_DENIED';
export const VERSION_CONFLICT = 'VERSION_CONFLICT';
export const LOCK_CONFLICT = 'LOCK_CONFLICT';
export const MERGE_FAILED = 'MERGE_FAILED';
export const UNAUTHORIZED = 'UNAUTHORIZED';

// XVAL stub errors
export const XVAL_NO_QUORUM = 'XVAL_NO_QUORUM';
export const XVAL_BAD_ATTEST = 'XVAL_BAD_ATTEST';

// Policy/limits errors
export const POLICY_INSTRUCTION_LIMIT = 'POLICY_INSTRUCTION_LIMIT';
export const POLICY_SIZE_LIMIT = 'POLICY_SIZE_LIMIT';
export const POLICY_UNSUPPORTED_SELECTOR = 'POLICY_UNSUPPORTED_SELECTOR';

// Execution errors
export const EXECUTION_FAILED = 'EXECUTION_FAILED';
export const UNKNOWN_SELECTOR = 'UNKNOWN_SELECTOR';

// Fast-path / Preflight errors
export const BAD_NONCE_GAP = 'BAD_NONCE_GAP';
export const NONCE_ALREADY_USED = 'NONCE_ALREADY_USED';
export const PENDING_CONFLICT_STATE = 'PENDING_CONFLICT_STATE';
export const PENDING_CONFLICT_NONCE = 'PENDING_CONFLICT_NONCE';
export const PENDING_CAP_EXCEEDED = 'PENDING_CAP_EXCEEDED';
export const ALREADY_PENDING = 'ALREADY_PENDING';

// Hot Window errors
export const RECENT_RATE_LIMIT = 'RECENT_RATE_LIMIT';
export const RECENT_TOO_LARGE = 'RECENT_TOO_LARGE';

// SSE/Events errors
export const EVENTS_CLIENT_LIMIT = 'EVENTS_CLIENT_LIMIT';
export const EVENTS_BACKPRESSURE = 'EVENTS_BACKPRESSURE';

// Sync errors
export const HEADERS_INVALID = 'HEADERS_INVALID';
export const ORPHAN_POOL_FULL = 'ORPHAN_POOL_FULL';
export const PEER_RATE_LIMIT = 'PEER_RATE_LIMIT';
export const PARENT_NOT_FOUND = 'PARENT_NOT_FOUND';

// Warm Mirror errors
export const WARM_PREFETCH_TIMEOUT = 'WARM_PREFETCH_TIMEOUT';
export const WARM_SIZE_LIMIT = 'WARM_SIZE_LIMIT';

// Lease errors
export const LEASE_QUOTA = 'LEASE_QUOTA';
export const LEASE_EXPIRED = 'LEASE_EXPIRED';
export const LEASE_INVALID_SIGNATURE = 'LEASE_INVALID_SIGNATURE';

// Journal errors
export const JOURNAL_WRITE_FAILED = 'JOURNAL_WRITE_FAILED';
export const JOURNAL_ADAPTER_NOT_FOUND = 'JOURNAL_ADAPTER_NOT_FOUND';

/**
 * Helper to create a standardized error result
 */
export function createError(code: string, message?: string): { ok: false; code: string; message: string } {
  return {
    ok: false,
    code,
    message: message || code
  };
}

/**
 * All error codes for validation
 */
export const ALL_ERROR_CODES = [
  // Parsing
  DECODE_ERROR,
  BAD_ADDRESS_FORMAT,
  BAD_PREIMAGE_FIELDS,
  BAD_CBOR_CANONICAL,
  VARINT_OVERFLOW,
  BUFFER_TRUNCATED,
  // Signature
  BAD_SIGNATURE,
  SIG_ALGO_MISMATCH,
  ADDR_PUBKEY_MISMATCH,
  NO_PUBKEY,
  // Tx semantics
  BAD_VERSION,
  BAD_NONCE,
  BAD_INTEGRITY_HASH,
  BAD_INSTRUCTIONS_HASH,
  BAD_READS_HASH,
  BAD_LOCKS_HASH,
  BAD_PAYLOAD_HASH,
  UNKNOWN_ACCOUNT,
  BAD_ADDRESS,
  // Authority/State
  STATE_NOT_FOUND,
  STATE_EXISTS,
  ACL_DENIED,
  VERSION_CONFLICT,
  LOCK_CONFLICT,
  MERGE_FAILED,
  UNAUTHORIZED,
  // XVAL
  XVAL_NO_QUORUM,
  XVAL_BAD_ATTEST,
  // Policy
  POLICY_INSTRUCTION_LIMIT,
  POLICY_SIZE_LIMIT,
  POLICY_UNSUPPORTED_SELECTOR,
  // Execution
  EXECUTION_FAILED,
  UNKNOWN_SELECTOR,
  // Fast-path / Preflight
  BAD_NONCE_GAP,
  NONCE_ALREADY_USED,
  PENDING_CONFLICT_STATE,
  PENDING_CONFLICT_NONCE,
  PENDING_CAP_EXCEEDED,
  ALREADY_PENDING,
  // Hot Window
  RECENT_RATE_LIMIT,
  RECENT_TOO_LARGE,
  // SSE/Events
  EVENTS_CLIENT_LIMIT,
  EVENTS_BACKPRESSURE,
  // Sync
  HEADERS_INVALID,
  ORPHAN_POOL_FULL,
  PEER_RATE_LIMIT,
  PARENT_NOT_FOUND,
  // Warm Mirror
  WARM_PREFETCH_TIMEOUT,
  WARM_SIZE_LIMIT,
  // Leases
  LEASE_QUOTA,
  LEASE_EXPIRED,
  LEASE_INVALID_SIGNATURE,
  // Journal
  JOURNAL_WRITE_FAILED,
  JOURNAL_ADAPTER_NOT_FOUND,
] as const;

export type ErrorCode = typeof ALL_ERROR_CODES[number];
