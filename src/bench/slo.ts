/**
 * Service Level Objectives (SLOs) for WSTFChain
 *
 * Defines performance targets and validates benchmark results against them.
 */

/**
 * SLO Definition
 */
export interface SLODefinition {
  name: string;
  component: string;
  operation: string;

  /** Minimum ops/s required */
  minOps?: number;

  /** Maximum latency (ms) */
  maxLatencyMs?: number;

  /** Maximum p99 latency (ms) */
  maxP99Ms?: number;

  /** Description */
  description: string;

  /** Priority (critical, high, medium, low) */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * SLO Check Result
 */
export interface SLOCheckResult {
  slo: SLODefinition;
  passed: boolean;
  actual: {
    ops?: number;
    avgLatencyMs?: number;
    p99LatencyMs?: number;
  };
  margin?: number; // How much buffer (positive = headroom, negative = violation)
}

/**
 * WSTFChain SLO Targets
 *
 * These targets represent the minimum acceptable performance for production use.
 */
export const WSTF_SLOS: SLODefinition[] = [
  // Hot Window SLOs
  {
    name: 'hotwindow.push',
    component: 'HotWindow',
    operation: 'push',
    minOps: 50_000,
    maxLatencyMs: 0.02,
    description: 'Insert transaction into hot window',
    priority: 'critical',
  },
  {
    name: 'hotwindow.getByTxId',
    component: 'HotWindow',
    operation: 'getByTxId',
    minOps: 500_000,
    maxLatencyMs: 0.002,
    description: 'Lookup transaction by ID',
    priority: 'critical',
  },
  {
    name: 'hotwindow.has',
    component: 'HotWindow',
    operation: 'has',
    minOps: 1_000_000,
    maxLatencyMs: 0.001,
    description: 'Check if transaction exists',
    priority: 'critical',
  },
  {
    name: 'hotwindow.getBySender',
    component: 'HotWindow',
    operation: 'getBySender',
    minOps: 10_000,
    maxLatencyMs: 0.1,
    description: 'Get transactions by sender',
    priority: 'high',
  },
  {
    name: 'hotwindow.getByStates',
    component: 'HotWindow',
    operation: 'getByStates',
    minOps: 5_000,
    maxLatencyMs: 0.2,
    description: 'Get transactions by touched states',
    priority: 'high',
  },
  {
    name: 'hotwindow.getRecent',
    component: 'HotWindow',
    operation: 'getRecent',
    minOps: 2_000,
    maxLatencyMs: 0.5,
    description: 'Get recent transactions',
    priority: 'medium',
  },

  // Pending Index SLOs
  {
    name: 'pending.check',
    component: 'PendingIndex',
    operation: 'check',
    minOps: 10_000,
    maxLatencyMs: 0.1,
    description: 'Check for nonce/state conflicts',
    priority: 'critical',
  },
  {
    name: 'pending.onAdmit',
    component: 'PendingIndex',
    operation: 'onAdmit',
    minOps: 20_000,
    maxLatencyMs: 0.05,
    description: 'Admit transaction to pending index',
    priority: 'critical',
  },
  {
    name: 'pending.has',
    component: 'PendingIndex',
    operation: 'has',
    minOps: 100_000,
    maxLatencyMs: 0.01,
    description: 'Check if tx is pending',
    priority: 'high',
  },

  // Warm Mirror SLOs
  {
    name: 'mirror.get',
    component: 'WarmMirror',
    operation: 'get',
    minOps: 200_000,
    maxLatencyMs: 0.005,
    description: 'Get cached state',
    priority: 'critical',
  },
  {
    name: 'mirror.set',
    component: 'WarmMirror',
    operation: 'set',
    minOps: 50_000,
    maxLatencyMs: 0.02,
    description: 'Set cached state',
    priority: 'high',
  },

  // Indexer SLOs
  {
    name: 'indexer.indexBlock',
    component: 'Indexer',
    operation: 'indexBlock',
    minOps: 50,
    maxLatencyMs: 20,
    description: 'Index a block (100 txs)',
    priority: 'high',
  },
  {
    name: 'indexer.getTx',
    component: 'Indexer',
    operation: 'getTx',
    minOps: 100_000,
    maxLatencyMs: 0.01,
    description: 'Get indexed transaction',
    priority: 'high',
  },
  {
    name: 'indexer.searchTxs',
    component: 'Indexer',
    operation: 'searchTxs',
    minOps: 1_000,
    maxLatencyMs: 1,
    description: 'Search transactions',
    priority: 'medium',
  },

  // Mempool SLOs
  {
    name: 'mempool.add',
    component: 'Mempool',
    operation: 'add',
    minOps: 10_000,
    maxLatencyMs: 0.1,
    description: 'Add transaction to mempool',
    priority: 'critical',
  },
  {
    name: 'mempool.get',
    component: 'Mempool',
    operation: 'get',
    minOps: 100_000,
    maxLatencyMs: 0.01,
    description: 'Get transaction from mempool',
    priority: 'high',
  },
  {
    name: 'mempool.has',
    component: 'Mempool',
    operation: 'has',
    minOps: 200_000,
    maxLatencyMs: 0.005,
    description: 'Check if tx in mempool',
    priority: 'high',
  },

  // Economics SLOs
  {
    name: 'gas.estimate',
    component: 'Economics',
    operation: 'estimateGas',
    minOps: 100_000,
    maxLatencyMs: 0.01,
    description: 'Estimate gas for transaction',
    priority: 'high',
  },
  {
    name: 'fees.validate',
    component: 'Economics',
    operation: 'validateFees',
    minOps: 50_000,
    maxLatencyMs: 0.02,
    description: 'Validate transaction fees',
    priority: 'critical',
  },

  // Storage SLOs
  {
    name: 'storage.get',
    component: 'Storage',
    operation: 'get',
    minOps: 100_000,
    maxLatencyMs: 0.01,
    description: 'Get value from storage',
    priority: 'critical',
  },
  {
    name: 'storage.put',
    component: 'Storage',
    operation: 'put',
    minOps: 50_000,
    maxLatencyMs: 0.02,
    description: 'Put value to storage',
    priority: 'critical',
  },
];

/**
 * SLO Checker
 */
export class SLOChecker {
  private slos: Map<string, SLODefinition>;

