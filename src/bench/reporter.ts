/**
 * Benchmark reporter: JSON + human-readable output
 */
import { BenchResults } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Print human-readable report
 */
export function printReport(results: BenchResults): void {
  console.log('\n' + '='.repeat(70));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(70));

  console.log(`\nScenario: ${results.scenario}`);
  console.log(`Mode: ${results.mode}`);
  console.log(`Duration: ${results.duration.toFixed(2)}s`);

  console.log('\n--- Throughput ---');
  console.log(`Submit TPS: ${results.submitTps.toFixed(2)} tx/s`);
  if (results.validateTps) {
    console.log(`Validate TPS: ${results.validateTps.toFixed(2)} tx/s`);
  }
  if (results.commitTps) {
    console.log(`Commit TPS: ${results.commitTps.toFixed(2)} tx/s`);
  }

  console.log('\n--- Latency (ms) ---');
  console.log(`Submit → Accept:`);
  console.log(`  p50: ${results.latency.submitToAccept.p50.toFixed(2)}ms`);
  console.log(`  p95: ${results.latency.submitToAccept.p95.toFixed(2)}ms`);
  console.log(`  p99: ${results.latency.submitToAccept.p99.toFixed(2)}ms`);

  if (results.latency.acceptToInclude) {
    console.log(`Accept → Include:`);
    console.log(`  p50: ${results.latency.acceptToInclude.p50.toFixed(2)}ms`);
    console.log(`  p95: ${results.latency.acceptToInclude.p95.toFixed(2)}ms`);
    console.log(`  p99: ${results.latency.acceptToInclude.p99.toFixed(2)}ms`);
  }

  console.log(`End-to-End:`);
  console.log(`  p50: ${results.latency.endToEnd.p50.toFixed(2)}ms`);
  console.log(`  p95: ${results.latency.endToEnd.p95.toFixed(2)}ms`);
  console.log(`  p99: ${results.latency.endToEnd.p99.toFixed(2)}ms`);

  console.log('\n--- Errors ---');
  console.log(`Total Errors: ${results.errors.total}`);
  console.log(`Success Rate: ${((results.successCount / results.txCount) * 100).toFixed(2)}%`);
  if (Object.keys(results.errors.byCode).length > 0) {
    console.log(`Error Breakdown:`);
    for (const [code, count] of Object.entries(results.errors.byCode)) {
      console.log(`  ${code}: ${count}`);
    }
  }

  console.log('\n--- Resources ---');
  console.log(`Memory Peak: ${results.resources.memoryPeakMb}MB`);
  console.log(`CPU Avg: ${results.resources.cpuAvgPercent.toFixed(2)}%`);
  console.log(`Event Loop Lag p95: ${results.resources.eventLoopLagP95Ms.toFixed(2)}ms`);

  console.log('\n--- Summary ---');
  console.log(`Total Transactions: ${results.txCount}`);
  console.log(`Success: ${results.successCount}`);
  console.log(`Failure: ${results.failureCount}`);

  console.log('\n' + '='.repeat(70) + '\n');
}

/**
 * Save results to JSON file
 */
export function saveResults(results: BenchResults, outputDir = 'bench/reports'): string {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${results.scenario}-${results.mode}-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  // Write JSON
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));

  console.log(`[reporter] Results saved to: ${filepath}`);

  return filepath;
}

/**
 * Check results against SLOs (Service Level Objectives)
 */
export interface BenchSLO {
  submitTpsMin?: number;
  validateTpsMin?: number;
  commitTpsMin?: number;
  latencyP95MaxMs?: number;
  errorRateMax?: number; // percentage
}

export function checkSLOs(results: BenchResults, slos: BenchSLO): { passed: boolean; violations: string[] } {
  const violations: string[] = [];

  if (slos.submitTpsMin && results.submitTps < slos.submitTpsMin) {
    violations.push(`Submit TPS ${results.submitTps.toFixed(2)} < ${slos.submitTpsMin} (SLO)`);
  }

  if (slos.validateTpsMin && results.validateTps && results.validateTps < slos.validateTpsMin) {
    violations.push(`Validate TPS ${results.validateTps.toFixed(2)} < ${slos.validateTpsMin} (SLO)`);
  }

  if (slos.commitTpsMin && results.commitTps && results.commitTps < slos.commitTpsMin) {
    violations.push(`Commit TPS ${results.commitTps.toFixed(2)} < ${slos.commitTpsMin} (SLO)`);
  }

  if (slos.latencyP95MaxMs && results.latency.endToEnd.p95 > slos.latencyP95MaxMs) {
    violations.push(`Latency p95 ${results.latency.endToEnd.p95.toFixed(2)}ms > ${slos.latencyP95MaxMs}ms (SLO)`);
  }

  if (slos.errorRateMax) {
    const errorRate = (results.failureCount / results.txCount) * 100;
    if (errorRate > slos.errorRateMax) {
      violations.push(`Error rate ${errorRate.toFixed(2)}% > ${slos.errorRateMax}% (SLO)`);
    }
  }

  return {
    passed: violations.length === 0,
    violations
  };
}
