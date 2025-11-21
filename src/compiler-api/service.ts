/**
 * Compiler API Service
 */
import crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  CompileRequest,
  CompileResult,
  SchemaDefinition,
  CompilerConfig,
  DEFAULT_COMPILER_CONFIG,
  CompilerStats,
  CachedProgram,
} from './types';
import { ProgramCache } from './cache';
import { getSchema, listSchemas, validateAgainstSchema } from './schemas';

/**
 * Mock DSL compiler - placeholder for real compiler
 * In production, this would parse DSL and generate IR
 */
function mockCompile(dsl: string): { programHex: string; instructionCount: number } {
  // Placeholder: hash the DSL to create deterministic "compiled" output
  const hash = crypto.createHash('sha256').update(dsl).digest('hex');

  // Count "instructions" by counting lines with actual content
  const lines = dsl.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
  const instructionCount = Math.max(1, lines.length);

  // Create mock program: tag + instruction count + hash
  const programHex = `0x01${instructionCount.toString(16).padStart(4, '0')}${hash}`;

  return { programHex, instructionCount };
}

/**
 * Estimate gas for compiled program
 */
function estimateGasFromProgram(programHex: string, instructionCount: number): bigint {
  const baseGas = 500n;
  const perInstruction = 200n;
  const perByte = 1n;
  const bytes = BigInt(Buffer.from(programHex.replace(/^0x/, ''), 'hex').length);

  return baseGas + perInstruction * BigInt(instructionCount) + perByte * bytes;
}

/**
 * Compiler API Service
 */
export class CompilerService extends EventEmitter {
  private config: CompilerConfig;
  private cache: ProgramCache;

  // Stats
  private totalCompilations = 0;
  private successfulCompilations = 0;
  private failedCompilations = 0;
  private totalCompileTimeMs = 0;

  constructor(config: Partial<CompilerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_COMPILER_CONFIG, ...config };
    this.cache = new ProgramCache(config);
  }

  /**
   * Compile DSL to program
   */
  compile(request: CompileRequest): CompileResult {
    const start = performance.now();
    this.totalCompilations++;

    try {
      // Check cache first
      if (this.config.cacheEnabled) {
        const cached = this.cache.getByDsl(request.dsl);
        if (cached) {
          const compileTimeMs = performance.now() - start;
          this.successfulCompilations++;
          this.totalCompileTimeMs += compileTimeMs;

          return {
            ok: true,
            programHex: cached.programHex,
            instructionsHash: cached.instructionsHash,
            estimatedGas: cached.estimatedGas,
            compileTimeMs,
          };
        }
      }

      // Validate DSL (basic checks)
      if (!request.dsl || request.dsl.trim().length === 0) {
        this.failedCompilations++;
        return { ok: false, error: 'EMPTY_DSL' };
      }

      // Compile
      const { programHex, instructionCount } = mockCompile(request.dsl);

      // Compute instructions hash
      const instructionsHash = crypto
        .createHash('sha256')
        .update(programHex)
        .digest('hex');

      // Estimate gas
      const estimatedGas = estimateGasFromProgram(programHex, instructionCount);

      // Cache the result
      if (this.config.cacheEnabled) {
        this.cache.set(request.dsl, programHex, instructionsHash, estimatedGas);
      }

      const compileTimeMs = performance.now() - start;
      this.successfulCompilations++;
      this.totalCompileTimeMs += compileTimeMs;

      this.emit('compile:success', { instructionsHash, compileTimeMs });

      return {
        ok: true,
        programHex,
        instructionsHash,
        instructionCount,
        estimatedGas,
        compileTimeMs,
      };
    } catch (e: any) {
      this.failedCompilations++;
      const compileTimeMs = performance.now() - start;
      this.totalCompileTimeMs += compileTimeMs;

      this.emit('compile:error', { error: e.message });

      return {
        ok: false,
        error: e.message || 'COMPILE_ERROR',
        compileTimeMs,
      };
    }
  }

  /**
   * Get schema by ID
   */
  getSchema(schemaId: string): SchemaDefinition | null {
    return getSchema(schemaId);
  }

  /**
   * List all schemas
   */
  listSchemas(): string[] {
    return listSchemas();
  }

  /**
   * Validate data against schema
   */
  validateSchema(schemaId: string, data: any): { valid: boolean; errors: string[] } {
    return validateAgainstSchema(schemaId, data);
  }

  /**
   * Get cached program by instructions hash
   */
  getProgram(instructionsHash: string): CachedProgram | null {
    return this.cache.getByHash(instructionsHash);
  }

  /**
   * Check if program is cached
   */
  hasProgram(instructionsHash: string): boolean {
    return this.cache.has(instructionsHash);
  }

  /**
   * Get service statistics
   */
  getStats(): CompilerStats {
    const cacheStats = this.cache.getStats();

    return {
      totalCompilations: this.totalCompilations,
      successfulCompilations: this.successfulCompilations,
      failedCompilations: this.failedCompilations,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      cacheSize: cacheStats.size,
      avgCompileTimeMs: this.totalCompilations > 0
        ? this.totalCompileTimeMs / this.totalCompilations
        : 0,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
