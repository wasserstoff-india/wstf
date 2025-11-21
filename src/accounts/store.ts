type AccountMeta = {
  address: string;
  nonce: bigint;
  publicKeyBase64?: string;
  sigAlgId?: number;
  mappingAlgId?: number;
  username?: string;
};

export interface AccountsStore {
  upsert(meta: AccountMeta): Promise<void>;
  get(address: string): Promise<AccountMeta | undefined>;
  bumpNonce(address: string): Promise<void>;
}

export class InMemoryAccounts implements AccountsStore {
  private m = new Map<string, AccountMeta>();

  async upsert(meta: AccountMeta): Promise<void> {
    this.m.set(meta.address, meta);
  }

  async get(address: string): Promise<AccountMeta | undefined> {
    return this.m.get(address);
  }

  async bumpNonce(address: string): Promise<void> {
    const a = this.m.get(address);
    if (a) {
      a.nonce = (a.nonce ?? 0n) + 1n;
    }
  }
}
