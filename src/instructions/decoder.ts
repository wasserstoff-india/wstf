import { InstructionRecord } from './abi';
import { InstructionDSL } from './compiler';
import {
  SYS_CREATOR_PKHASH,
  SYS_MODULE_ID,
  getSysOpcodeName,
  isSysSelector,
  IR_FLAGS
} from './opcodes';
import { deriveAddress } from '../crypto/address';
import { MappingAlgId, SigAlgId } from '../crypto/algorithms';

/**
 * Decode Instruction Record to human-readable JSON DSL
 */
export function decodeInstruction(ir: InstructionRecord): InstructionDSL {
  // Determine creator
  let creator: string;
  if (ir.creatorPkHash20.equals(SYS_CREATOR_PKHASH)) {
    creator = 'sys';
  } else {
    // Reconstruct address from pkHash (we don't have the full pubkey, so this is approximate)
    // In practice, you'd look this up from state or the creator would be explicit in tx
    creator = `<pkHash:${ir.creatorPkHash20.toString('hex')}>`;
  }

  // Determine moduleId
  let moduleId: string;
  if (ir.moduleId16.equals(SYS_MODULE_ID)) {
    moduleId = 'SYS';
  } else {
    moduleId = `<moduleId:${ir.moduleId16.toString('hex')}>`;
  }

  // Determine method
  let method: string;
  if (isSysSelector(ir.selector4)) {
    method = getSysOpcodeName(ir.selector4) || `<unknown:${ir.selector4.toString(16)}>`;
  } else {
    method = `<selector:${ir.selector4.toString(16)}>`;
  }

  // Parse flags
  const flags: string[] = [];
  if (ir.flags & IR_FLAGS.READ_ONLY) flags.push('readOnly');
  if (ir.flags & IR_FLAGS.LOCK_WRITES) flags.push('lockWrites');
  if (ir.flags & IR_FLAGS.POLICY_ONLY) flags.push('policyOnly');

  return {
    creator,
    moduleId,
    method,
    flags: flags.length > 0 ? flags : undefined,
    args: ir.args,
  };
}

/**
 * Decode a program (list of IRs) to human-readable DSL
 */
export function decodeProgram(irs: InstructionRecord[]): InstructionDSL[] {
  return irs.map(decodeInstruction);
}

/**
 * Pretty-print an instruction for debugging
 */
export function prettyPrintInstruction(ir: InstructionRecord): string {
  const dsl = decodeInstruction(ir);
  return JSON.stringify(dsl, null, 2);
}

/**
 * Pretty-print a program for debugging
 */
export function prettyPrintProgram(irs: InstructionRecord[]): string {
  const dsls = decodeProgram(irs);
  return JSON.stringify(dsls, null, 2);
}
