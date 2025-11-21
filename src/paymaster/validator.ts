/**
 * Paymaster Validator - Voucher validation and sponsorship
 */

import crypto from 'crypto';
import {
  Voucher,
  CreateVoucherParams,
  PaymasterValidation,
  PaymasterConfig,
  PaymasterInfo,
  DEFAULT_PAYMASTER_CONFIG,
} from '../rpc/types';
import { Gas, Balance } from '../economics/types';
import { SponsorshipResult, VoucherUsage, BalanceUpdate, PaymasterStats } from './types';

/**
 * Paymaster Validator - manages vouchers and validates sponsorship
 */
export class PaymasterValidator {
  private config: PaymasterConfig;
  private paymasters: Map<string, PaymasterInfo>;
  private vouchers: Map<string, Voucher>;
  private vouchersByPaymaster: Map<string, Set<string>>;
  private vouchersByBeneficiary: Map<string, Set<string>>;
  private usageLog: VoucherUsage[];
  private balanceUpdates: BalanceUpdate[];

  constructor(config: Partial<PaymasterConfig> = {}) {
    this.config = { ...DEFAULT_PAYMASTER_CONFIG, ...config };
    this.paymasters = new Map();
    this.vouchers = new Map();
    this.vouchersByPaymaster = new Map();
    this.vouchersByBeneficiary = new Map();
    this.usageLog = [];
    this.balanceUpdates = [];
  }

  /**
   * Check if paymaster system is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Register a new paymaster
   */
  registerPaymaster(address: string, deposit: Balance): { ok: boolean; error?: string } {
    if (!this.config.enabled) {
      return { ok: false, error: 'Paymaster system disabled' };
    }

    if (this.paymasters.has(address)) {
      return { ok: false, error: 'Paymaster already registered' };
    }

    const info: PaymasterInfo = {
      address,
      balance: deposit,
      totalSponsored: 0n,
      activeVouchers: 0,
      policies: [],
    };

    this.paymasters.set(address, info);
    this.vouchersByPaymaster.set(address, new Set());

    this.balanceUpdates.push({
      address,
      delta: deposit,
      reason: 'deposit',
    });

    return { ok: true };
  }

  /**
   * Deposit to paymaster balance
   */
  deposit(address: string, amount: Balance): { ok: boolean; error?: string } {
    const paymaster = this.paymasters.get(address);
    if (!paymaster) {
      return { ok: false, error: 'Paymaster not found' };
    }

    paymaster.balance += amount;
    this.balanceUpdates.push({
      address,
      delta: amount,
      reason: 'deposit',
    });

    return { ok: true };
  }

  /**
   * Withdraw from paymaster balance
   */
  withdraw(address: string, amount: Balance): { ok: boolean; error?: string } {
    const paymaster = this.paymasters.get(address);
    if (!paymaster) {
      return { ok: false, error: 'Paymaster not found' };
    }

    if (paymaster.balance < amount) {
      return { ok: false, error: 'Insufficient balance' };
    }

    paymaster.balance -= amount;
    this.balanceUpdates.push({
      address,
      delta: -amount,
      reason: 'withdraw',
    });

    return { ok: true };
  }

