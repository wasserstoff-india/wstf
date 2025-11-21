/**
 * Fee Service - Fee validation, charging, and distribution
 */
import { EventEmitter } from 'events';
import {
  Gas,
  Balance,
  FeeConfig,
  DEFAULT_FEE_CONFIG,
  FeeResult,
  FeeSplit,
} from './types';
import { BalanceView } from './balances';
import { estimateGas, GasInput } from './meter';

/**
 * Fee charge request
 */
export interface FeeChargeRequest {
  /** Fee payer address */
  feePayer: string;
  /** Transaction sender (from) */
  from: string;
  /** Max gas willing to spend */
  maxGas: Gas;
  /** Gas price per unit */
  gasPrice: bigint;
  /** Paymaster address (optional, for sponsorship) */
  paymaster?: string;
  /** Gas estimation input */
  gasInput: GasInput;
}

/**
 * Fee service
 */
export class FeeService extends EventEmitter {
  private config: FeeConfig;
  private balances: BalanceView;

  // Stats
  private totalFeesCollected: Balance = 0n;
  private totalGasConsumed: Gas = 0n;
  private insufficientFundsCount = 0;
  private oogCount = 0;

  constructor(balances: BalanceView, config: Partial<FeeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_FEE_CONFIG, ...config };
    this.balances = balances;
  }

  /**
   * Validate fee parameters
   */
  validateFees(request: FeeChargeRequest): { ok: boolean; code?: string } {
    // Check if fees enabled
    if (!this.config.enabled) {
      return { ok: false, code: 'FEES_DISABLED' };
    }

    // Check gas price
    if (request.gasPrice < this.config.minGasPrice) {
      return { ok: false, code: 'GAS_PRICE_TOO_LOW' };
    }

    // Check sponsorship
    if (request.feePayer !== request.from && !this.config.allowSponsorship) {
      return { ok: false, code: 'SPONSOR_NOT_ALLOWED' };
    }

    // Estimate gas needed
    const gasNeeded = estimateGas(request.gasInput);

    // Check max gas
    if (request.maxGas < gasNeeded) {
      return { ok: false, code: 'INSUFFICIENT_MAX_GAS' };
    }

    return { ok: true };
  }

  /**
   * Charge fees and distribute
   */
  async chargeAndDistribute(
    request: FeeChargeRequest,
    minerAddress: string
  ): Promise<FeeResult> {
    // Validate first
    const validation = this.validateFees(request);
    if (!validation.ok) {
      throw new Error(validation.code);
    }

    // Calculate gas and fee
    const gasUsed = estimateGas(request.gasInput);
    const feeToPay = gasUsed * request.gasPrice;

    // Check and debit
    const debitOk = await this.balances.debit(request.feePayer, feeToPay);
    if (!debitOk) {
      this.insufficientFundsCount++;
      throw new Error('INSUFFICIENT_FUNDS');
    }

    // Calculate split
    const credits = this.calculateSplit(feeToPay, this.config.split);

    // Credit miner
    await this.balances.credit(minerAddress, credits.miner);

    // TODO: Credit attestor and storage pools when those services exist
    // For now, these go to a burn address or stay uncredited

    // Update stats
    this.totalFeesCollected += feeToPay;
    this.totalGasConsumed += gasUsed;

    const result: FeeResult = {
      gasUsed,
      feePaid: feeToPay,
      credits,
    };

    this.emit('fee:charged', result);

    return result;
  }

  /**
   * Quote fee for gas input
   */
  async quoteFee(gasInput: GasInput, gasPrice?: bigint): Promise<{
    gasEstimate: Gas;
    minFee: Balance;
    suggestedGasPrice: bigint;
  }> {
    const gasEstimate = estimateGas(gasInput);
    const effectivePrice = gasPrice ?? this.config.minGasPrice;
    const minFee = gasEstimate * effectivePrice;

    return {
      gasEstimate,
      minFee,
      suggestedGasPrice: effectivePrice,
    };
  }

  /**
   * Calculate fee split
   */
  private calculateSplit(totalFee: Balance, split: FeeSplit): {
    miner: Balance;
    attestor: Balance;
    storage: Balance;
  } {
    // Use integer math to avoid rounding issues
    const minerFrac = BigInt(Math.floor(split.miner * 1000));
    const attestorFrac = BigInt(Math.floor(split.attestor * 1000));

    const miner = (totalFee * minerFrac) / 1000n;
    const attestor = (totalFee * attestorFrac) / 1000n;
    const storage = totalFee - miner - attestor;

    return { miner, attestor, storage };
  }

  /**
   * Get minimum gas price
   */
  getMinGasPrice(): bigint {
    return this.config.minGasPrice;
  }

  /**
   * Get fee configuration
   */
  getConfig(): FeeConfig {
    return { ...this.config };
  }

  /**
   * Update fee configuration
   */
  updateConfig(newConfig: Partial<FeeConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalFeesCollected: Balance;
    totalGasConsumed: Gas;
    insufficientFundsCount: number;
    oogCount: number;
  } {
    return {
      totalFeesCollected: this.totalFeesCollected,
      totalGasConsumed: this.totalGasConsumed,
      insufficientFundsCount: this.insufficientFundsCount,
      oogCount: this.oogCount,
    };
  }

  /**
   * Record out-of-gas error
   */
  recordOOG(): void {
    this.oogCount++;
    this.emit('oog', {});
  }
}
