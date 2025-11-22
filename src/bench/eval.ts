/**
 * Blockchain State & Performance Evaluation
 *
 * Comprehensive evaluation script that:
 * 1. Runs token and variable microbenchmarks
 * 2. Computes estimated state sizes for various scales
 * 3. Projects storage requirements for real-world scenarios
 * 4. Outputs a summary report for chain capacity planning
 */

import { runTokenBenchmarks, runVarBenchmarks, formatMicroBenchReport, MicroBenchSuite } from './micro';
import {
  estimateTokenSize,
  estimateVarSize,
  analyzeBloat,
  formatBytes,
  TokenSizeEstimate,
  VarSizeEstimate,
  BloatAnalysis,
} from './space';

// ============================================================================
// Evaluation Types
// ============================================================================

export interface EvalConfig {
  /** Number of benchmark iterations */
  benchIterations: number;
  /** Token scenarios to evaluate */
  tokenScenarios: TokenScenario[];
  /** Variable scenarios to evaluate */
  varScenarios: VarScenario[];
  /** Growth scenarios for bloat analysis */
  growthScenarios: GrowthScenario[];
}

export interface TokenScenario {
  name: string;
  tokenCount: number;
  holdersPerToken: number;
  allowancesPerHolder: number;
}

export interface VarScenario {
  name: string;
  namespaceCount: number;
  varsPerNamespace: number;
  avgValueSize: number;
}

export interface GrowthScenario {
  name: string;
  currentTokenCount: number;
  currentVarCount: number;
  currentHolderCount: number;
  varGrowthRateDaily: number;
  holderGrowthRateDaily: number;
}

export interface EvalReport {
  timestamp: Date;
  benchmarks: MicroBenchSuite[];
  tokenSizeEstimates: Array<{ scenario: string; estimate: TokenSizeEstimate }>;
  varSizeEstimates: Array<{ scenario: string; estimate: VarSizeEstimate }>;
  bloatAnalyses: Array<{ scenario: string; analysis: BloatAnalysis }>;
  summary: EvalSummary;
}

export interface EvalSummary {
  /** Peak ops/second across all benchmarks */
  peakOpsPerSecond: number;
  /** Average p50 latency in microseconds */
  avgP50LatencyUs: number;
  /** Worst p99 latency in microseconds */
  worstP99LatencyUs: number;
  /** Total estimated state size for default scenario */
  estimatedStateSizeBytes: number;
  /** Projected state size in 1 year */
  projectedStateSizeBytes: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  benchIterations: 500, // Lower for eval to run faster
  tokenScenarios: [
    { name: 'Small (100 tokens, 1K holders)', tokenCount: 100, holdersPerToken: 1000, allowancesPerHolder: 0.1 },
    { name: 'Medium (1K tokens, 10K holders)', tokenCount: 1000, holdersPerToken: 10000, allowancesPerHolder: 0.1 },
    { name: 'Large (10K tokens, 100K holders)', tokenCount: 10000, holdersPerToken: 100000, allowancesPerHolder: 0.1 },
    { name: 'Massive (1M tokens, 1M holders)', tokenCount: 1000000, holdersPerToken: 1000000, allowancesPerHolder: 0.05 },
  ],
  varScenarios: [
    { name: 'Small (1K namespaces, 10 vars each)', namespaceCount: 1000, varsPerNamespace: 10, avgValueSize: 256 },
    { name: 'Medium (10K namespaces, 50 vars each)', namespaceCount: 10000, varsPerNamespace: 50, avgValueSize: 512 },
    { name: 'Large (100K namespaces, 100 vars each)', namespaceCount: 100000, varsPerNamespace: 100, avgValueSize: 1024 },
    { name: 'App-heavy (1K namespaces, 1K vars each)', namespaceCount: 1000, varsPerNamespace: 1000, avgValueSize: 2048 },
  ],
  growthScenarios: [
    {
      name: 'Conservative Growth (1% daily)',
      currentTokenCount: 1000,
      currentVarCount: 100000,
      currentHolderCount: 10000,
      varGrowthRateDaily: 0.01,
      holderGrowthRateDaily: 0.01,
    },
    {
      name: 'Aggressive Growth (5% daily)',
      currentTokenCount: 1000,
      currentVarCount: 100000,
      currentHolderCount: 10000,
      varGrowthRateDaily: 0.05,
      holderGrowthRateDaily: 0.05,
    },
    {
      name: 'Production Start (low base, high growth)',
      currentTokenCount: 50,
      currentVarCount: 5000,
      currentHolderCount: 1000,
      varGrowthRateDaily: 0.10,
      holderGrowthRateDaily: 0.08,
    },
  ],
};

