/**
 * Instruction Runner Policy Engine
 *
 * Checks if callers are allowed to execute programs based on:
 * - Trust tier
 * - Address allowlist
 * - Rate limits
 * - Payload size
 * - Concurrent execution limits
 */

import { ConfirmationTier } from '../../trust/types';
import {
  ProgramConfig,
  CallRequest,
  PolicyCheckResult,
  RunnerConfig,
  POLICY_CODES,
} from './types';

/**
 * Rate limit tracker
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Policy Engine for instruction runner
 */
export class PolicyEngine {
  private config: RunnerConfig;
  private programs: Map<string, ProgramConfig> = new Map();

  /** Rate limits: programId:address -> entry */
  private rateLimits: Map<string, RateLimitEntry> = new Map();

  /** Global rate limits: address -> entry */
  private globalRateLimits: Map<string, RateLimitEntry> = new Map();

  /** Current concurrent executions per program */
  private concurrentByProgram: Map<string, number> = new Map();

  /** Total current concurrent executions */
  private totalConcurrent = 0;

  constructor(config: RunnerConfig) {
    this.config = config;
    this.loadPrograms(config.programs);
  }

  /**
   * Load program configurations
   */
  private loadPrograms(programs: ProgramConfig[]): void {
    this.programs.clear();
    for (const prog of programs) {
      this.programs.set(prog.id, prog);
    }
  }

  /**
   * Get program config
   */
  getProgram(programId: string): ProgramConfig | undefined {
    return this.programs.get(programId);
  }

