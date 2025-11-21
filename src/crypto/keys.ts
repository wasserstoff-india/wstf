import crypto from 'crypto';
import { SigAlgId } from './algorithms';

export type Keypair = {
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
  sigAlg: SigAlgId;
};

export function generateKeypair(sigAlg: SigAlgId): Keypair {
  if (sigAlg === SigAlgId.ED25519) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    return { publicKey, privateKey, sigAlg };
  }
  if (sigAlg === SigAlgId.SECP256K1) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    return { publicKey, privateKey, sigAlg };
  }
  throw new Error('Unsupported sigAlg');
}

export function exportPubDER(pub: crypto.KeyObject): Buffer {
  return pub.export({ type: 'spki', format: 'der' }) as Buffer;
}
