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
] as const;

export type ErrorCode = typeof ALL_ERROR_CODES[number];
