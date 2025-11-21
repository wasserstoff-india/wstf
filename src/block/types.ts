/**
 * Block types for WSTFChain
 */
import crypto from 'crypto';
import cbor from 'cbor';

/**
 * Block header (canonical format for hashing)
 */
export interface BlockHeader {
  version: number;        // u32
  height: bigint;         // u64
  parentHash: string;     // hex, 32 bytes
  time: bigint;           // unix seconds, u64
  txRoot: string;         // hex, 32 bytes - Merkle root of txs
  effectsRoot: string;    // hex, 32 bytes - Merkle root of effects
  stateRoot: string;      // hex, 32 bytes - state commitment
  target: string;         // hex, 32 bytes - PoW target
  nonce: bigint;          // u64
}

/**
 * Per-transaction effect record (deterministic)
 */
export interface EffectRecord {
  txId: string;           // Hash of the transaction
  success: boolean;
  writes: Array<{ stateId: string; data: any }>;
  logs: string[];
  error?: string;
}

/**
 * Block body
 */
export interface BlockBody {
  transactions: any[];      // Array of TxV1 or TxV2
  effects?: EffectRecord[]; // Optional (can be recomputed)
}

/**
 * Full block
 */
export interface Block {
  header: BlockHeader;
  body: BlockBody;
}

/**
 * Block metadata (for chain store)
 */
export interface BlockMeta {
  hash: string;
  chainwork: bigint;  // Cumulative work up to this block
  status: 'valid' | 'orphan' | 'invalid';
}

/**
 * Encode block header to canonical bytes (for hashing)
 */
export function encodeBlockHeader(header: BlockHeader): Buffer {
  // Canonical encoding: version + height + parentHash + time + roots + target + nonce
  const parts: Buffer[] = [];

  // version (4 bytes, BE)
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeUInt32BE(header.version, 0);
  parts.push(versionBuf);

  // height (8 bytes, BE)
  const heightBuf = Buffer.alloc(8);
  heightBuf.writeBigUInt64BE(header.height, 0);
  parts.push(heightBuf);

  // parentHash (32 bytes)
  parts.push(Buffer.from(header.parentHash, 'hex'));

  // time (8 bytes, BE)
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigUInt64BE(header.time, 0);
  parts.push(timeBuf);

  // txRoot (32 bytes)
  parts.push(Buffer.from(header.txRoot, 'hex'));

  // effectsRoot (32 bytes)
  parts.push(Buffer.from(header.effectsRoot, 'hex'));

  // stateRoot (32 bytes)
  parts.push(Buffer.from(header.stateRoot, 'hex'));

  // target (32 bytes)
  parts.push(Buffer.from(header.target, 'hex'));

  // nonce (8 bytes, BE)
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64BE(header.nonce, 0);
  parts.push(nonceBuf);

  return Buffer.concat(parts);
}

/**
 * Decode block header from canonical bytes
 */
export function decodeBlockHeader(buffer: Buffer): BlockHeader {
  let offset = 0;

  const version = buffer.readUInt32BE(offset);
  offset += 4;

  const height = buffer.readBigUInt64BE(offset);
  offset += 8;

  const parentHash = buffer.slice(offset, offset + 32).toString('hex');
  offset += 32;

  const time = buffer.readBigUInt64BE(offset);
  offset += 8;

  const txRoot = buffer.slice(offset, offset + 32).toString('hex');
  offset += 32;

  const effectsRoot = buffer.slice(offset, offset + 32).toString('hex');
  offset += 32;

  const stateRoot = buffer.slice(offset, offset + 32).toString('hex');
  offset += 32;

  const target = buffer.slice(offset, offset + 32).toString('hex');
  offset += 32;

  const nonce = buffer.readBigUInt64BE(offset);
  offset += 8;

  return {
    version,
    height,
    parentHash,
    time,
    txRoot,
    effectsRoot,
    stateRoot,
    target,
    nonce
  };
}

/**
 * Compute block ID (double SHA256)
 */
export function computeBlockId(header: BlockHeader): string {
  const encoded = encodeBlockHeader(header);
  const hash1 = crypto.createHash('sha256').update(encoded).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  return hash2.toString('hex');
}

/**
 * Compute work from target
 * work = floor((2^256 - 1) / (target + 1))
 */
export function computeWork(targetHex: string): bigint {
  const target = BigInt('0x' + targetHex);
  const max = BigInt('0x' + 'f'.repeat(64)); // 2^256 - 1
  return max / (target + 1n);
}

/**
 * Check if block hash meets target
 */
export function meetsTarget(blockHash: string, targetHex: string): boolean {
  const hash = BigInt('0x' + blockHash);
  const target = BigInt('0x' + targetHex);
  return hash <= target;
}

/**
 * Encode block body (CBOR for now, can optimize later)
 */
export function encodeBlockBody(body: BlockBody): Buffer {
  return cbor.encode(body);
}

/**
 * Decode block body
 */
export function decodeBlockBody(buffer: Buffer): BlockBody {
  return cbor.decode(buffer);
}

/**
 * Genesis block parameters
 */
export const GENESIS_PARAMS = {
  version: 1,
  height: 0n,
  parentHash: '00'.repeat(32),
  time: BigInt(Math.floor(Date.now() / 1000)),
  target: '00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // Easy target for dev
  stateRoot: '00'.repeat(32) // Empty state
};

/**
 * Create genesis block
 */
export function createGenesisBlock(): Block {
  const header: BlockHeader = {
    version: GENESIS_PARAMS.version,
    height: GENESIS_PARAMS.height,
    parentHash: GENESIS_PARAMS.parentHash,
    time: GENESIS_PARAMS.time,
    txRoot: '00'.repeat(32), // No transactions
    effectsRoot: '00'.repeat(32), // No effects
    stateRoot: GENESIS_PARAMS.stateRoot,
    target: GENESIS_PARAMS.target,
    nonce: 0n
  };

  return {
    header,
    body: {
      transactions: [],
      effects: []
    }
  };
}
