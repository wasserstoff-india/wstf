/**
 * Instruction Runner Service
 *
 * Main service that:
 * - Subscribes to CALL_LOCAL_REQUEST events
 * - Checks caller policies
 * - Executes programs (local/http)
 * - Optionally submits CALL_RESULT transactions
 */

import crypto from 'crypto';
import {
  RunnerConfig,
  ProgramConfig,
  CallRequest,
  ExecutionResult,
  TrackedExecution,
  RunnerStats,
  ProgramStats,
  DEFAULT_RUNNER_CONFIG,
} from './types';
import { PolicyEngine } from './policy';
import { executeLocal } from './local';
import { executeHttp } from './http';
import { EventLogStore, EventLog, EVENT_KEY_CALL_LOCAL_REQUEST } from '../../events/logs';
import { ConfirmationTier } from '../../trust/types';

/**
 * Trust service interface (for getting caller trust tier)
 */
export interface TrustService {
  getTrustTier(address: string): Promise<ConfirmationTier>;
}

/**
 * Transaction submitter interface (for submitting result txs)
 */
export interface TxSubmitter {
  submitCallResult(result: ExecutionResult): Promise<string>;
}

/**
 * Instruction Runner Service
 */
export class InstructionRunnerService {
  private config: RunnerConfig;
  private policy: PolicyEngine;
  private eventStore: EventLogStore;
  private trustService: TrustService;
  private txSubmitter?: TxSubmitter;

  /** Tracked executions by callId */
  private executions: Map<string, TrackedExecution> = new Map();

  /** Processed call IDs (to avoid double processing) */
  private processedCallIds: Set<string> = new Set();

  /** Stats per program */
  private stats: Map<string, ProgramStats> = new Map();

  /** Running flag */
  private running = false;

  /** Poll interval handle */
  private pollInterval?: ReturnType<typeof setInterval>;

  constructor(
    eventStore: EventLogStore,
    trustService: TrustService,
    config: Partial<RunnerConfig> = {},
    txSubmitter?: TxSubmitter
  ) {
    this.config = { ...DEFAULT_RUNNER_CONFIG, ...config };
    this.policy = new PolicyEngine(this.config);
    this.eventStore = eventStore;
    this.trustService = trustService;
    this.txSubmitter = txSubmitter;

    // Initialize stats for configured programs
    for (const prog of this.config.programs) {
      this.initProgramStats(prog.id);
    }
  }

  /**
   * Initialize stats for a program
   */
  private initProgramStats(programId: string): void {
    if (!this.stats.has(programId)) {
      this.stats.set(programId, {
        programId,
        totalRequests: 0,
        totalSuccess: 0,
        totalFailure: 0,
        totalRejected: 0,
        totalTimeout: 0,
        avgResponseMs: 0,
        uniqueCallers: 0,
        currentConcurrent: 0,
      });
    }
  }

  /**
   * Start the runner service
   */
  start(pollIntervalMs = 1000): void {
    if (!this.config.enabled) {
      console.log('[Runner] Service is disabled');
      return;
    }

    if (this.running) {
      console.log('[Runner] Already running');
      return;
    }

    this.running = true;
    console.log('[Runner] Starting instruction runner service');

    // Start polling for new events
    this.pollInterval = setInterval(() => {
      this.pollForEvents().catch(err => {
        console.error('[Runner] Poll error:', err);
      });
    }, pollIntervalMs);

    // Start rate limit cleanup
    setInterval(() => {
      this.policy.cleanupRateLimits();
    }, 60000);
  }

  /**
   * Stop the runner service
   */
  stop(): void {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    console.log('[Runner] Stopped');
  }

  /**
   * Poll for new CALL_LOCAL_REQUEST events
   */
  private async pollForEvents(): Promise<void> {
    // Get recent CALL_LOCAL_REQUEST events
    const events = this.eventStore.getByKey(EVENT_KEY_CALL_LOCAL_REQUEST, 100);

    for (const event of events) {
      // Skip if already processed
      const callId = this.extractCallId(event);
      if (!callId || this.processedCallIds.has(callId)) {
        continue;
      }

      // Parse request
      const request = this.parseCallRequest(event);
      if (!request) {
        continue;
      }

      // Process the request
      await this.processRequest(request);
    }
  }

  /**
   * Extract callId from event
   */
  private extractCallId(event: EventLog): string | null {
    try {
      const dataJson = Buffer.from(event.data.slice(2), 'hex').toString('utf8');
      const data = JSON.parse(dataJson);
      return data.callId;
    } catch {
      return null;
    }
  }

  /**
   * Parse call request from event
   */
  private parseCallRequest(event: EventLog): CallRequest | null {
    try {
      const dataJson = Buffer.from(event.data.slice(2), 'hex').toString('utf8');
      const data = JSON.parse(dataJson);

      return {
        txId: event.txId,
        blockHeight: event.blockHeight,
        programId: data.programId,
        callId: data.callId,
        payload: data.payload || '0x',
        maxResponseSize: data.maxResponseSize || 0,
        caller: data.caller,
        timestamp: data.timestamp || Date.now(),
      };
    } catch (err) {
      console.error('[Runner] Failed to parse call request:', err);
      return null;
    }
  }