// ============================================================================
// Evaluation Runner
// ============================================================================

export async function runEvaluation(config: EvalConfig = DEFAULT_EVAL_CONFIG): Promise<EvalReport> {
  const timestamp = new Date();

  // Run microbenchmarks
  console.log('Running microbenchmarks...');
  const benchmarks: MicroBenchSuite[] = [];
  benchmarks.push(await runTokenBenchmarks(config.benchIterations));
  benchmarks.push(await runVarBenchmarks(config.benchIterations));

  // Estimate token sizes
  console.log('Estimating token state sizes...');
  const tokenSizeEstimates = config.tokenScenarios.map(scenario => ({
    scenario: scenario.name,
    estimate: estimateTokenSize({
      type: 'FT',
      holderCount: scenario.holdersPerToken,
      allowanceCount: Math.floor(scenario.holdersPerToken * scenario.allowancesPerHolder),
    }),
  }));

  // Estimate variable sizes
  console.log('Estimating variable state sizes...');
  const varSizeEstimates = config.varScenarios.map(scenario => ({
    scenario: scenario.name,
    estimate: estimateVarSize({
      variableCount: scenario.namespaceCount * scenario.varsPerNamespace,
      avgValueSize: scenario.avgValueSize,
    }),
  }));

  // Analyze bloat
  console.log('Analyzing growth projections...');
  const bloatAnalyses = config.growthScenarios.map(scenario => ({
    scenario: scenario.name,
    analysis: analyzeBloat({
      currentTokenCount: scenario.currentTokenCount,
      currentVarCount: scenario.currentVarCount,
      currentHolderCount: scenario.currentHolderCount,
      varGrowthRateDaily: scenario.varGrowthRateDaily,
      holderGrowthRateDaily: scenario.holderGrowthRateDaily,
    }),
  }));

  // Compute summary
  const allResults = benchmarks.flatMap(s => s.results);
  const summary: EvalSummary = {
    peakOpsPerSecond: Math.max(...allResults.map(r => r.opsPerSecond)),
    avgP50LatencyUs: allResults.reduce((sum, r) => sum + r.p50LatencyUs, 0) / allResults.length,
    worstP99LatencyUs: Math.max(...allResults.map(r => r.p99LatencyUs)),
    estimatedStateSizeBytes: tokenSizeEstimates[1].estimate.totalBytes + varSizeEstimates[1].estimate.totalBytes,
    projectedStateSizeBytes: bloatAnalyses[0].analysis.projectedSize1Year,
  };

  return {
    timestamp,
    benchmarks,
    tokenSizeEstimates,
    varSizeEstimates,
    bloatAnalyses,
    summary,
  };
}

// ============================================================================
// Report Formatting
// ============================================================================

