/**
 * Transaction v2F - Fee Envelope
 *
 * Extends Tx v2 with gas and fee parameters for the economics layer.
 */
import crypto from 'crypto';

export type Hex32 = `0x${string}`;

/**
 * Tx v2F envelope
 */
export interface TxV2F {
  /** Version (3 for v2F) */
  version: 3;
  /** Sender address (gc1...) */
  from: string;
  /** Transaction nonce */
  nonce: bigint;
  /** Instructions hash */
  instructionsHash: Hex32;
  /** Reads hash (state IDs touched) */
  readsHash: Hex32;
  /** Locks hash (states locked for write) */
  locksHash: Hex32;
  /** Maximum gas willing to spend */
  maxGas: bigint;
  /** Gas price per unit */
  gasPrice: bigint;
  /** Fee payer (equals from unless sponsorship enabled) */
  feePayer: string;
  /** Paymaster address (optional, for sponsorship) */
  paymaster?: string;
  /** Integrity hash of preimage */
  integrityHash: Hex32;
  /** Signature */
  signature: string;
  /** Public key (base64 DER) */
  publicKey?: string;
}

/**
 * Tx v2F without computed fields (for preimage construction)
 */
export type TxV2FPreimage = Omit<TxV2F, 'integrityHash' | 'signature'>;

/**
 * Encode u64 as big-endian bytes
 */
export function u64be(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(n);
  return buf;
}

/**
 * Decode address to raw payload (22 bytes)
 * Assumes address is in format gc1{hex38}
 */
export function decodeAddressRaw(address: string): Buffer {
  if (!address.startsWith('gc1')) {
    throw new Error('Invalid address format');
  }
  return Buffer.from(address.slice(3), 'hex');
}

/**
 * Build preimage for signing
 */
export function buildPreimage(tx: TxV2FPreimage): Buffer {
  const tag = Buffer.from('TX2F');
  const fromRaw = decodeAddressRaw(tx.from);
  const feePayerRaw = decodeAddressRaw(tx.feePayer);
  const paymasterRaw = tx.paymaster
    ? decodeAddressRaw(tx.paymaster)
    : Buffer.alloc(22, 0);

  return Buffer.concat([
    tag,                                                      // 4 bytes
    fromRaw,                                                  // 22 bytes
    u64be(tx.nonce),                                          // 8 bytes
    Buffer.from(tx.instructionsHash.slice(2), 'hex'),         // 32 bytes
    Buffer.from(tx.readsHash.slice(2), 'hex'),                // 32 bytes
    Buffer.from(tx.locksHash.slice(2), 'hex'),                // 32 bytes
    u64be(tx.maxGas),                                         // 8 bytes
    u64be(tx.gasPrice),                                       // 8 bytes
    feePayerRaw,                                              // 22 bytes
    paymasterRaw,                                             // 22 bytes
  ]);
}

/**
 * Compute integrity hash from preimage
 */
export function computeIntegrityHash(preimage: Buffer): Hex32 {
  const h = crypto.createHash('sha256').update(preimage).digest('hex');
  return `0x${h}` as Hex32;
}

/**
 * Compute transaction ID (hash of full tx)
 */
export function computeTxId(tx: TxV2F): string {
  const data = JSON.stringify({
    version: tx.version,
    from: tx.from,
    nonce: tx.nonce.toString(),
    instructionsHash: tx.instructionsHash,
    readsHash: tx.readsHash,
    locksHash: tx.locksHash,
    maxGas: tx.maxGas.toString(),
    gasPrice: tx.gasPrice.toString(),
    feePayer: tx.feePayer,
    paymaster: tx.paymaster,
    integrityHash: tx.integrityHash,
    signature: tx.signature,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate tx v2F structure
 */
export function validateTxV2FStructure(tx: any): { ok: boolean; code?: string } {
  if (!tx) return { ok: false, code: 'EMPTY_TX' };
  if (tx.version !== 3) return { ok: false, code: 'INVALID_VERSION' };
  if (!tx.from || typeof tx.from !== 'string') return { ok: false, code: 'INVALID_FROM' };
  if (typeof tx.nonce !== 'bigint') return { ok: false, code: 'INVALID_NONCE' };
  if (!tx.instructionsHash || !tx.instructionsHash.startsWith('0x')) return { ok: false, code: 'INVALID_INSTRUCTIONS_HASH' };
  if (!tx.readsHash || !tx.readsHash.startsWith('0x')) return { ok: false, code: 'INVALID_READS_HASH' };
  if (!tx.locksHash || !tx.locksHash.startsWith('0x')) return { ok: false, code: 'INVALID_LOCKS_HASH' };
  if (typeof tx.maxGas !== 'bigint' || tx.maxGas <= 0n) return { ok: false, code: 'INVALID_MAX_GAS' };
  if (typeof tx.gasPrice !== 'bigint' || tx.gasPrice <= 0n) return { ok: false, code: 'INVALID_GAS_PRICE' };
  if (!tx.feePayer || typeof tx.feePayer !== 'string') return { ok: false, code: 'INVALID_FEE_PAYER' };
  if (!tx.integrityHash || !tx.integrityHash.startsWith('0x')) return { ok: false, code: 'INVALID_INTEGRITY_HASH' };
  if (!tx.signature || !tx.signature.startsWith('0x')) return { ok: false, code: 'INVALID_SIGNATURE' };

  return { ok: true };
}

/**
 * Create a sample Tx v2F (for testing)
 */
export function createSampleTxV2F(params: Partial<TxV2FPreimage>): TxV2F {
  const tx: TxV2FPreimage = {
    version: 3,
    from: params.from ?? 'gc1' + '00'.repeat(22),
    nonce: params.nonce ?? 0n,
    instructionsHash: params.instructionsHash ?? ('0x' + '00'.repeat(32)) as Hex32,
    readsHash: params.readsHash ?? ('0x' + '00'.repeat(32)) as Hex32,
    locksHash: params.locksHash ?? ('0x' + '00'.repeat(32)) as Hex32,
    maxGas: params.maxGas ?? 10000n,
    gasPrice: params.gasPrice ?? 1n,
    feePayer: params.feePayer ?? params.from ?? 'gc1' + '00'.repeat(22),
    paymaster: params.paymaster,
    publicKey: params.publicKey,
  };

  const preimage = buildPreimage(tx);
  const integrityHash = computeIntegrityHash(preimage);

  // Mock signature (for testing - real signature requires private key)
  const signature = '0x' + crypto.createHash('sha256').update(preimage).digest('hex');

  return {
    ...tx,
    integrityHash,
    signature,
  };
}
