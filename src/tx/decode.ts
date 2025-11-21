import { BasicTx } from './basic';
import { preimageBasic, integrityHash } from './hash';

export interface DecodedBasicTx {
  preimageHex: string;
  integrityHashHex: string;
  from: string;
  nonce: bigint;
  payloadHash: string;
  signature: string;
  publicKey?: string;
}

export function decodeBasicTx(tx: BasicTx): DecodedBasicTx {
  const preimage = preimageBasic(tx.from, tx.nonce, tx.payloadHash);
  const ih = integrityHash(preimage);

  return {
    preimageHex: preimage.toString('hex'),
    integrityHashHex: ih.toString('hex'),
    from: tx.from,
    nonce: tx.nonce,
    payloadHash: tx.payloadHash,
    signature: tx.signature,
    publicKey: tx.publicKey
  };
}
