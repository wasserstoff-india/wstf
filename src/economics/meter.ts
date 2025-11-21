/**
 * Gas Meter - Deterministic gas estimation
 */
import { Gas, GasSchedule, DEFAULT_GAS_SCHEDULE } from './types';

/**
 * Instruction representation for gas estimation
 */
export interface GasInstruction {
  /** Instruction selector (e.g., "SYS.REG", "SYS.UPDATE") */
  selector: string;
  /** Instruction arguments */
  args?: {
    /** Data size in bytes */
    dataSize?: number;
    /** Patch operation */
    patch?: {
      op: 'put' | 'merge' | 'delete';
      totalBytes: number;
    };
    /** Algorithm for verify */
    algo?: 'ed25519' | 'secp256k1';
  };
}

/**
 * Gas estimation input
 */
export interface GasInput {
  /** Program hex */
  programHex?: string;
  /** Parsed instructions (if available) */
  instructions?: GasInstruction[];
}

/**
 * Ceiling division for bigint
 */
function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/**
 * Cost of a single instruction
 */
export function costOfInstruction(ins: GasInstruction, schedule: GasSchedule): Gas {
  switch (ins.selector) {
    case 'SYS.REG':
      return schedule.ops.SYS_REG;

    case 'SYS.INIT': {
      const size = BigInt(ins.args?.dataSize ?? 0);
      return schedule.ops.SYS_INIT.base + schedule.ops.SYS_INIT.per32 * ceilDiv(size, 32n);
    }

    case 'SYS.UPDATE': {
      const patch = ins.args?.patch;
      if (!patch) return schedule.ops.SYS_UPDATE_PUT.base;

      if (patch.op === 'delete') {
        return schedule.ops.SYS_UPDATE_DELETE;
      }

      const totalBytes = BigInt(patch.totalBytes);
      const costs = patch.op === 'merge'
        ? schedule.ops.SYS_UPDATE_MERGE
        : schedule.ops.SYS_UPDATE_PUT;

      return costs.base + costs.per32 * ceilDiv(totalBytes, 32n);
    }

    case 'SYS.VERIFY': {
      const algo = ins.args?.algo ?? 'ed25519';
      return algo === 'secp256k1'
        ? schedule.ops.SYS_VERIFY_SECP256K1
        : schedule.ops.SYS_VERIFY_ED25519;
    }

    case 'SYS.SIGN':
      return schedule.ops.SYS_SIGN_CHECK;

    case 'SYS.TRANSFER':
      return schedule.ops.SYS_TRANSFER;

    default:
      // Unknown instruction - charge base
      return schedule.base;
  }
}

/**
 * Estimate total gas for a program
 */
export function estimateGas(input: GasInput, schedule: GasSchedule = DEFAULT_GAS_SCHEDULE): Gas {
  let gas: Gas = schedule.base;

  // Add per-byte cost if program hex is provided
  if (input.programHex) {
    const bytes = BigInt(Buffer.from(input.programHex.replace(/^0x/, ''), 'hex').length);
    gas += schedule.perByte * bytes;
  }

  // Add instruction costs
  if (input.instructions) {
    for (const ins of input.instructions) {
      gas += costOfInstruction(ins, schedule);
    }
  }

  return gas;
}

/**
 * Get minimum fee for gas amount at given price
 */
export function minFee(gas: Gas, gasPrice: bigint): bigint {
  return gas * gasPrice;
}

/**
 * Check if gas limit is sufficient
 */
export function checkGasLimit(estimatedGas: Gas, maxGas: Gas): boolean {
  return maxGas >= estimatedGas;
}

/**
 * Gas meter class for tracking during execution
 */
export class GasMeter {
  private schedule: GasSchedule;
  private gasUsed: Gas = 0n;
  private gasLimit: Gas;

  constructor(gasLimit: Gas, schedule: GasSchedule = DEFAULT_GAS_SCHEDULE) {
    this.gasLimit = gasLimit;
    this.schedule = schedule;
  }

  /**
   * Charge gas for an instruction
   */
  charge(ins: GasInstruction): void {
    const cost = costOfInstruction(ins, this.schedule);
    this.gasUsed += cost;

    if (this.gasUsed > this.gasLimit) {
      throw new Error('OOG'); // Out of gas
    }
  }

  /**
   * Charge arbitrary gas amount
   */
  chargeRaw(amount: Gas): void {
    this.gasUsed += amount;

    if (this.gasUsed > this.gasLimit) {
      throw new Error('OOG');
    }
  }

  /**
   * Get gas used so far
   */
  getUsed(): Gas {
    return this.gasUsed;
  }

  /**
   * Get remaining gas
   */
  getRemaining(): Gas {
    return this.gasLimit - this.gasUsed;
  }

  /**
   * Get gas limit
   */
  getLimit(): Gas {
    return this.gasLimit;
  }

  /**
   * Check if out of gas
   */
  isOutOfGas(): boolean {
    return this.gasUsed > this.gasLimit;
  }
}
