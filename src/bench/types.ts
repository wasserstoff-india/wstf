/**
 * Benchmarking types and metrics
 */

/**
 * Benchmark scenario configuration
 */
export interface BenchScenario {
  name: string;
  description: string;
  txType: 'basic-v1' | 'v2-small' | 'v2-heavy' | 'mix';
  distribution?: {
    'basic-v1'?: number;
    'v2-small'?: number;
    'v2-heavy'?: number;
  };
  txCount: number;
  concurrency: number;
  rateLimit?: number; // txs per second, undefined = unlimited
}

/**
 * Benchmark target configuration
 */
export interface BenchTarget {
  name: string;
  url: string;
  endpoint: string;
}

/**
 * Benchmark mode
 */
export type BenchMode = 'submit' | 'validate' | 'commit';

/**
 * Benchmark configuration
 */
export interface BenchConfig {
  mode: BenchMode;
  scenario: BenchScenario;
  targets: BenchTarget[];
  duration: number; // seconds
  warmup?: number; // seconds
}

/**
 * Metrics snapshot from a service
 */
export interface ServiceMetrics {
  service: string;
  timestamp: number;
  metrics: {
    // Mempool
    'mempool.accepted_total'?: number;
    'mempool.rejected_total'?: number;
    'mempool.size'?: number;

    // Validator
    'validator.validations_total'?: number;
    'validator.validation_ms_p50'?: number;
    'validator.validation_ms_p95'?: number;
    'validator.validation_ms_p99'?: number;

    // Block builder
    'builder.blocks_mined_total'?: number;
    'builder.block_build_ms_p50'?: number;
    'builder.block_build_ms_p95'?: number;

    // Chain
    'chain.txs_committed_total'?: number;
    'chain.blocks_committed_total'?: number;
    'chain.block_commit_ms_p50'?: number;
    'chain.block_commit_ms_p95'?: number;

    // Process
    'process.memory_rss_mb'?: number;
    'process.cpu_percent'?: number;
    'process.event_loop_lag_ms'?: number;
  };
}

/**
 * Latency measurement
 */
export interface LatencyMeasurement {
  txId: string;
  submittedAt: number;
  acceptedAt?: number;
  includedAt?: number;
  visibleAt?: number;

  // Computed latencies
  submitToAccept?: number; // ms
  acceptToInclude?: number; // ms
  includeToVisible?: number; // ms
  endToEnd?: number; // ms
}

/**
 * Benchmark results
 */
export interface BenchResults {
  scenario: string;
  mode: BenchMode;
  duration: number;

  // TPS metrics
  submitTps: number;
  validateTps?: number;
  commitTps?: number;

  // Latency metrics (ms)
  latency: {
    submitToAccept: { p50: number; p95: number; p99: number };
    acceptToInclude?: { p50: number; p95: number; p99: number };
    includeToVisible?: { p50: number; p95: number; p99: number };
    endToEnd: { p50: number; p95: number; p99: number };
  };

  // Error metrics
  errors: {
    total: number;
    byCode: Record<string, number>;
  };

  // Resource metrics
  resources: {
    memoryPeakMb: number;
    cpuAvgPercent: number;
    eventLoopLagP95Ms: number;
  };

  // Raw data
  txCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * Predefined scenarios
 */
export const SCENARIOS: Record<string, BenchScenario> = {
  'basic-v1': {
    name: 'basic-v1',
    description: 'Empty tx, signature check only',
    txType: 'basic-v1',
    txCount: 10000,
    concurrency: 64
  },

  'v2-small': {
    name: 'v2-small',
    description: '1-3 SYS instructions (REG/INIT/UPDATE small patches)',
    txType: 'v2-small',
    txCount: 5000,
    concurrency: 32
  },

  'v2-heavy': {
    name: 'v2-heavy',
    description: '10-50 instructions + larger CBOR payloads',
    txType: 'v2-heavy',
    txCount: 1000,
    concurrency: 16
  },

  'mix-70-20-10': {
    name: 'mix-70-20-10',
    description: '70% v1, 20% v2-small, 10% v2-heavy',
    txType: 'mix',
    distribution: {
      'basic-v1': 0.7,
      'v2-small': 0.2,
      'v2-heavy': 0.1
    },
    txCount: 10000,
    concurrency: 64
  }
};
