/**
 * Compiler API Types
 */
import crypto from 'crypto';

/**
 * Compile request
 */
export interface CompileRequest {
  /** DSL source code */
  dsl: string;
  /** Target version */
  targetVersion?: number;
  /** Optimize output */
  optimize?: boolean;
}

/**
 * Compile result
 */
export interface CompileResult {
  /** Success flag */
  ok: boolean;
  /** Compiled program hex */
  programHex?: string;
  /** Instructions hash */
  instructionsHash?: string;
  /** Number of instructions */
  instructionCount?: number;
  /** Estimated gas */
  estimatedGas?: bigint;
  /** Error message */
  error?: string;
  /** Compilation time in ms */
  compileTimeMs?: number;
}

/**
 * Schema definition
 */
export interface SchemaDefinition {
  /** Schema ID (e.g., "SYS.UPDATE@v1") */
  id: string;
  /** Schema version */
  version: number;
  /** CBOR tag (if applicable) */
  cborTag?: number;
  /** Field definitions */
  fields: SchemaField[];
  /** Description */
  description?: string;
}

/**
 * Schema field
 */
export interface SchemaField {
  /** Field name */
  name: string;
  /** Field type */
  type: 'bytes' | 'string' | 'u64' | 'i64' | 'bool' | 'array' | 'map' | 'struct';
  /** Required flag */
  required: boolean;
  /** Nested schema (for struct/array) */
  nested?: SchemaField[];
  /** Description */
  description?: string;
}

/**
 * Cached program entry
 */
export interface CachedProgram {
  /** Instructions hash */
  instructionsHash: string;
  /** Program bytes */
  programHex: string;
  /** DSL source hash */
  dslHash: string;
  /** Created at */
  createdAt: number;
  /** Hit count */
  hits: number;
  /** Estimated gas */
  estimatedGas: bigint;
}

/**
 * Compiler API configuration
 */
export interface CompilerConfig {
  /** Enable compiler API */
  enabled: boolean;
  /** Enable program cache */
  cacheEnabled: boolean;
  /** Max cache entries */
  cacheMax: number;
  /** Cache TTL in ms */
  cacheTtlMs: number;
}

/**
 * Default compiler config
 */
export const DEFAULT_COMPILER_CONFIG: CompilerConfig = {
  enabled: true,
  cacheEnabled: true,
  cacheMax: 10_000,
  cacheTtlMs: 3600_000, // 1 hour
};

/**
 * Compiler stats
 */
export interface CompilerStats {
  /** Total compilations */
  totalCompilations: number;
  /** Successful compilations */
  successfulCompilations: number;
  /** Failed compilations */
  failedCompilations: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Cache size */
  cacheSize: number;
  /** Average compile time ms */
  avgCompileTimeMs: number;
}

/**
 * Compute DSL hash
 */
export function dslHash(dsl: string): string {
  return crypto.createHash('sha256').update(dsl).digest('hex');
}
