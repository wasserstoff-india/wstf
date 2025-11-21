export const BASIC_TX_VERSION = 1;

export type BasicTx = {
  version: 1;
  from: string;       // address string (gc…)
  nonce: bigint;      // u64
  payloadHash: string;// hex; H(emptyBytes)
  integrityHash: string; // hex; H(preimage) for display/id
  signature: string;  // hex; signature over PREIMAGE, not over integrityHash
  publicKey?: string; // base64 DER (optional; useful before state exists)
};