  /**
   * Create a new voucher
   */
  createVoucher(
    paymasterAddress: string,
    params: CreateVoucherParams,
    currentHeight: bigint
  ): { ok: boolean; voucher?: Voucher; error?: string } {
    if (!this.config.enabled) {
      return { ok: false, error: 'Paymaster system disabled' };
    }

    const paymaster = this.paymasters.get(paymasterAddress);
    if (!paymaster) {
      return { ok: false, error: 'Paymaster not found' };
    }

    // Check voucher limits
    const existingVouchers = this.vouchersByPaymaster.get(paymasterAddress);
    if (existingVouchers && existingVouchers.size >= this.config.maxVouchersPerPaymaster) {
      return { ok: false, error: 'Max vouchers per paymaster exceeded' };
    }

    // Check gas limit
    if (params.maxGas > this.config.maxGasPerVoucher) {
      return { ok: false, error: `Max gas per voucher is ${this.config.maxGasPerVoucher}` };
    }

    // Generate voucher ID
    const id = crypto.randomBytes(16).toString('hex');

    const voucher: Voucher = {
      id,
      paymaster: paymasterAddress,
      beneficiary: params.beneficiary,
      maxGas: params.maxGas,
      usedGas: 0n,
      expiresAt: params.expiresAt ?? currentHeight + this.config.defaultExpiryBlocks,
      singleUse: params.singleUse ?? false,
      active: true,
      createdAt: currentHeight,
    };

    this.vouchers.set(id, voucher);

    // Update indexes
    const pmVouchers = this.vouchersByPaymaster.get(paymasterAddress) ?? new Set();
    pmVouchers.add(id);
    this.vouchersByPaymaster.set(paymasterAddress, pmVouchers);

    const beneficiaryVouchers = this.vouchersByBeneficiary.get(params.beneficiary) ?? new Set();
    beneficiaryVouchers.add(id);
    this.vouchersByBeneficiary.set(params.beneficiary, beneficiaryVouchers);

    // Update paymaster stats
    paymaster.activeVouchers++;

    return { ok: true, voucher };
  }

  /**
   * Revoke a voucher
   */
  revokeVoucher(voucherId: string, paymasterAddress: string): { ok: boolean; error?: string } {
    const voucher = this.vouchers.get(voucherId);
    if (!voucher) {
      return { ok: false, error: 'Voucher not found' };
    }

    if (voucher.paymaster !== paymasterAddress) {
      return { ok: false, error: 'Not authorized to revoke this voucher' };
    }

    voucher.active = false;

    // Update paymaster stats
    const paymaster = this.paymasters.get(paymasterAddress);
    if (paymaster) {
      paymaster.activeVouchers--;
    }

    return { ok: true };
  }

  /**
   * Validate sponsorship for a transaction
   */
  validateSponsorship(
    sender: string,
    paymasterAddress: string,
    gasNeeded: Gas,
    currentHeight: bigint
  ): PaymasterValidation {
    if (!this.config.enabled) {
      return { valid: false, reason: 'Paymaster system disabled' };
    }

    const paymaster = this.paymasters.get(paymasterAddress);
    if (!paymaster) {
      return { valid: false, reason: 'Paymaster not found' };
    }

    // Find valid voucher for sender
    const beneficiaryVouchers = this.vouchersByBeneficiary.get(sender);
    if (!beneficiaryVouchers || beneficiaryVouchers.size === 0) {
      return { valid: false, reason: 'No vouchers for sender' };
    }

    for (const voucherId of beneficiaryVouchers) {
      const voucher = this.vouchers.get(voucherId);
      if (!voucher) continue;

      // Check voucher belongs to this paymaster
      if (voucher.paymaster !== paymasterAddress) continue;

      // Check voucher is active
      if (!voucher.active) continue;

      // Check expiration
      if (voucher.expiresAt <= currentHeight) {
        voucher.active = false;
        continue;
      }

      // Check gas availability
      const remainingGas = voucher.maxGas - voucher.usedGas;
      if (remainingGas < gasNeeded) continue;

      // Check paymaster balance can cover
      const cost = gasNeeded; // Simplified: 1 gas = 1 balance unit
      if (paymaster.balance < cost) {
        return { valid: false, voucher, reason: 'Paymaster insufficient balance' };
      }

      return { valid: true, voucher };
    }

    return { valid: false, reason: 'No valid voucher found' };
  }

