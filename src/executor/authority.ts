import { InstructionRecord } from '../instructions/abi';
import { StateData, ExecutionContext } from './types';
import { IR_FLAGS } from '../instructions/opcodes';

/**
 * Check if the transaction sender has authority to execute an instruction
 */
export function checkAuthority(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  state?: StateData
): { authorized: boolean; reason?: string } {
  // Read-only operations are always allowed
  if (ir.flags & IR_FLAGS.READ_ONLY) {
    return { authorized: true };
  }

  // If state doesn't exist yet, only the tx sender can create it
  if (!state) {
    return { authorized: true }; // Will be validated in REG/INIT handlers
  }

  // Check ownership
  if (state.owner === ctx.txFrom) {
    return { authorized: true };
  }

  // Check writer permission (if set)
  if (state.writer && state.writer === ctx.txFrom) {
    return { authorized: true };
  }

  return {
    authorized: false,
    reason: `Unauthorized: ${ctx.txFrom} is not owner or writer of state ${state.stateId}`
  };
}

/**
 * Check version concurrency (optimistic locking)
 */
export function checkVersion(
  stateId: string,
  expectedVersion: string,
  actualVersion: string
): { valid: boolean; reason?: string } {
  if (expectedVersion === actualVersion) {
    return { valid: true };
  }

  // Special case: zero version means "must not exist"
  if (expectedVersion === '0'.repeat(64) && actualVersion !== '0'.repeat(64)) {
    return {
      valid: false,
      reason: `State ${stateId} already exists (expected new, got v${actualVersion.slice(0, 8)}...)`
    };
  }

  return {
    valid: false,
    reason: `Version mismatch for ${stateId}: expected ${expectedVersion.slice(0, 8)}..., got ${actualVersion.slice(0, 8)}...`
  };
}

/**
 * Check if a state is locked for writes in this transaction
 */
export function checkLock(
  stateId: string,
  ctx: ExecutionContext
): { locked: boolean } {
  const isLocked = ctx.locks.some(lock => lock.stateId === stateId);
  return { locked: isLocked };
}

/**
 * Validate that all declared reads match actual state versions
 */
export async function validateReads(
  ctx: ExecutionContext
): Promise<{ valid: boolean; reason?: string }> {
  for (const read of ctx.reads) {
    const state = await ctx.getState(read.stateId);
    const actualVersion = state?.version || '0'.repeat(64);

    const versionCheck = checkVersion(read.stateId, read.expectedVersion, actualVersion);
    if (!versionCheck.valid) {
      return { valid: false, reason: versionCheck.reason };
    }
  }
  return { valid: true };
}
