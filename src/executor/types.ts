import { InstructionRecord } from '../instructions/abi';

/**
 * State identifier (32 bytes)
 */
export type StateId = string; // hex string of 32 bytes

/**
 * Version identifier (32 bytes hash)
 */
export type Version = string; // hex string of 32 bytes

/**
 * State write operation
 */
export interface StateWrite {
  stateId: StateId;
  key: string;              // hex string
  value: Buffer | null;     // null = delete
  newVersion: Version;      // new version after write
}

/**
 * Execution log entry
 */
export interface ExecLog {
  level: 'info' | 'warning' | 'error';
  message: string;
  data?: any;
}

/**
 * Execution effects (output of executor)
 */
export interface ExecutionEffects {
  writes: StateWrite[];
  logs: ExecLog[];
  success: boolean;
  error?: string;
}

/**
 * State read for concurrency control
 */
export interface StateRead {
  stateId: StateId;
  expectedVersion: Version;
}

/**
 * State lock for write exclusivity
 */
export interface StateLock {
  stateId: StateId;
}

/**
 * Execution context (input to executor)
 */
export interface ExecutionContext {
  txFrom: string;                           // Transaction sender address
  program: Buffer;                          // Binary program bytes
  reads: StateRead[];                       // Declared reads with expected versions
  locks: StateLock[];                       // Declared locks
  getState: (stateId: StateId) => Promise<StateData | undefined>;
  currentBlockHeight?: bigint;              // Optional block context
}

/**
 * State data structure
 */
export interface StateData {
  stateId: StateId;
  version: Version;                         // Current version hash
  type: string;                             // State type (e.g., 'account', 'storage')
  owner: string;                            // Owner address
  writer?: string;                          // Optional writer (if different from owner)
  data: Map<string, Buffer>;                // Key-value data
  metadata?: any;                           // Additional metadata
}

/**
 * Module handler function signature
 */
export type ModuleHandler = (
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
) => Promise<void>;

/**
 * Module registry entry
 */
export interface ModuleRegistration {
  creatorPkHash: Buffer;
  moduleId: Buffer;
  selector: number;
  handler: ModuleHandler;
}
