import crypto from 'crypto';
import { decodeAddress } from '../crypto/address';
import { u64be } from '../common/encoding';
import { computeInstructionsHash } from '../instructions/abi';
import { StateRead, StateLock } from '../executor/types';

export const TX_V2_VERSION = 2;

/**
 * Transaction v2 structure
 * Includes instruction programs with reads/locks
 */
export type TxV2 = {
  version: 2;
  from: string;               // address string (gc…)
  nonce: bigint;              // u64
  programHex: string;         // hex; binary program bytes
  instructionsHash: string;   // hex; H(program)
  readsHash: string;          // hex; H(reads)
  locksHash: string;          // hex; H(locks)
  integrityHash: string;      // hex; H(preimage) for display/id
  signature: string;          // hex; signature over PREIMAGE
  publicKey?: string;         // base64 DER (optional)
  reads: StateRead[];         // Declared reads
  locks: StateLock[];         // Declared locks
};

/**
 * Compute preimage for Tx v2
 * "TX2" || rawAddress(22B) || nonce_u64_be || instructionsHash(32B) || readsHash(32B) || locksHash(32B)
 */
export function preimageTxV2(
  from: string,
  nonce: bigint,
  instructionsHash: string,
  readsHash: string,
  locksHash: string
): Buffer {
  const tag = Buffer.from('TX2');
  const { rawPayload } = decodeAddress(from);
  const nonceBuf = u64be(nonce);
  const instrHashBuf = Buffer.from(instructionsHash, 'hex');
  const readsHashBuf = Buffer.from(readsHash, 'hex');
  const locksHashBuf = Buffer.from(locksHash, 'hex');

  return Buffer.concat([
    tag,
    rawPayload,
    nonceBuf,
    instrHashBuf,
    readsHashBuf,
    locksHashBuf
  ]);
}

/**
 * Compute integrity hash for Tx v2
 */
export function integrityHashTxV2(preimage: Buffer): Buffer {
  return crypto.createHash('sha256').update(preimage).digest();
}

/**
 * Compute reads hash from reads array
 * readsHash = SHA256(concat(stateId || expectedVersion for each read))
 */
export function computeReadsHash(reads: StateRead[]): string {
  if (reads.length === 0) {
    return '0'.repeat(64); // Zero hash for empty reads
  }

  const buffers = reads.map(r =>
    Buffer.concat([
      Buffer.from(r.stateId, 'hex'),
      Buffer.from(r.expectedVersion, 'hex')
    ])
  );

  return crypto.createHash('sha256')
    .update(Buffer.concat(buffers))
    .digest()
    .toString('hex');
}

/**
 * Compute locks hash from locks array
 * locksHash = SHA256(concat(stateId for each lock))
 */
export function computeLocksHash(locks: StateLock[]): string {
  if (locks.length === 0) {
    return '0'.repeat(64); // Zero hash for empty locks
  }

  const buffers = locks.map(l => Buffer.from(l.stateId, 'hex'));

  return crypto.createHash('sha256')
    .update(Buffer.concat(buffers))
    .digest()
    .toString('hex');
}

/**
 * Build a complete Tx v2 from components
 */
export function buildTxV2(params: {
  from: string;
  nonce: bigint;
  programBytes: Buffer;
  reads: StateRead[];
  locks: StateLock[];
  signature: string;
  publicKey?: string;
}): TxV2 {
  const instructionsHash = computeInstructionsHash(params.programBytes).toString('hex');
  const readsHash = computeReadsHash(params.reads);
  const locksHash = computeLocksHash(params.locks);

  const preimage = preimageTxV2(
    params.from,
    params.nonce,
    instructionsHash,
    readsHash,
    locksHash
  );

  const integrityHash = integrityHashTxV2(preimage).toString('hex');

  return {
    version: 2,
    from: params.from,
    nonce: params.nonce,
    programHex: params.programBytes.toString('hex'),
    instructionsHash,
    readsHash,
    locksHash,
    integrityHash,
    signature: params.signature,
    publicKey: params.publicKey,
    reads: params.reads,
    locks: params.locks
  };
}
