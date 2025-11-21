/**
 * Paymaster Types - Intrinsic Sponsorship System
 */

import { Gas, Balance } from '../economics/types';

// Re-export core types from RPC
export {
  Voucher,
  CreateVoucherParams,
  PaymasterValidation,
  PaymasterConfig,
  PaymasterInfo,
  PaymasterPolicy,
  DEFAULT_PAYMASTER_CONFIG,
} from '../rpc/types';

/**
 * Paymaster registration params
 */
export interface RegisterPaymasterParams {
  /** Paymaster address */
  address: string;
  /** Initial deposit */
  deposit: Balance;
  /** Policies */
  policies?: PaymasterPolicyInput[];
}

/**
 * Policy input for registration
 */
export interface PaymasterPolicyInput {
  /** Max gas per transaction */
  maxGasPerTx: Gas;
  /** Max total gas across all vouchers */
  maxTotalGas: Gas;
  /** Whitelist of allowed senders (empty = all) */
  allowedSenders?: string[];
  /** Whitelist of allowed contracts (empty = all) */
  allowedContracts?: string[];
  /** Expiration height */
  expiresAt?: bigint;
}

/**
 * Voucher usage record
 */
export interface VoucherUsage {
  voucherId: string;
  txHash: string;
  gasUsed: Gas;
  timestamp: bigint;
}

/**
 * Paymaster balance update
 */
export interface BalanceUpdate {
  address: string;
  delta: Balance;
  reason: 'deposit' | 'withdraw' | 'sponsor' | 'refund';
  txHash?: string;
}

/**
 * Sponsorship result
 */
export interface SponsorshipResult {
  sponsored: boolean;
  paymaster?: string;
  voucherId?: string;
  gasSponsored?: Gas;
  error?: string;
}

/**
 * Paymaster stats
 */
export interface PaymasterStats {
  totalPaymasters: number;
  totalVouchers: number;
  activeVouchers: number;
  totalSponsored: Balance;
  totalDeposited: Balance;
}