  /**
   * Process a call request
   */
  async processRequest(request: CallRequest): Promise<TrackedExecution> {
    // Mark as processed
    this.processedCallIds.add(request.callId);

    // Get program config
    const program = this.policy.getProgram(request.programId);
    if (!program) {
      return this.rejectRequest(request, 'PROGRAM_NOT_FOUND', 'Program not found');
    }

    // Initialize stats
    this.initProgramStats(request.programId);
    const stats = this.stats.get(request.programId)!;
    stats.totalRequests++;

    // Get caller trust tier
    const trustTier = await this.trustService.getTrustTier(request.caller);

    // Check policy
    const policyResult = this.policy.checkPolicy(request, trustTier);
    if (!policyResult.allowed) {
      stats.totalRejected++;
      return this.rejectRequest(request, policyResult.code!, policyResult.reason!);
    }

    // Create tracked execution
    const execution: TrackedExecution = {
      request,
      config: program,
      status: 'running',
      startedAt: Date.now(),
    };
    this.executions.set(request.callId, execution);

    // Record execution start
    this.policy.recordExecutionStart(request.programId);
    stats.currentConcurrent = this.policy.getConcurrent(request.programId);

    // Execute
    try {
      let result: ExecutionResult;

      if (program.runner === 'local') {
        result = await executeLocal(request, program);
      } else if (program.runner === 'http') {
        result = await executeHttp(request, program);
      } else {
        throw new Error(`Unsupported runner type: ${program.runner}`);
      }

      // Update execution
      execution.result = result;
      execution.status = result.status === 'ok' ? 'completed' : 'failed';
      execution.completedAt = Date.now();

      // Update stats
      if (result.status === 'ok') {
        stats.totalSuccess++;
      } else {
        stats.totalFailure++;
        if (result.errorMessage?.includes('Timeout')) {
          stats.totalTimeout++;
        }
      }

      // Update average response time
      const totalCompleted = stats.totalSuccess + stats.totalFailure;
      stats.avgResponseMs = (stats.avgResponseMs * (totalCompleted - 1) + result.durationMs) / totalCompleted;

      // Submit result transaction if configured
      if (this.config.autoSubmitResults && this.txSubmitter) {
        try {
          const txId = await this.txSubmitter.submitCallResult(result);
          execution.resultTxId = txId;
        } catch (err) {
          console.error('[Runner] Failed to submit result tx:', err);
        }
      }

      return execution;

    } catch (err: any) {
      execution.status = 'failed';
      execution.result = {
        callId: request.callId,
        programId: request.programId,
        status: 'error',
        responseHash: '0x' + '0'.repeat(64),
        errorMessage: err.message,
        durationMs: Date.now() - execution.startedAt!,
      };
      execution.completedAt = Date.now();
      stats.totalFailure++;
      return execution;

    } finally {
      this.policy.recordExecutionEnd(request.programId);
      stats.currentConcurrent = this.policy.getConcurrent(request.programId);
    }
  }

  /**
   * Reject a request
   */
  private rejectRequest(
    request: CallRequest,
    code: string,
    reason: string
  ): TrackedExecution {
    const execution: TrackedExecution = {
      request,
      config: this.policy.getProgram(request.programId)!,
      status: 'rejected',
      rejectionReason: `${code}: ${reason}`,
    };
    this.executions.set(request.callId, execution);
    return execution;
  }

  /**
   * Get execution by callId
   */
  getExecution(callId: string): TrackedExecution | undefined {
    return this.executions.get(callId);
  }

  /**
   * Get all executions for a program
   */
  getExecutionsByProgram(programId: string): TrackedExecution[] {
    return Array.from(this.executions.values())
      .filter(e => e.request.programId === programId);
  }

  /**
   * Get runner stats
   */
  getStats(): RunnerStats {
    return {
      enabled: this.config.enabled,
      totalPrograms: this.config.programs.length,
      enabledPrograms: this.config.programs.filter(p => p.enabled).length,
      totalExecutions: this.executions.size,
      currentConcurrent: this.policy.getTotalConcurrent(),
      programs: Array.from(this.stats.values()),
    };
  }

  /**
   * Get stats for a specific program
   */
  getProgramStats(programId: string): ProgramStats | undefined {
    return this.stats.get(programId);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RunnerConfig>): void {
    this.config = { ...this.config, ...config };
    this.policy.updateConfig(this.config);

    // Initialize stats for new programs
    for (const prog of this.config.programs) {
      this.initProgramStats(prog.id);
    }
  }

  /**
   * Add or update a program
   */
  setProgram(program: ProgramConfig): void {
    this.policy.setProgram(program);
    this.initProgramStats(program.id);
  }

  /**
   * Check if a call would be allowed (dry run)
   */
  async checkPolicy(
    programId: string,
    caller: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const trustTier = await this.trustService.getTrustTier(caller);
    const mockRequest: CallRequest = {
      txId: '0x' + '0'.repeat(64),
      blockHeight: 0n,
      programId,
      callId: '0x' + '0'.repeat(64),
      payload: '0x',
      maxResponseSize: 0,
      caller,
      timestamp: Date.now(),
    };
    return this.policy.checkPolicy(mockRequest, trustTier);
  }
}

/**
 * Create a mock trust service for testing
 */
export function createMockTrustService(defaultTier = ConfirmationTier.INCLUDED): TrustService {
  return {
    async getTrustTier(): Promise<ConfirmationTier> {
      return defaultTier;
    },
  };
}

/**
 * Create a mock tx submitter for testing
 */
export function createMockTxSubmitter(): TxSubmitter {
  return {
    async submitCallResult(result: ExecutionResult): Promise<string> {
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify(result))
        .digest('hex');
      return `0x${hash}`;
    },
  };
}
