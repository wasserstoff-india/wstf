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
  // Event & Instruction Runner selectors (M6)
  EVENT: 0x00000008,       // Emit event log
  CALL_LOCAL: 0x00000009,  // Request local program execution
  CALL_RESULT: 0x0000000a, // Log result of local execution
  // Program Registry selectors (M7)
  PROG_REGISTER: 0x0000000b,     // Register a new program
  PROG_UPDATE: 0x0000000c,       // Update program metadata/policy
  PROG_QUERY: 0x0000000d,        // Query program registration
  PROG_CHECK_ACCESS: 0x0000000e, // Check caller access
  PROG_RECORD_CALL: 0x0000000f,  // Record program call stats

  // Org/RBAC selectors (M8)
  ORG_CREATE: 0x00000010,        // Create organization
  ORG_UPDATE: 0x00000011,        // Update organization
  ORG_ROLE_CREATE: 0x00000012,   // Create role in org
  ORG_ROLE_UPDATE: 0x00000013,   // Update role
  ORG_UNIT_CREATE: 0x00000014,   // Create org unit
  ORG_UNIT_UPDATE: 0x00000015,   // Update org unit
  ORG_MEMBER_ADD: 0x00000016,    // Add member to org
  ORG_MEMBER_UPDATE: 0x00000017, // Update member roles
  ORG_MEMBER_REMOVE: 0x00000018, // Remove member from org
  ORG_CHECK_PERM: 0x00000019,    // Check permission

  // Approval selectors (M8)
  APPROVAL_POLICY_CREATE: 0x0000001a, // Create approval policy
  APPROVAL_POLICY_UPDATE: 0x0000001b, // Update approval policy
  APPROVAL_REQUEST: 0x0000001c,       // Create approval request
  APPROVAL_SIGN: 0x0000001d,          // Sign approval
  APPROVAL_REJECT: 0x0000001e,        // Reject approval
  APPROVAL_CANCEL: 0x0000001f,        // Cancel approval
  APPROVAL_EXECUTE: 0x00000020,       // Execute approved action

  // Token selectors (Token Standards)
  TOK_DEPLOY: 0x00000030,        // Deploy new token (FT/NFT/SFT)
  TOK_MINT: 0x00000031,          // Mint tokens
  TOK_BURN: 0x00000032,          // Burn tokens
  TOK_TRANSFER: 0x00000033,      // Transfer tokens
  TOK_APPROVE: 0x00000034,       // Set allowance/approval
  TOK_TRANSFER_FROM: 0x00000035, // Transfer with allowance
  TOK_PAUSE: 0x00000036,         // Pause token
  TOK_UNPAUSE: 0x00000037,       // Unpause token
  TOK_GET: 0x00000038,           // Get token info (read-only)
  TOK_BALANCE: 0x00000039,       // Get balance (read-only)
  TOK_ALLOWANCE: 0x0000003a,     // Get allowance (read-only)

  // NFT-specific selectors
  NFT_CREATE_CLASS: 0x00000040,     // Create NFT class (for SFT)
  NFT_SET_APPROVAL_ALL: 0x00000041, // Set operator approval

  // Variable Store selectors
  VAR_GET: 0x00000050,           // Get variable
  VAR_SET: 0x00000051,           // Set variable
  VAR_DELETE: 0x00000052,        // Delete variable
  VAR_LIST: 0x00000053,          // List variables
  VAR_NS_CREATE: 0x00000054,     // Create namespace
  VAR_NS_GRANT: 0x00000055,      // Grant namespace permission
  VAR_NS_REVOKE: 0x00000056,     // Revoke namespace permission
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
