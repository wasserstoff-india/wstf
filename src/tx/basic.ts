export const BASIC_TX_VERSION = 1;

export type BasicTx = {
  version: 1;
  from: string;       // address string (gc…)
  nonce: bigint;      // u64
  payloadHash: string;// hex; H(methodId + to + data)
  integrityHash: string; // hex; H(preimage) for display/id
  signature: string;  // hex; signature over PREIMAGE
  publicKey?: string; // base64 DER (optional)

  // Relay / Modular Backend fields
  methodId?: number;
  to?: string;        // @username, address, or chainId
  data?: string;      // JSON or hex
};
