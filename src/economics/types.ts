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
    /** Event emission gas costs */
    SYS_EVENT: { base: Gas; perTopic: Gas; perDataByte: Gas };
    /** Call local intent gas costs */
    SYS_CALL_LOCAL: { base: Gas; perPayloadByte: Gas };
    /** Call result logging gas costs */
    SYS_CALL_RESULT: { base: Gas; perPreviewByte: Gas };
    /** Token operation gas costs */
    TOK_DEPLOY: Gas;
    TOK_MINT: Gas;
    TOK_BURN: Gas;
    TOK_TRANSFER: Gas;
    TOK_APPROVE: Gas;
    TOK_TRANSFER_FROM: Gas;
    TOK_PAUSE: Gas;
    TOK_GET: Gas;
    NFT_CREATE_CLASS: Gas;
    NFT_SET_APPROVAL_ALL: Gas;
    /** Variable store gas costs */
    VAR_GET: Gas;
    VAR_SET: { base: Gas; perByte: Gas };
    VAR_DELETE: Gas;
    VAR_LIST: { base: Gas; perResult: Gas };
    VAR_NS_CREATE: Gas;
    VAR_NS_GRANT: Gas;
    VAR_NS_REVOKE: Gas;
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
    // Event & runner operations
    SYS_EVENT: { base: 375n, perTopic: 32n, perDataByte: 1n },
    SYS_CALL_LOCAL: { base: 500n, perPayloadByte: 2n },
    SYS_CALL_RESULT: { base: 400n, perPreviewByte: 1n },
    // Token operations
    TOK_DEPLOY: 50000n,
    TOK_MINT: 30000n,
    TOK_BURN: 25000n,
    TOK_TRANSFER: 20000n,
    TOK_APPROVE: 15000n,
    TOK_TRANSFER_FROM: 20000n,
    TOK_PAUSE: 10000n,
    TOK_GET: 5000n,
    NFT_CREATE_CLASS: 25000n,
    NFT_SET_APPROVAL_ALL: 15000n,
    // Variable store operations
    VAR_GET: 5000n,
    VAR_SET: { base: 10000n, perByte: 10n },
    VAR_DELETE: 8000n,
    VAR_LIST: { base: 5000n, perResult: 100n },
    VAR_NS_CREATE: 20000n,
    VAR_NS_GRANT: 15000n,
    VAR_NS_REVOKE: 10000n,
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
