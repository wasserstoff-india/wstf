import crypto from 'crypto';
import { decodeAddress } from '../crypto/address';
import { u64be } from '../common/encoding';

export function emptyPayloadHash(): Buffer {
  return crypto.createHash('sha256').update(Buffer.alloc(0)).digest();
}

export function preimageBasic(from: string, nonce: bigint, payloadHashHex: string): Buffer {
  const tag = Buffer.from('BASIC_TX');
  const { rawPayload } = decodeAddress(from);
  const nonceBuf = u64be(nonce);
  const payloadHash = Buffer.from(payloadHashHex, 'hex');
  return Buffer.concat([tag, rawPayload, nonceBuf, payloadHash]);
}

export function integrityHash(preimage: Buffer): Buffer {
  return crypto.createHash('sha256').update(preimage).digest();
}