  /**
   * Check if a call request is allowed
   */
  checkPolicy(
    request: CallRequest,
    callerTrustTier: ConfirmationTier
  ): PolicyCheckResult {
    // 1. Check program exists
    const program = this.programs.get(request.programId);
    if (!program) {
      return {
        allowed: false,
        reason: `Program ${request.programId} not found`,
        code: POLICY_CODES.PROGRAM_NOT_FOUND,
      };
    }

    // 2. Check program is enabled
    if (!program.enabled) {
      return {
        allowed: false,
        reason: `Program ${request.programId} is disabled`,
        code: POLICY_CODES.PROGRAM_DISABLED,
      };
    }

    // 3. Check trust tier
    const requiredTier = program.allowedCallers.minTrustTier;
    if (!this.checkTrustTier(callerTrustTier, requiredTier)) {
      return {
        allowed: false,
        reason: `Trust tier ${callerTrustTier} < required ${requiredTier}`,
        code: POLICY_CODES.TRUST_TIER_TOO_LOW,
      };
    }

    // 4. Check address allowlist
    const policy = program.allowedCallers;
    if (policy.allowAddrs && policy.allowAddrs.length > 0) {
      if (!policy.allowAddrs.includes(request.caller)) {
        return {
          allowed: false,
          reason: `Address ${request.caller} not in allowlist`,
          code: POLICY_CODES.ADDRESS_NOT_ALLOWED,
        };
      }
    } else if (policy.allowAll === false) {
      return {
        allowed: false,
        reason: 'No addresses are allowed',
        code: POLICY_CODES.ADDRESS_NOT_ALLOWED,
      };
    }

    // 5. Check payload size
    const payloadBytes = request.payload ? (request.payload.length - 2) / 2 : 0;
    if (payloadBytes > program.limits.maxPayloadBytes) {
      return {
        allowed: false,
        reason: `Payload ${payloadBytes} > max ${program.limits.maxPayloadBytes}`,
        code: POLICY_CODES.PAYLOAD_TOO_LARGE,
      };
    }

    // 6. Check rate limits
    if (!this.checkRateLimit(request.programId, request.caller, program)) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        code: POLICY_CODES.RATE_LIMIT_EXCEEDED,
      };
    }

    // 7. Check global rate limit
    if (!this.checkGlobalRateLimit(request.caller)) {
      return {
        allowed: false,
        reason: 'Global rate limit exceeded',
        code: POLICY_CODES.RATE_LIMIT_EXCEEDED,
      };
    }

    // 8. Check concurrent execution limits
    const currentConcurrent = this.concurrentByProgram.get(request.programId) || 0;
    if (currentConcurrent >= program.limits.maxConcurrent) {
      return {
        allowed: false,
        reason: `Concurrent limit reached for ${request.programId}`,
        code: POLICY_CODES.CONCURRENT_LIMIT_EXCEEDED,
      };
    }

    // 9. Check total concurrent limit
    if (this.totalConcurrent >= this.config.maxTotalConcurrent) {
      return {
        allowed: false,
        reason: 'Global concurrent limit reached',
        code: POLICY_CODES.CONCURRENT_LIMIT_EXCEEDED,
      };
    }

    return { allowed: true };
  }

  /**
   * Compare trust tiers
   */
  private checkTrustTier(
    actual: ConfirmationTier,
    required: ConfirmationTier
  ): boolean {
    // PREFLIGHT < ADMITTED < INCLUDED < K_DEPTH < CROSS_CHAIN
    const tierOrder: ConfirmationTier[] = [
      ConfirmationTier.PREFLIGHT,
      ConfirmationTier.ADMITTED,
      ConfirmationTier.INCLUDED,
      ConfirmationTier.K_DEPTH,
      ConfirmationTier.CROSS_CHAIN,
    ];

    const actualIndex = tierOrder.indexOf(actual);
    const requiredIndex = tierOrder.indexOf(required);

    return actualIndex >= requiredIndex;
  }

  /**
   * Check per-program rate limit
   */
  private checkRateLimit(
    programId: string,
    caller: string,
    program: ProgramConfig
  ): boolean {
    const maxPerHour = program.allowedCallers.maxCallsPerHour;
    if (!maxPerHour) return true;

    const key = `${programId}:${caller}`;
    const now = Date.now();
    const hourAgo = now - 3600000;

    const entry = this.rateLimits.get(key);
    if (!entry || entry.windowStart < hourAgo) {
      // New window
      this.rateLimits.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= maxPerHour) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Check global rate limit
   */
  private checkGlobalRateLimit(caller: string): boolean {
    const maxPerHour = this.config.globalRateLimitPerHour;
    const now = Date.now();
    const hourAgo = now - 3600000;

    const entry = this.globalRateLimits.get(caller);
    if (!entry || entry.windowStart < hourAgo) {
      this.globalRateLimits.set(caller, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= maxPerHour) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Record execution start (for concurrent tracking)
   */
  recordExecutionStart(programId: string): void {
    const current = this.concurrentByProgram.get(programId) || 0;
    this.concurrentByProgram.set(programId, current + 1);
    this.totalConcurrent++;
  }

  /**
   * Record execution end
   */
  recordExecutionEnd(programId: string): void {
    const current = this.concurrentByProgram.get(programId) || 1;
    this.concurrentByProgram.set(programId, Math.max(0, current - 1));
    this.totalConcurrent = Math.max(0, this.totalConcurrent - 1);
  }

  /**
   * Get current concurrent count for program
   */
  getConcurrent(programId: string): number {
    return this.concurrentByProgram.get(programId) || 0;
  }

  /**
   * Get total concurrent count
   */
  getTotalConcurrent(): number {
    return this.totalConcurrent;
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimits(): void {
    const hourAgo = Date.now() - 3600000;

    for (const [key, entry] of this.rateLimits.entries()) {
      if (entry.windowStart < hourAgo) {
        this.rateLimits.delete(key);
      }
    }

    for (const [key, entry] of this.globalRateLimits.entries()) {
      if (entry.windowStart < hourAgo) {
        this.globalRateLimits.delete(key);
      }
    }
  }

  /**
   * Update config
   */
  updateConfig(config: RunnerConfig): void {
    this.config = config;
    this.loadPrograms(config.programs);
  }

  /**
   * Add or update a program
   */
  setProgram(program: ProgramConfig): void {
    this.programs.set(program.id, program);
  }

  /**
   * Remove a program
   */
  removeProgram(programId: string): void {
    this.programs.delete(programId);
  }

  /**
   * Get all programs
   */
  getAllPrograms(): ProgramConfig[] {
    return Array.from(this.programs.values());
  }
}
