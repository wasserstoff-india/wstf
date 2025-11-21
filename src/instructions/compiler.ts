import { InstructionRecord } from './abi';
import {
  SYS_CREATOR_PKHASH,
  SYS_MODULE_ID,
  SYS_SELECTORS,
  SysOpcode,
  computeModuleId,
  computeSelector,
  IR_FLAGS
} from './opcodes';
import { decodeAddress } from '../crypto/address';

/**
 * JSON DSL format for instructions
 */
export interface InstructionDSL {
  creator: 'sys' | string;        // 'sys' or address (gc...)
  moduleId: string;                // Module name/identifier
  method: string;                  // Method name (SYS opcode or custom)
  flags?: string[];                // ['readOnly', 'lockWrites', 'policyOnly']
  args: any;                       // Method-specific arguments
}

/**
 * Compile JSON DSL to binary Instruction Record
 */
export function compileInstruction(dsl: InstructionDSL): InstructionRecord {
  // Parse creator
  let creatorPkHash20: Buffer;
  if (dsl.creator === 'sys') {
    creatorPkHash20 = SYS_CREATOR_PKHASH;
  } else {
    const decoded = decodeAddress(dsl.creator);
    creatorPkHash20 = decoded.pkHash;
  }

  // Compute moduleId
  let moduleId16: Buffer;
  if (dsl.creator === 'sys') {
    moduleId16 = SYS_MODULE_ID;
  } else {
    moduleId16 = computeModuleId(dsl.moduleId);
  }

  // Compute selector
  let selector4: number;
  if (dsl.creator === 'sys' && dsl.method in SYS_SELECTORS) {
    selector4 = SYS_SELECTORS[dsl.method as SysOpcode];
  } else {
    selector4 = computeSelector(dsl.moduleId, dsl.method);
  }

  // Parse flags
  let flags = 0;
  if (dsl.flags) {
    if (dsl.flags.includes('readOnly')) flags |= IR_FLAGS.READ_ONLY;
    if (dsl.flags.includes('lockWrites')) flags |= IR_FLAGS.LOCK_WRITES;
    if (dsl.flags.includes('policyOnly')) flags |= IR_FLAGS.POLICY_ONLY;
  }

  return {
    ver: 0x01,
    flags,
    creatorPkHash20,
    moduleId16,
    selector4,
    args: dsl.args,
  };
}

/**
 * Compile a program (array of DSL instructions) to IR list
 */
export function compileProgram(dsls: InstructionDSL[]): InstructionRecord[] {
  return dsls.map(compileInstruction);
}
