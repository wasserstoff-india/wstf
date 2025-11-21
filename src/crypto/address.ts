import bs58check from 'bs58check';
import crypto from 'crypto';
import { MappingAlgId, SigAlgId } from './algorithms';
import { exportPubDER } from './keys';

const NETWORK_PREFIX = 'gc';
const PK_HASH_LEN = 20;

export type RawAddress = {
  mappingAlg: MappingAlgId;
  sigAlg: SigAlgId;
  pkHash: Buffer;
  rawPayload: Buffer;
};

export function buildAddressPayload(
  pubDER: Buffer,
  mappingAlg: MappingAlgId,
  sigAlg: SigAlgId
): Buffer {
  if (mappingAlg !== MappingAlgId.SIMPLE_HASH) {
    throw new Error('mappingAlg unsupported');
  }
  const h = crypto.createHash('sha256').update(pubDER).digest();
  const pkHash = h.slice(-PK_HASH_LEN);
  const payload = Buffer.alloc(2 + PK_HASH_LEN);
  payload[0] = mappingAlg;
  payload[1] = sigAlg;
  pkHash.copy(payload, 2);
  return payload;
}

export function deriveAddress(
  pubDER: Buffer,
  mappingAlg: MappingAlgId,
  sigAlg: SigAlgId
): string {
  return NETWORK_PREFIX + bs58check.encode(buildAddressPayload(pubDER, mappingAlg, sigAlg));
}

export function decodeAddress(address: string): RawAddress {
  if (!address.startsWith(NETWORK_PREFIX)) {
    throw new Error('Bad prefix');
  }
  const payload = Buffer.from(bs58check.decode(address.slice(NETWORK_PREFIX.length)));
  if (payload.length !== 22) {
    throw new Error('Bad payload length');
  }
  const mappingAlg = payload[0] as MappingAlgId;
  const sigAlg = payload[1] as SigAlgId;
  const pkHash = Buffer.from(payload.slice(2));
  return { mappingAlg, sigAlg, pkHash, rawPayload: payload };
}

export function publicKeyMatchesAddress(pub: crypto.KeyObject, address: string): boolean {
  const dec = decodeAddress(address);
  const pubDER = exportPubDER(pub);
  const h = crypto.createHash('sha256').update(pubDER).digest().slice(-PK_HASH_LEN);
  return h.equals(dec.pkHash);
}
