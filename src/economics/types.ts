/**
 * Economics Types - Fees, Gas, Balances
 */

export type Gas = bigint;
export type Balance = bigint;
export type Hex32 = `0x${string}`;

/**
 * Gas schedule - cost tables for operations
 */
export interface GasSchedule {
  /** Base cost for any transaction */
  base: Gas;
  /** Cost per byte of transaction */
  perByte: Gas;
  /** Per-operation costs */
  ops: {
    SYS_REG: Gas;
    SYS_INIT: { base: Gas; per32: Gas };
    SYS_UPDATE_PUT: { base: Gas; per32: Gas };
    SYS_UPDATE_MERGE: { base: Gas; per32: Gas };
    SYS_UPDATE_DELETE: Gas;
    SYS_VERIFY_ED25519: Gas;
    SYS_VERIFY_SECP256K1: Gas;
    SYS_SIGN_CHECK: Gas;
    SYS_TRANSFER: Gas;
  };
}

/**
 * Default gas schedule
 */
export const DEFAULT_GAS_SCHEDULE: GasSchedule = {
  base: 500n,
  perByte: 1n,
  ops: {
    SYS_REG: 800n,
    SYS_INIT: { base: 1200n, per32: 2n },
    SYS_UPDATE_PUT: { base: 300n, per32: 10n },
    SYS_UPDATE_MERGE: { base: 450n, per32: 12n },
    SYS_UPDATE_DELETE: 200n,
    SYS_VERIFY_ED25519: 800n,
    SYS_VERIFY_SECP256K1: 1200n,
    SYS_SIGN_CHECK: 200n,
    SYS_TRANSFER: 300n,
  },
};

/**
 * Fee split configuration
 */
export interface FeeSplit {
  /** Fraction to miner (0-1) */
  miner: number;
  /** Fraction to attestors (0-1) */
  attestor: number;
  /** Fraction to storage fund (0-1) */
  storage: number;
}

/**
 * Fee configuration
 */
export interface FeeConfig {
  /** Enable fees */
  enabled: boolean;
  /** Minimum gas price */
  minGasPrice: bigint;
  /** Fee split ratios */
  split: FeeSplit;
  /** Allow sponsorship (paymaster) */
  allowSponsorship: boolean;
}

/**
 * Default fee config
 */
export const DEFAULT_FEE_CONFIG: FeeConfig = {
  enabled: true,
  minGasPrice: 1n,
  split: { miner: 0.6, attestor: 0.3, storage: 0.1 },
  allowSponsorship: false,
};

/**
 * Fee result after execution
 */
export interface FeeResult {
  /** Gas used */
  gasUsed: Gas;
  /** Fee paid */
  feePaid: Balance;
  /** Credits distributed */
  credits: {
    miner: Balance;
    attestor: Balance;
    storage: Balance;
  };
}

/**
 * Rent configuration
 */
export interface RentConfig {
  /** Enable rent collection */
  enabled: boolean;
  /** Collect rent every N blocks */
  collectEvery: number;
  /** Default rent per block per KB */
  defaultPerBlock: bigint;
}

/**
 * Default rent config
 */
export const DEFAULT_RENT_CONFIG: RentConfig = {
  enabled: false,
  collectEvery: 100,
  defaultPerBlock: 1n,
};

/**
 * Rent record
 */
export interface RentRecord {
  /** State ID */
  stateId: Hex32;
  /** Payer address */
  payer: string;
  /** Rent per block */
  perBlock: bigint;
  /** Is active */
  active: boolean;
  /** Created at height */
  createdAt: bigint;
  /** Last paid height */
  lastPaidHeight: bigint;
}

/**
 * Economics stats
 */
export interface EconomicsStats {
  /** Total fees collected */
  totalFeesCollected: Balance;
  /** Total gas consumed */
  totalGasConsumed: Gas;
  /** Total rent collected */
  totalRentCollected: Balance;
  /** Total transfers */
  totalTransfers: number;
  /** Current fee config */
  feeConfig: FeeConfig;
}