export function formatEvalReport(report: EvalReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔═══════════════════════════════════════════════════════════════════════════╗');
  lines.push('║                     WSTFCHAIN EVALUATION REPORT                           ║');
  lines.push('╠═══════════════════════════════════════════════════════════════════════════╣');
  lines.push(`║  Generated: ${report.timestamp.toISOString().padEnd(61)} ║`);
  lines.push('╚═══════════════════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Microbenchmark results
  lines.push(formatMicroBenchReport(report.benchmarks));

  // Token size estimates
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────────────────┐');
  lines.push('│ TOKEN STATE SIZE ESTIMATES                                              │');
  lines.push('├────────────────────────────────────────────┬──────────────┬─────────────┤');
  lines.push('│ Scenario                                   │ Token State  │ Balance St. │');
  lines.push('├────────────────────────────────────────────┼──────────────┼─────────────┤');

  for (const { scenario, estimate } of report.tokenSizeEstimates) {
    const name = scenario.slice(0, 42).padEnd(42);
    const tokenSize = formatBytes(estimate.breakdown.tokenRecord).padStart(12);
    const balanceSize = formatBytes(estimate.breakdown.balanceRecords).padStart(11);
    lines.push(`│ ${name} │ ${tokenSize} │ ${balanceSize} │`);
  }
  lines.push('└────────────────────────────────────────────┴──────────────┴─────────────┘');

  // Variable size estimates
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────────────────┐');
  lines.push('│ VARIABLE STATE SIZE ESTIMATES                                           │');
  lines.push('├────────────────────────────────────────────┬──────────────┬─────────────┤');
  lines.push('│ Scenario                                   │ Var State    │ NS State    │');
  lines.push('├────────────────────────────────────────────┼──────────────┼─────────────┤');

  for (const { scenario, estimate } of report.varSizeEstimates) {
    const name = scenario.slice(0, 42).padEnd(42);
    const varSize = formatBytes(estimate.breakdown.variableRecords).padStart(12);
    const nsSize = formatBytes(estimate.breakdown.namespaceACL).padStart(11);
    lines.push(`│ ${name} │ ${varSize} │ ${nsSize} │`);
  }
  lines.push('└────────────────────────────────────────────┴──────────────┴─────────────┘');

  // Bloat analysis
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────────────────┐');
  lines.push('│ GROWTH PROJECTIONS                                                      │');
  lines.push('├────────────────────────────────────────────┬──────────────┬─────────────┤');
  lines.push('│ Scenario                                   │ 1 Month      │ 1 Year      │');
  lines.push('├────────────────────────────────────────────┼──────────────┼─────────────┤');

  for (const { scenario, analysis } of report.bloatAnalyses) {
    const name = scenario.slice(0, 42).padEnd(42);
    const month = formatBytes(analysis.projectedSize1Month).padStart(12);
    const year = formatBytes(analysis.projectedSize1Year).padStart(11);
    lines.push(`│ ${name} │ ${month} │ ${year} │`);
  }
  lines.push('└────────────────────────────────────────────┴──────────────┴─────────────┘');

  // Summary
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────────────────┐');
  lines.push('│ SUMMARY                                                                 │');
  lines.push('├─────────────────────────────────────────────────────────────────────────┤');
  lines.push(`│ Peak Operations/Second: ${report.summary.peakOpsPerSecond.toLocaleString().padStart(47)} │`);
  lines.push(`│ Average P50 Latency: ${report.summary.avgP50LatencyUs.toFixed(2)} μs${' '.repeat(44)}│`);
  lines.push(`│ Worst P99 Latency: ${report.summary.worstP99LatencyUs.toFixed(2)} μs${' '.repeat(46)}│`);
  lines.push(`│ Estimated Medium State Size: ${formatBytes(report.summary.estimatedStateSizeBytes).padStart(42)} │`);
  lines.push(`│ Projected 1-Year State Size: ${formatBytes(report.summary.projectedStateSizeBytes).padStart(42)} │`);
  lines.push('└─────────────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Capacity notes
  lines.push('CAPACITY NOTES:');
  lines.push('- Token transfers: ~' + Math.round(report.summary.peakOpsPerSecond / 2).toLocaleString() + ' tx/sec (single-threaded)');
  lines.push('- Variable reads: ~' + Math.round(report.summary.peakOpsPerSecond).toLocaleString() + ' reads/sec');
  lines.push('- State pruning and archival recommended for 1-year+ deployments');
  lines.push('- Consider sharding if state exceeds 100GB');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export async function runEvalCLI(): Promise<void> {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     WSTFChain Evaluation Starting...         ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  const iterations = parseInt(process.env.BENCH_ITERATIONS ?? '500', 10);
  const config: EvalConfig = {
    ...DEFAULT_EVAL_CONFIG,
    benchIterations: iterations,
  };

  const report = await runEvaluation(config);
  console.log(formatEvalReport(report));
}

// ============================================================================
// Quick Sanity Check
// ============================================================================

/**
 * Quick sanity check that can be run in tests
 */
export async function quickEval(): Promise<{
  tokenOpsPerSec: number;
  varOpsPerSec: number;
  estimatedStateKB: number;
}> {
  const tokenBench = await runTokenBenchmarks(100);
  const varBench = await runVarBenchmarks(100);

  const tokenOps = Math.max(...tokenBench.results.map(r => r.opsPerSecond));
  const varOps = Math.max(...varBench.results.map(r => r.opsPerSecond));

  const tokenSize = estimateTokenSize({ type: 'FT', holderCount: 10000, allowanceCount: 1000 });
  const varSize = estimateVarSize({ variableCount: 10000, avgValueSize: 256 });

  return {
    tokenOpsPerSec: tokenOps,
    varOpsPerSec: varOps,
    estimatedStateKB: Math.round((tokenSize.totalBytes + varSize.totalBytes) / 1024),
  };
}
