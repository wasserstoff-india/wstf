export interface UserIndex {
  bind(username: string, address: string): Promise<void>;
  getAddress(username: string): Promise<string | undefined>;
  getUsername(address: string): Promise<string | undefined>;
}

export class InMemoryUserIndex implements UserIndex {
  private u2a = new Map<string, string>();
  private a2u = new Map<string, string>();

  async bind(u: string, a: string): Promise<void> {
    if (this.u2a.has(u)) {
      throw new Error('USERNAME_TAKEN');
    }
    if (this.a2u.has(a)) {
      throw new Error('ADDR_BOUND');
    }
    this.u2a.set(u, a);
    this.a2u.set(a, u);
  }

  async getAddress(u: string): Promise<string | undefined> {
    return this.u2a.get(u);
  }

  async getUsername(a: string): Promise<string | undefined> {
    return this.a2u.get(a);
  }
}