  constructor(slos: SLODefinition[] = WSTF_SLOS) {
    this.slos = new Map();
    for (const slo of slos) {
      this.slos.set(slo.name, slo);
    }
  }

  /**
   * Check a single benchmark result against its SLO
   */
  check(
    sloName: string,
    actual: { ops?: number; avgLatencyMs?: number; p99LatencyMs?: number }
  ): SLOCheckResult {
    const slo = this.slos.get(sloName);
    if (!slo) {
      throw new Error(`Unknown SLO: ${sloName}`);
    }

    let passed = true;
    let margin = Infinity;

    // Check ops/s target
    if (slo.minOps !== undefined && actual.ops !== undefined) {
      const opsMargin = (actual.ops - slo.minOps) / slo.minOps;
      if (actual.ops < slo.minOps) {
        passed = false;
      }
      margin = Math.min(margin, opsMargin);
    }

    // Check latency target
    if (slo.maxLatencyMs !== undefined && actual.avgLatencyMs !== undefined) {
      const latencyMargin = (slo.maxLatencyMs - actual.avgLatencyMs) / slo.maxLatencyMs;
      if (actual.avgLatencyMs > slo.maxLatencyMs) {
        passed = false;
      }
      margin = Math.min(margin, latencyMargin);
    }

    // Check p99 target
    if (slo.maxP99Ms !== undefined && actual.p99LatencyMs !== undefined) {
      const p99Margin = (slo.maxP99Ms - actual.p99LatencyMs) / slo.maxP99Ms;
      if (actual.p99LatencyMs > slo.maxP99Ms) {
        passed = false;
      }
      margin = Math.min(margin, p99Margin);
    }

    return {
      slo,
      passed,
      actual,
      margin: margin === Infinity ? undefined : margin,
    };
  }

  /**
   * Get SLO by name
   */
  getSLO(name: string): SLODefinition | undefined {
    return this.slos.get(name);
  }

  /**
   * List all SLOs
   */
  listSLOs(): SLODefinition[] {
    return Array.from(this.slos.values());
  }

  /**
   * List SLOs by component
   */
  listByComponent(component: string): SLODefinition[] {
    return Array.from(this.slos.values()).filter(s => s.component === component);
  }

  /**
   * List SLOs by priority
   */
  listByPriority(priority: SLODefinition['priority']): SLODefinition[] {
    return Array.from(this.slos.values()).filter(s => s.priority === priority);
  }
}

/**
 * Format SLO check result for display
 */
export function formatSLOResult(result: SLOCheckResult): string {
  const status = result.passed ? '✓' : '✗';
  const margin = result.margin !== undefined
    ? `(${result.margin >= 0 ? '+' : ''}${(result.margin * 100).toFixed(1)}%)`
    : '';

  const parts = [
    `${status} ${result.slo.name.padEnd(30)}`,
    result.actual.ops !== undefined
      ? `${formatOps(result.actual.ops).padStart(15)}`
      : '',
    result.actual.avgLatencyMs !== undefined
      ? `${formatLatency(result.actual.avgLatencyMs).padStart(12)}`
      : '',
    margin.padStart(10),
    result.passed ? '' : ` [${result.slo.priority.toUpperCase()}]`,
  ];

  return parts.filter(Boolean).join(' ');
}

function formatOps(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M/s`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K/s`;
  return `${ops.toFixed(2)}/s`;
}

function formatLatency(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(2)}ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(2)}µs`;
  return `${ms.toFixed(2)}ms`;
}

/**
 * Print SLO summary
 */
export function printSLOSummary(results: SLOCheckResult[]): void {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const critical = results.filter(r => !r.passed && r.slo.priority === 'critical').length;

  console.log('\n' + '═'.repeat(70));
  console.log('  SLO Summary');
  console.log('═'.repeat(70));
  console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (critical > 0) {
    console.log(`  ⚠️  ${critical} CRITICAL SLOs FAILED`);
  }

  // Group by component
  const byComponent = new Map<string, SLOCheckResult[]>();
  for (const r of results) {
    const list = byComponent.get(r.slo.component) || [];
    list.push(r);
    byComponent.set(r.slo.component, list);
  }

  console.log('\n  By Component:');
  for (const [component, componentResults] of byComponent) {
    const componentPassed = componentResults.filter(r => r.passed).length;
    console.log(`    ${component}: ${componentPassed}/${componentResults.length}`);
  }

  console.log('═'.repeat(70));
}
