import crypto from 'crypto';
import { SigAlgId } from './algorithms';

export function signPreimage(
  sigAlg: SigAlgId,
  priv: crypto.KeyObject,
  preimage: Buffer
): Buffer {
  if (sigAlg === SigAlgId.ED25519) {
    return crypto.sign(null, preimage, priv);
  }
  if (sigAlg === SigAlgId.SECP256K1) {
    return crypto.createSign('sha256').update(preimage).sign(priv);
  }
  throw new Error('Unsupported sigAlg');
}

export function verifyPreimage(
  sigAlg: SigAlgId,
  pub: crypto.KeyObject,
  preimage: Buffer,
  sig: Buffer
): boolean {
  if (sigAlg === SigAlgId.ED25519) {
    return crypto.verify(null, preimage, pub, sig);
  }
  if (sigAlg === SigAlgId.SECP256K1) {
    return crypto.createVerify('sha256').update(preimage).verify(pub, sig);
  }
  return false;
}
