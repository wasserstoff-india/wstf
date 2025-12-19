import crypto from 'crypto';
import { BasicTx, BASIC_TX_VERSION } from '../tx/basic';
import { relayPayloadHash, emptyPayloadHash, preimageBasic, integrityHash } from '../tx/hash';
import { decodeAddress, publicKeyMatchesAddress } from '../crypto/address';
import { verifyPreimage } from '../crypto/sign';
import { ValidationContext } from './context';

export async function validateBasicTx(
  tx: BasicTx,
  ctx: ValidationContext
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (tx.version !== BASIC_TX_VERSION) {
    return fail('BAD_VERSION');
  }

  // Decode address (will throw if malformed)
  try {
    decodeAddress(tx.from);
  } catch (e) {
    return fail('BAD_ADDRESS', String(e));
  }

  const acc = await ctx.getAccountState(tx.from);
  if (!acc) {
    return fail('UNKNOWN_ACCOUNT');
  }

  if (tx.nonce !== acc.nonce + 1n) {
    return fail('BAD_NONCE', `Expected ${acc.nonce + 1n}, got ${tx.nonce}`);
  }

  // Verify payloadHash
  let expectedPayload: string;
  if (tx.methodId !== undefined && tx.to !== undefined && tx.data !== undefined) {
    expectedPayload = relayPayloadHash(tx.methodId, tx.to, tx.data).toString('hex');
  } else {
    expectedPayload = emptyPayloadHash().toString('hex');
  }

  if (tx.payloadHash !== expectedPayload) {
    return fail('BAD_PAYLOAD_HASH');
  }

  const preimage = preimageBasic(tx.from, tx.nonce, tx.payloadHash);
  const expInt = integrityHash(preimage).toString('hex');
  if (tx.integrityHash !== expInt) {
    return fail('BAD_INTEGRITY_HASH');
  }

  // Pick public key: prefer account state; fallback to tx.publicKey
  const pubDERb64 = acc.publicKey ?? tx.publicKey;
  if (!pubDERb64) {
    return fail('NO_PUBKEY');
  }

  const pub = crypto.createPublicKey({
    key: Buffer.from(pubDERb64, 'base64'),
    format: 'der',
    type: 'spki'
  });

  if (!publicKeyMatchesAddress(pub, tx.from)) {
    return fail('ADDR_PUBKEY_MISMATCH');
  }

  const sig = Buffer.from(tx.signature, 'hex');
  const sigAlgId = acc.sigAlgId ?? decodeAddress(tx.from).sigAlg;
  const ok = verifyPreimage(sigAlgId as any, pub, preimage, sig);
  if (!ok) {
    return fail('BAD_SIGNATURE');
  }

  return { ok: true } as const;
}

function fail(code: string, message: string = code): { ok: false; code: string; message: string } {
  return { ok: false as const, code, message };
}
