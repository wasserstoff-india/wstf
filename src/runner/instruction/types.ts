/**
 * Instruction Runner Types
 *
 * Types for off-chain instruction runner service that executes
 * local programs triggered by on-chain CALL_LOCAL events.
 */

import { ConfirmationTier } from '../../trust/types';

// ============================================
// Program Configuration
// ============================================

/**
 * Runner type - how the program is executed
 */
export type RunnerType = 'local' | 'http' | 'docker';

/**
 * Allowed caller policy
 */
export interface CallerPolicy {
  /** Minimum trust tier required (0-4) */
  minTrustTier: ConfirmationTier;

  /** Specific addresses allowed (if empty, all addresses meeting tier are allowed) */
  allowAddrs?: string[];

  /** Whether to allow all addresses meeting tier (default: true if allowAddrs empty) */
  allowAll?: boolean;

  /** Maximum calls per address per hour (rate limiting) */
  maxCallsPerHour?: number;

  /** Require minimum XP/stake (future) */
  minXP?: number;
}

/**
 * Execution limits
 */
export interface ExecutionLimits {
  /** Timeout in milliseconds */
  timeoutMs: number;

  /** Maximum payload size in bytes */
  maxPayloadBytes: number;

  /** Maximum response size in bytes */
  maxResponseBytes: number;

  /** Maximum concurrent executions */
  maxConcurrent: number;

  /** Memory limit in bytes (for docker) */
  memoryBytes?: number;

  /** CPU limit (for docker) */
  cpuLimit?: number;
}

/**
 * Program configuration
 */
export interface ProgramConfig {
  /** Unique program identifier */
  id: string;

  /** Runner type */
  runner: RunnerType;

  /** Command to execute (for local runner) */
  cmd?: string[];

  /** Working directory (for local runner) */
  cwd?: string;

  /** Environment variables (for local runner) */
  env?: Record<string, string>;

  /** URL template (for http runner) */
  urlTemplate?: string;

  /** HTTP method (for http runner) */
  method?: 'GET' | 'POST' | 'PUT';

  /** HTTP headers (for http runner) */
  headers?: Record<string, string>;

  /** Allowed domains (for http runner security) */
  allowedDomains?: string[];

  /** Docker image (for docker runner) */
  dockerImage?: string;

  /** Caller policy */
  allowedCallers: CallerPolicy;

  /** Execution limits */
  limits: ExecutionLimits;

  /** Whether this program is enabled */
  enabled: boolean;

  /** Description for explorer/docs */
  description?: string;

  /** Version of this program config */
  version?: string;
}

/**
 * Default execution limits
 */
export const DEFAULT_LIMITS: ExecutionLimits = {
  timeoutMs: 5000,
  maxPayloadBytes: 4096,
  maxResponseBytes: 16384,
  maxConcurrent: 32,
};

/**
 * Default caller policy (permissive)
 */
export const DEFAULT_CALLER_POLICY: CallerPolicy = {
  minTrustTier: ConfirmationTier.PREFLIGHT,
  allowAll: true,
  maxCallsPerHour: 100,
};

// ============================================
// Runner Configuration
// ============================================

/**
 * Runner service configuration
 */
export interface RunnerConfig {
  /** Whether the runner is enabled */
  enabled: boolean;

  /** Program configurations */
  programs: ProgramConfig[];

  /** Global rate limit per IP */
  globalRateLimitPerHour: number;

  /** Maximum total concurrent executions */
  maxTotalConcurrent: number;

  /** Whether to auto-submit result transactions */
  autoSubmitResults: boolean;

  /** Gas price for result transactions */
  resultGasPrice: bigint;

  /** Maximum gas for result transactions */
  resultMaxGas: bigint;
}

/**
 * Default runner config
 */
export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  enabled: false,
  programs: [],
  globalRateLimitPerHour: 10000,
  maxTotalConcurrent: 256,
  autoSubmitResults: true,
  resultGasPrice: 1n,
  resultMaxGas: 50000n,
};

// ============================================
// Execution Types
// ============================================

/**
 * Call request (parsed from event)
 */
export interface CallRequest {
  /** Transaction ID that emitted the request */
  txId: string;

  /** Block height where request was emitted */
  blockHeight: bigint;

  /** Program to execute */
  programId: string;

  /** Unique call identifier */
  callId: string;

  /** Call payload (hex) */
  payload: string;

  /** Maximum response size hint */
  maxResponseSize: number;

  /** Caller address */
  caller: string;

  /** Request timestamp */
  timestamp: number;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  /** Call identifier */
  callId: string;

  /** Program that was executed */
  programId: string;

  /** Execution status */
  status: 'ok' | 'error';

  /** Response data (if ok) */
  response?: Buffer;

  /** Response hash */
  responseHash: string;

  /** Error message (if error) */
  errorMessage?: string;

  /** Execution duration in ms */
  durationMs: number;

  /** Exit code (for local runner) */
  exitCode?: number;

  /** HTTP status (for http runner) */
  httpStatus?: number;
}

/**
 * Execution status
 */
export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'timeout';

/**
 * Tracked execution
 */
export interface TrackedExecution {
  /** Call request */
  request: CallRequest;

  /** Program config */
  config: ProgramConfig;

  /** Current status */
  status: ExecutionStatus;

  /** Result (if completed) */
  result?: ExecutionResult;

  /** Rejection reason (if rejected) */
  rejectionReason?: string;

  /** Started at timestamp */
  startedAt?: number;

  /** Completed at timestamp */
  completedAt?: number;

  /** Result transaction ID (if submitted) */
  resultTxId?: string;
}

// ============================================
// Runner Stats
// ============================================

/**
 * Program execution stats
 */
export interface ProgramStats {
  /** Program ID */
  programId: string;

  /** Total requests received */
  totalRequests: number;

  /** Total successful executions */
  totalSuccess: number;

  /** Total failed executions */
  totalFailure: number;

  /** Total rejected (policy) */
  totalRejected: number;

  /** Total timeouts */
  totalTimeout: number;

  /** Average response time (ms) */
  avgResponseMs: number;

  /** Unique callers */
  uniqueCallers: number;

  /** Current concurrent executions */
  currentConcurrent: number;
}

/**
 * Runner service stats
 */
export interface RunnerStats {
  /** Whether enabled */
  enabled: boolean;

  /** Total programs configured */
  totalPrograms: number;

  /** Programs currently enabled */
  enabledPrograms: number;

  /** Total executions */
  totalExecutions: number;

  /** Current concurrent executions */
  currentConcurrent: number;

  /** Per-program stats */
  programs: ProgramStats[];
}

// ============================================
// Policy Check Result
// ============================================

/**
 * Policy check result
 */
export interface PolicyCheckResult {
  /** Whether caller is allowed */
  allowed: boolean;

  /** Reason if not allowed */
  reason?: string;

  /** Code for the rejection */
  code?: string;
}

/**
 * Policy rejection codes
 */
export const POLICY_CODES = {
  PROGRAM_NOT_FOUND: 'PROGRAM_NOT_FOUND',
  PROGRAM_DISABLED: 'PROGRAM_DISABLED',
  TRUST_TIER_TOO_LOW: 'TRUST_TIER_TOO_LOW',
  ADDRESS_NOT_ALLOWED: 'ADDRESS_NOT_ALLOWED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  CONCURRENT_LIMIT_EXCEEDED: 'CONCURRENT_LIMIT_EXCEEDED',
  XP_TOO_LOW: 'XP_TOO_LOW',
} as const;
