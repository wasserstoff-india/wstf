/**
 * Core Instruction Types
 *
 * Fundamental types for WSTFChain instruction execution.
 */

/**
 * Base instruction structure
 */
export interface Instruction {
  /** Instruction opcode */
  opcode: number;

  /** Instruction data (opcode-specific) */
  data: any;

  /** Address that submitted the instruction */
  sender: string;

  /** Timestamp when instruction was created */
  timestamp: number;

  /** Optional nonce for replay protection */
  nonce?: bigint;

  /** Optional signature */
  signature?: string;
}

/**
 * Instruction execution context
 */
export interface InstructionContext {
  /** Current sender address */
  sender: string;

  /** Current block height */
  blockHeight?: bigint;

  /** Current timestamp */
  timestamp: number;

  /** Available gas for execution */
  gasLimit?: bigint;

  /** Chain configuration */
  chainConfig?: any;
}

/**
 * Instruction execution result
 */
export interface InstructionResult {
  /** Whether execution was successful */
  success: boolean;

  /** Error message if execution failed */
  error?: string;

  /** Events emitted during execution */
  events?: Event[];

  /** Result data (instruction-specific) */
  result?: any;

  /** Gas consumed during execution */
  gasUsed?: bigint;
}

/**
 * Event emitted by instruction execution
 */
export interface Event {
  /** Module that emitted the event */
  module: string;

  /** Event key/type */
  key: string;

  /** Indexed topics for filtering */
  topics: string[];

  /** Event data */
  data: any;

  /** Block height when event was emitted */
  blockHeight?: bigint;

  /** Transaction hash that caused this event */
  txHash?: string;
}

/**
 * Instruction opcode categories
 */
export enum OpcodeCategory {
  // Core system opcodes (0x00-0x0F)
  SYSTEM = 0x00,

  // Account management (0x10-0x1F)
  ACCOUNT = 0x10,

  // Token operations (0x20-0x2F)
  TOKEN = 0x20,

  // Market operations (0x30-0x3F)
  MARKET = 0x30,

  // Variable storage (0x40-0x4F)
  VARIABLE = 0x40,

  // Cross-chain bridge (0x50-0x5F)
  XCHAIN = 0x50,

  // Access control (0x60-0x6F)
  ACCESS = 0x60,

  // Custom/Plugin (0x70-0xFF)
  CUSTOM = 0x70
}

/**
 * System opcodes
 */
export enum SystemOpcode {
  NOP = 0x00,              // No operation
  GENESIS = 0x01,          // Genesis block initialization
  VALIDATOR_UPDATE = 0x02, // Update validator set
  PARAM_UPDATE = 0x03,     // Update chain parameters
  UPGRADE = 0x04           // Protocol upgrade
}

/**
 * Instruction validation error
 */
export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  value?: any;
}

/**
 * Gas costs for different operations
 */
export const GAS_COSTS = {
  // Base costs
  BASE_INSTRUCTION: 10000n,
  SIGNATURE_VERIFY: 3000n,
  STATE_READ: 2000n,
  STATE_WRITE: 5000n,
  STATE_DELETE: 3000n,
  EVENT_EMIT: 1000n,

  // Cross-chain operations
  BRIDGE_REQUEST: 300000n,
  BRIDGE_REGISTER: 500000n,
  BRIDGE_RESULT: 200000n,

  // Access control operations
  AUTH_CREATE_RESOURCE: 100000n,
  AUTH_GRANT_ACCESS: 50000n,
  AUTH_REVOKE_ACCESS: 30000n,

  // Per-byte costs
  DATA_BYTE: 10n,
  TOPIC_BYTE: 5n
} as const;

/**
 * Instruction execution mode
 */
export enum ExecutionMode {
  /** Normal execution with state changes */
  EXECUTE = 'execute',

  /** Simulation without state changes */
  SIMULATE = 'simulate',

  /** Validation only */
  VALIDATE = 'validate',

  /** Estimate gas usage */
  ESTIMATE = 'estimate'
}

/**
 * Instruction batch execution options
 */
export interface BatchOptions {
  /** Stop on first error */
  failFast?: boolean;

  /** Maximum gas for entire batch */
  maxGas?: bigint;

  /** Execution mode */
  mode?: ExecutionMode;
}

/**
 * Instruction decoder interface
 */
export interface InstructionDecoder {
  /** Decode instruction from binary format */
  decode(data: Uint8Array): Instruction;

  /** Encode instruction to binary format */
  encode(instruction: Instruction): Uint8Array;

  /** Get instruction size in bytes */
  getSize(instruction: Instruction): number;
}

/**
 * Instruction handler interface
 */
export interface InstructionHandler {
  /** Opcodes this handler supports */
  supportedOpcodes: number[];

  /** Execute instruction */
  execute(instruction: Instruction, context: InstructionContext): Promise<InstructionResult>;

  /** Validate instruction */
  validate(instruction: Instruction, context: InstructionContext): Promise<ValidationError[]>;

  /** Estimate gas usage */
  estimateGas(instruction: Instruction, context: InstructionContext): Promise<bigint>;
}

/**
 * State key prefixes for different modules
 */
export const STATE_PREFIXES = {
  ACCOUNTS: 'accounts:',
  TOKENS: 'tokens:',
  MARKETS: 'markets:',
  VARIABLES: 'vars:',
  BRIDGE_ROUTES: 'bridge_routes:',
  BRIDGE_REQUESTS: 'bridge_requests:',
  AUTH_RESOURCES: 'auth_resources:',
  AUTH_PERMISSIONS: 'auth_permissions:'
} as const;

/**
 * Helper function to create state key
 */
export function createStateKey(prefix: string, id: string): string {
  return `${prefix}${id}`;
}

/**
 * Helper function to parse state key
 */
export function parseStateKey(key: string): { prefix: string; id: string } {
  const separatorIndex = key.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error(`Invalid state key format: ${key}`);
  }

  return {
    prefix: key.substring(0, separatorIndex + 1),
    id: key.substring(separatorIndex + 1)
  };
}