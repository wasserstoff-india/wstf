/**
 * Balances - Account balance management
 */
import crypto from 'crypto';
import { Balance, Hex32 } from './types';

/** Balance namespace tag */
export const BAL_NS = Buffer.from('BAL');

/**
 * Compute balance state ID for an address
 */
export function balanceStateId(address: string): Hex32 {
  // Extract raw payload from address (after gc1 prefix)
  const raw = Buffer.from(address.slice(3), 'hex');
  const h = crypto.createHash('sha256').update(BAL_NS).update(raw).digest('hex');
  return `0x${h}` as Hex32;
}

/**
 * Balance view interface
 */
export interface BalanceView {
  /** Get balance for address */
  get(address: string): Promise<Balance>;

  /** Credit (add) to address */
  credit(address: string, amount: Balance): Promise<void>;

  /** Debit (subtract) from address - returns false if insufficient */
  debit(address: string, amount: Balance): Promise<boolean>;

  /** Transfer between addresses */
  transfer(from: string, to: string, amount: Balance): Promise<boolean>;
}

/**
 * In-memory balance store
 */
export class InMemoryBalanceStore implements BalanceView {
  private balances = new Map<string, Balance>();

  /**
   * Get balance
   */
  async get(address: string): Promise<Balance> {
    return this.balances.get(address) ?? 0n;
  }

  /**
   * Credit balance
   */
  async credit(address: string, amount: Balance): Promise<void> {
    const current = this.balances.get(address) ?? 0n;
    this.balances.set(address, current + amount);
  }

  /**
   * Debit balance
   */
  async debit(address: string, amount: Balance): Promise<boolean> {
    const current = this.balances.get(address) ?? 0n;

    if (current < amount) {
      return false;
    }

    this.balances.set(address, current - amount);
    return true;
  }

  /**
   * Transfer balance
   */
  async transfer(from: string, to: string, amount: Balance): Promise<boolean> {
    const fromBalance = this.balances.get(from) ?? 0n;

    if (fromBalance < amount) {
      return false;
    }

    const toBalance = this.balances.get(to) ?? 0n;

    this.balances.set(from, fromBalance - amount);
    this.balances.set(to, toBalance + amount);

    return true;
  }

  /**
   * Set balance directly (for genesis/faucet)
   */
  setBalance(address: string, amount: Balance): void {
    this.balances.set(address, amount);
  }

  /**
   * Get all balances
   */
  getAll(): Map<string, Balance> {
    return new Map(this.balances);
  }

  /**
   * Clear all balances
   */
  clear(): void {
    this.balances.clear();
  }

  /**
   * Get total supply
   */
  getTotalSupply(): Balance {
    let total = 0n;
    for (const bal of this.balances.values()) {
      total += bal;
    }
    return total;
  }

  /**
   * Get number of accounts with balance
   */
  getAccountCount(): number {
    let count = 0;
    for (const bal of this.balances.values()) {
      if (bal > 0n) count++;
    }
    return count;
  }
}
