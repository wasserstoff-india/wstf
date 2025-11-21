import crypto from 'crypto';

/**
 * System module constants
 * Reserved "SYS" module uses all zeros for creator and a fixed moduleId
 */
export const SYS_CREATOR_PKHASH = Buffer.alloc(20, 0); // 20 bytes of zeros
export const SYS_MODULE_NAME = 'SYS';
export const SYS_MODULE_ID = crypto.createHash('sha256')
  .update(SYS_MODULE_NAME)
  .digest()
  .slice(0, 16);

/**
 * Reserved SYS selectors (4 bytes each)
 */
export const SYS_SELECTORS = {
  REG: 0x00000001,
  INIT: 0x00000002,
  RENT: 0x00000003,
  UPDATE: 0x00000004,
  SIGN: 0x00000005,
  VERIFY: 0x00000006,
  XVAL: 0x00000007,
} as const;

export type SysOpcode = keyof typeof SYS_SELECTORS;

/**
 * Instruction flags (bit flags in flags byte)
 */
export const IR_FLAGS = {
  READ_ONLY: 0x01,      // bit 0: readOnly
  LOCK_WRITES: 0x02,    // bit 1: lockWrites
  POLICY_ONLY: 0x04,    // bit 2: policyOnly
} as const;

/**
 * Compute selector for third-party modules
 * selector4 = sha256(namespace + "." + method).slice(0, 4)
 */
export function computeSelector(namespace: string, method: string): number {
  const hash = crypto.createHash('sha256')
    .update(`${namespace}.${method}`)
    .digest();
  return hash.readUInt32BE(0);
}

/**
 * Compute moduleId from module name
 * moduleId16 = sha256(moduleName).slice(0, 16)
 */
export function computeModuleId(moduleName: string): Buffer {
  return crypto.createHash('sha256')
    .update(moduleName)
    .digest()
    .slice(0, 16);
}

/**
 * Helper to check if a selector is a SYS opcode
 */
export function isSysSelector(selector: number): boolean {
  return Object.values(SYS_SELECTORS).includes(selector as any);
}

/**
 * Get SYS opcode name from selector
 */
export function getSysOpcodeName(selector: number): SysOpcode | null {
  for (const [name, value] of Object.entries(SYS_SELECTORS)) {
    if (value === selector) {
      return name as SysOpcode;
    }
  }
  return null;
}