  /**
   * Use a voucher to sponsor a transaction
   */
  useVoucher(
    voucherId: string,
    gasUsed: Gas,
    txHash: string,
    currentHeight: bigint
  ): SponsorshipResult {
    const voucher = this.vouchers.get(voucherId);
    if (!voucher) {
      return { sponsored: false, error: 'Voucher not found' };
    }

    if (!voucher.active) {
      return { sponsored: false, error: 'Voucher not active' };
    }

    if (voucher.expiresAt <= currentHeight) {
      voucher.active = false;
      return { sponsored: false, error: 'Voucher expired' };
    }

    const remainingGas = voucher.maxGas - voucher.usedGas;
    if (remainingGas < gasUsed) {
      return { sponsored: false, error: 'Insufficient voucher gas' };
    }

    const paymaster = this.paymasters.get(voucher.paymaster);
    if (!paymaster) {
      return { sponsored: false, error: 'Paymaster not found' };
    }

    // Deduct from paymaster balance
    const cost = gasUsed; // Simplified
    if (paymaster.balance < cost) {
      return { sponsored: false, error: 'Paymaster insufficient balance' };
    }

    // Apply sponsorship
    voucher.usedGas += gasUsed;
    paymaster.balance -= cost;
    paymaster.totalSponsored += cost;

    // Mark single-use vouchers as inactive
    if (voucher.singleUse) {
      voucher.active = false;
      paymaster.activeVouchers--;
    }

    // Log usage
    this.usageLog.push({
      voucherId,
      txHash,
      gasUsed,
      timestamp: currentHeight,
    });

    this.balanceUpdates.push({
      address: voucher.paymaster,
      delta: -cost,
      reason: 'sponsor',
      txHash,
    });

    return {
      sponsored: true,
      paymaster: voucher.paymaster,
      voucherId,
      gasSponsored: gasUsed,
    };
  }

  /**
   * Get paymaster info
   */
  getPaymaster(address: string): PaymasterInfo | undefined {
    return this.paymasters.get(address);
  }

  /**
   * Get voucher
   */
  getVoucher(id: string): Voucher | undefined {
    return this.vouchers.get(id);
  }

  /**
   * Get vouchers for beneficiary
   */
  getVouchersForBeneficiary(address: string): Voucher[] {
    const ids = this.vouchersByBeneficiary.get(address);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.vouchers.get(id))
      .filter((v): v is Voucher => v !== undefined);
  }

  /**
   * Get vouchers for paymaster
   */
  getVouchersForPaymaster(address: string): Voucher[] {
    const ids = this.vouchersByPaymaster.get(address);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.vouchers.get(id))
      .filter((v): v is Voucher => v !== undefined);
  }

  /**
   * Get usage log
   */
  getUsageLog(limit?: number): VoucherUsage[] {
    const log = [...this.usageLog].reverse();
    return limit ? log.slice(0, limit) : log;
  }

  /**
   * Get stats
   */
  getStats(): PaymasterStats {
    let activeVouchers = 0;
    let totalSponsored = 0n;
    let totalDeposited = 0n;

    for (const voucher of this.vouchers.values()) {
      if (voucher.active) activeVouchers++;
    }

    for (const pm of this.paymasters.values()) {
      totalSponsored += pm.totalSponsored;
      totalDeposited += pm.balance;
    }

    return {
      totalPaymasters: this.paymasters.size,
      totalVouchers: this.vouchers.size,
      activeVouchers,
      totalSponsored,
      totalDeposited,
    };
  }

  /**
   * Cleanup expired vouchers
   */
  cleanupExpired(currentHeight: bigint): number {
    let cleaned = 0;

    for (const voucher of this.vouchers.values()) {
      if (voucher.active && voucher.expiresAt <= currentHeight) {
        voucher.active = false;
        const paymaster = this.paymasters.get(voucher.paymaster);
        if (paymaster) {
          paymaster.activeVouchers--;
        }
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Create a new PaymasterValidator
 */
export function createPaymasterValidator(config?: Partial<PaymasterConfig>): PaymasterValidator {
  return new PaymasterValidator(config);
}
