/**
 * Instruction Runner Tests
 *
 * Tests for policy engine, runners, and service.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfirmationTier } from '../../trust/types';
import {
  ProgramConfig,
  CallRequest,
  RunnerConfig,
  DEFAULT_LIMITS,
  DEFAULT_CALLER_POLICY,
  POLICY_CODES,
} from './types';
import { PolicyEngine } from './policy';
import { validateLocalConfig } from './local';
import { validateHttpConfig } from './http';
import {
  InstructionRunnerService,
  createMockTrustService,
  createMockTxSubmitter,
} from './service';
import { InMemoryEventLogStore } from '../../events/logs/store';

// ============================================
// Test Fixtures
// ============================================

const createTestProgram = (overrides: Partial<ProgramConfig> = {}): ProgramConfig => ({
  id: 'test.program/v1',
  runner: 'local',
  cmd: ['echo', 'hello'],
  allowedCallers: {
    minTrustTier: ConfirmationTier.PREFLIGHT,
    allowAll: true,
    maxCallsPerHour: 100,
  },
  limits: {
    timeoutMs: 5000,
    maxPayloadBytes: 4096,
    maxResponseBytes: 16384,
    maxConcurrent: 32,
  },
  enabled: true,
  ...overrides,
});

const createTestRequest = (overrides: Partial<CallRequest> = {}): CallRequest => ({
  txId: '0x' + 'aa'.repeat(32),
  blockHeight: 100n,
  programId: 'test.program/v1',
  callId: '0x' + 'bb'.repeat(32),
  payload: '0x1234',
  maxResponseSize: 1024,
  caller: 'gc1alice',
  timestamp: Date.now(),
  ...overrides,
});

const createTestConfig = (programs: ProgramConfig[] = []): RunnerConfig => ({
  enabled: true,
  programs,
  globalRateLimitPerHour: 10000,
  maxTotalConcurrent: 256,
  autoSubmitResults: false,
  resultGasPrice: 1n,
  resultMaxGas: 50000n,
});

// ============================================
// Policy Engine Tests
// ============================================

describe('Policy Engine', () => {
  let engine: PolicyEngine;
  let program: ProgramConfig;

  beforeEach(() => {
    program = createTestProgram();
    engine = new PolicyEngine(createTestConfig([program]));
  });

  describe('Program management', () => {
    it('should find registered program', () => {
      expect(engine.getProgram('test.program/v1')).toBeDefined();
    });

    it('should return undefined for unknown program', () => {
      expect(engine.getProgram('unknown')).toBeUndefined();
    });

    it('should add and remove programs', () => {
      const newProg = createTestProgram({ id: 'new.program' });
      engine.setProgram(newProg);
      expect(engine.getProgram('new.program')).toBeDefined();

      engine.removeProgram('new.program');
      expect(engine.getProgram('new.program')).toBeUndefined();
    });

    it('should get all programs', () => {
      engine.setProgram(createTestProgram({ id: 'another' }));
      expect(engine.getAllPrograms().length).toBe(2);
    });
  });

  describe('Policy checks', () => {
    it('should allow valid request', () => {
      const result = engine.checkPolicy(
        createTestRequest(),
        ConfirmationTier.INCLUDED
      );
      expect(result.allowed).toBe(true);
    });

    it('should reject unknown program', () => {
      const result = engine.checkPolicy(
        createTestRequest({ programId: 'unknown' }),
        ConfirmationTier.INCLUDED
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(POLICY_CODES.PROGRAM_NOT_FOUND);
    });

    it('should reject disabled program', () => {
      engine.setProgram(createTestProgram({ enabled: false }));
      const result = engine.checkPolicy(
        createTestRequest(),
        ConfirmationTier.INCLUDED
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(POLICY_CODES.PROGRAM_DISABLED);
    });

    it('should reject low trust tier', () => {
      engine.setProgram(createTestProgram({
        allowedCallers: {
          ...DEFAULT_CALLER_POLICY,
          minTrustTier: ConfirmationTier.K_DEPTH,
        },
      }));
      const result = engine.checkPolicy(
        createTestRequest(),
        ConfirmationTier.INCLUDED
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(POLICY_CODES.TRUST_TIER_TOO_LOW);
    });

    it('should check address allowlist', () => {
      engine.setProgram(createTestProgram({
        allowedCallers: {
          minTrustTier: ConfirmationTier.PREFLIGHT,
          allowAddrs: ['gc1bob'],
        },
      }));
      const result = engine.checkPolicy(
        createTestRequest({ caller: 'gc1alice' }),
        ConfirmationTier.INCLUDED
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(POLICY_CODES.ADDRESS_NOT_ALLOWED);
    });

    it('should allow address in allowlist', () => {
      engine.setProgram(createTestProgram({
        allowedCallers: {
          minTrustTier: ConfirmationTier.PREFLIGHT,
          allowAddrs: ['gc1alice'],
        },
      }));
      const result = engine.checkPolicy(
        createTestRequest({ caller: 'gc1alice' }),
        ConfirmationTier.INCLUDED
      );
      expect(result.allowed).toBe(true);
    });

    it('should reject payload too large', () => {
      const result = engine.checkPolicy(
        createTestRequest({ payload: '0x' + 'aa'.repeat(5000) }),
        ConfirmationTier.INCLUDED
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(POLICY_CODES.PAYLOAD_TOO_LARGE);
    });
  });

  describe('Rate limiting', () => {
    it('should enforce per-program rate limit', () => {
      engine.setProgram(createTestProgram({
        allowedCallers: {
          ...DEFAULT_CALLER_POLICY,
          maxCallsPerHour: 2,
        },
      }));

      // First two should pass
      expect(engine.checkPolicy(createTestRequest(), ConfirmationTier.INCLUDED).allowed).toBe(true);
      expect(engine.checkPolicy(createTestRequest(), ConfirmationTier.INCLUDED).allowed).toBe(true);

      // Third should fail
      const result = engine.checkPolicy(createTestRequest(), ConfirmationTier.INCLUDED);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(POLICY_CODES.RATE_LIMIT_EXCEEDED);
    });
  });

  describe('Concurrent execution tracking', () => {
    it('should track concurrent executions', () => {
      expect(engine.getConcurrent('test.program/v1')).toBe(0);

      engine.recordExecutionStart('test.program/v1');
      expect(engine.getConcurrent('test.program/v1')).toBe(1);

      engine.recordExecutionStart('test.program/v1');
      expect(engine.getConcurrent('test.program/v1')).toBe(2);

      engine.recordExecutionEnd('test.program/v1');
      expect(engine.getConcurrent('test.program/v1')).toBe(1);
    });

    it('should track total concurrent', () => {
      expect(engine.getTotalConcurrent()).toBe(0);

      engine.recordExecutionStart('test.program/v1');
      expect(engine.getTotalConcurrent()).toBe(1);
    });

    it('should reject when concurrent limit reached', () => {
      engine.setProgram(createTestProgram({
        limits: { ...DEFAULT_LIMITS, maxConcurrent: 1 },
      }));

      engine.recordExecutionStart('test.program/v1');

      const result = engine.checkPolicy(createTestRequest(), ConfirmationTier.INCLUDED);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(POLICY_CODES.CONCURRENT_LIMIT_EXCEEDED);
    });
  });
});

// ============================================
// Config Validation Tests
// ============================================

describe('Config Validation', () => {
  describe('Local runner config', () => {
    it('should accept valid local config', () => {
      const result = validateLocalConfig(createTestProgram({ runner: 'local' }));
      expect(result.valid).toBe(true);
    });

    it('should reject missing cmd', () => {
      const result = validateLocalConfig(createTestProgram({ runner: 'local', cmd: [] }));
      expect(result.valid).toBe(false);
    });

    it('should reject wrong runner type', () => {
      const result = validateLocalConfig(createTestProgram({ runner: 'http' }));
      expect(result.valid).toBe(false);
    });
  });

  describe('HTTP runner config', () => {
    it('should accept valid http config', () => {
      const result = validateHttpConfig(createTestProgram({
        runner: 'http',
        urlTemplate: 'https://api.example.com/call',
        allowedDomains: ['api.example.com'],
      }));
      expect(result.valid).toBe(true);
    });

    it('should reject missing urlTemplate', () => {
      const result = validateHttpConfig(createTestProgram({
        runner: 'http',
        allowedDomains: ['api.example.com'],
      }));
      expect(result.valid).toBe(false);
    });

    it('should reject missing allowedDomains', () => {
      const result = validateHttpConfig(createTestProgram({
        runner: 'http',
        urlTemplate: 'https://api.example.com/call',
      }));
      expect(result.valid).toBe(false);
    });
  });
});

// ============================================
// Service Tests
// ============================================

describe('Instruction Runner Service', () => {
  let service: InstructionRunnerService;
  let eventStore: InMemoryEventLogStore;

  beforeEach(() => {
    eventStore = new InMemoryEventLogStore();
    const program = createTestProgram();
    service = new InstructionRunnerService(
      eventStore,
      createMockTrustService(ConfirmationTier.INCLUDED),
      createTestConfig([program]),
      createMockTxSubmitter()
    );
  });

  describe('Request processing', () => {
    it('should process valid request', async () => {
      const request = createTestRequest();
      const execution = await service.processRequest(request);

      expect(execution.status).toBe('completed');
      expect(execution.result?.status).toBe('ok');
    });

    it('should reject request for unknown program', async () => {
      const request = createTestRequest({ programId: 'unknown' });
      const execution = await service.processRequest(request);

      expect(execution.status).toBe('rejected');
      expect(execution.rejectionReason).toContain('PROGRAM_NOT_FOUND');
    });

    it('should track execution', async () => {
      const request = createTestRequest();
      await service.processRequest(request);

      const tracked = service.getExecution(request.callId);
      expect(tracked).toBeDefined();
      expect(tracked?.status).toBe('completed');
    });
  });

  describe('Stats', () => {
    it('should track stats', async () => {
      await service.processRequest(createTestRequest());
      await service.processRequest(createTestRequest({ callId: '0x' + 'cc'.repeat(32) }));

      const stats = service.getStats();
      expect(stats.totalExecutions).toBe(2);
    });

    it('should track program stats', async () => {
      await service.processRequest(createTestRequest());

      const stats = service.getProgramStats('test.program/v1');
      expect(stats?.totalRequests).toBe(1);
      expect(stats?.totalSuccess).toBe(1);
    });
  });

  describe('Policy checking', () => {
    it('should check policy without executing', async () => {
      const result = await service.checkPolicy('test.program/v1', 'gc1alice');
      expect(result.allowed).toBe(true);
    });

    it('should reject unknown program in policy check', async () => {
      const result = await service.checkPolicy('unknown', 'gc1alice');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should update config', () => {
      service.updateConfig({ enabled: false });
      const stats = service.getStats();
      expect(stats.enabled).toBe(false);
    });

    it('should add program dynamically', async () => {
      service.setProgram(createTestProgram({ id: 'new.program' }));

      const result = await service.checkPolicy('new.program', 'gc1alice');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Executions by program', () => {
    it('should get executions by program', async () => {
      await service.processRequest(createTestRequest());
      await service.processRequest(createTestRequest({ callId: '0x' + 'dd'.repeat(32) }));

      const executions = service.getExecutionsByProgram('test.program/v1');
      expect(executions.length).toBe(2);
    });
  });
});
