import crypto from 'crypto';
import { decodeAddress } from '../crypto/address';
import { u64be, u32be, stringRef } from '../common/encoding';

export function emptyPayloadHash(): Buffer {
  return crypto.createHash('sha256').update(Buffer.alloc(0)).digest();
}

/**
 * Compute the hash of the Relay-specific payload: [methodId, to, data]
 */
export function relayPayloadHash(methodId: number, to: string, data: string): Buffer {
  const buf = Buffer.concat([
    u32be(methodId),
    stringRef(to),
    stringRef(data)
  ]);
  return crypto.createHash('sha256').update(buf).digest();
}

export function preimageBasic(
  from: string,
  nonce: bigint,
  payloadHashHex: string,
  rel?: { methodId: number; to: string; data: string }
): Buffer {
  const tag = Buffer.from('BASIC_TX');
  const { rawPayload } = decodeAddress(from);
  const nonceBuf = u64be(nonce);
  const payloadHash = Buffer.from(payloadHashHex, 'hex');

  const components = [tag, rawPayload, nonceBuf, payloadHash];

  // If relay fields are present, we could optionally include them in the preimage 
  // but usually payloadHash already covers them. To keep it v1-like:
  return Buffer.concat(components);
}

export function integrityHash(preimage: Buffer): Buffer {
  return crypto.createHash('sha256').update(preimage).digest();
}
