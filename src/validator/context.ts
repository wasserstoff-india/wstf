export type AccountState = {
  nonce: bigint;
  publicKey?: string; // base64 DER
  sigAlgId?: number;
};

export interface ValidationContext {
  getAccountState(address: string): Promise<AccountState | undefined>;
}
