/**
 * Microbenchmarks for Token and Variable Operations
 *
 * Measures operation latency and throughput for:
 * - Token deploys, mints, transfers
 * - Variable reads, writes, namespace operations
 */

import { InMemoryTokenStore, createTokenStore, generateTokenId } from '../tokens/store';
import { TokenHandler, createTokenHandler, TokenHandlerContext } from '../tokens/handlers';
import { makeTokenId, makeTokenClassId, TokenId, TokenClassId } from '../tokens/types';
import { InMemoryVarStore, createVarStore, VarStore } from '../vars/store';
import { orgNamespace, accountNamespace, VarNamespace, makeKey, encodeValue } from '../vars/types';

// ============================================================================
// Benchmark Types
// ============================================================================

export interface MicroBenchResult {
  name: string;
  operations: number;
  durationMs: number;
  opsPerSecond: number;
  avgLatencyUs: number; // microseconds
  p50LatencyUs: number;
  p95LatencyUs: number;
  p99LatencyUs: number;
}

export interface MicroBenchSuite {
  name: string;
  results: MicroBenchResult[];
  totalDurationMs: number;
}

// ============================================================================
// Benchmark Runner
// ============================================================================

function percentile(sorted: number[], p: number): number {
  const index = Math.floor(sorted.length * p);
  return sorted[Math.min(index, sorted.length - 1)];
}

async function runMicroBench(
  name: string,
  iterations: number,
  fn: () => Promise<void>
): Promise<MicroBenchResult> {
  const latencies: number[] = [];

  // Warmup
  const warmupCount = Math.min(100, Math.floor(iterations / 10));
  for (let i = 0; i < warmupCount; i++) {
    await fn();
  }

  // Actual benchmark
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const opStart = performance.now();
    await fn();
    const opEnd = performance.now();
    latencies.push((opEnd - opStart) * 1000); // Convert to microseconds
  }
  const end = performance.now();

  latencies.sort((a, b) => a - b);

  const durationMs = end - start;
  const avgLatencyUs = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  return {
    name,
    operations: iterations,
    durationMs,
    opsPerSecond: Math.round((iterations / durationMs) * 1000),
    avgLatencyUs: Math.round(avgLatencyUs * 100) / 100,
    p50LatencyUs: Math.round(percentile(latencies, 0.5) * 100) / 100,
    p95LatencyUs: Math.round(percentile(latencies, 0.95) * 100) / 100,
    p99LatencyUs: Math.round(percentile(latencies, 0.99) * 100) / 100,
  };
}

// ============================================================================
// Token Benchmarks
// ============================================================================

const TEST_CALLER = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_USER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function createTokenContext(nonce: bigint = 0n): TokenHandlerContext {
  return {
    caller: TEST_CALLER,
    blockHeight: 100n,
    timestamp: BigInt(Date.now()),
    txId: 'tx_bench',
    nonce,
  };
}

export async function runTokenBenchmarks(iterations = 1000): Promise<MicroBenchSuite> {
  const results: MicroBenchResult[] = [];
  const suiteStart = performance.now();

  // Benchmark: Token Deploy (FT)
  {
    const store = new InMemoryTokenStore();
    const handler = createTokenHandler(store);
    let nonce = 0n;

    results.push(await runMicroBench('token.deploy.ft', iterations, async () => {
      await handler.handleDeploy(createTokenContext(nonce++), {
        type: 'FT',
        symbol: 'TEST',
        name: 'Test Token',
      });
    }));
  }

  // Benchmark: Token Deploy (NFT)
  {
    const store = new InMemoryTokenStore();
    const handler = createTokenHandler(store);
    let nonce = 0n;

    results.push(await runMicroBench('token.deploy.nft', iterations, async () => {
      await handler.handleDeploy(createTokenContext(nonce++), {
        type: 'NFT',
        symbol: 'NFT',
        name: 'Test NFT',
      });
    }));
  }

  // Benchmark: FT Mint
  {
    const store = new InMemoryTokenStore();
    const handler = createTokenHandler(store);
    const deployResult = await handler.handleDeploy(createTokenContext(), {
      type: 'FT',
      symbol: 'TEST',
    });
    const tokenId = deployResult.data!.tokenId;
    let recipient = 0;

    results.push(await runMicroBench('token.mint.ft', iterations, async () => {
      await handler.handleMint(createTokenContext(), {
        tokenId,
        to: `0x${(recipient++).toString(16).padStart(40, '0')}`,
        amount: 1000n,
      });
    }));
  }

  // Benchmark: NFT Mint
  {
    const store = new InMemoryTokenStore();
    const handler = createTokenHandler(store);
    let nonce = 0n;
    const deployResult = await handler.handleDeploy(createTokenContext(nonce++), {
      type: 'NFT',
      symbol: 'NFT',
    });
    const tokenId = deployResult.data!.tokenId;

    results.push(await runMicroBench('token.mint.nft', iterations, async () => {
      await handler.handleMint(createTokenContext(nonce++), {
        tokenId,
        to: TEST_USER,
      });
    }));
  }

  // Benchmark: FT Transfer
  {
    const store = new InMemoryTokenStore();
    const handler = createTokenHandler(store);
    const deployResult = await handler.handleDeploy(createTokenContext(), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: BigInt(iterations) * 1000n,
    });
    const tokenId = deployResult.data!.tokenId;

    results.push(await runMicroBench('token.transfer.ft', iterations, async () => {
      await handler.handleTransfer(createTokenContext(), {
        tokenId,
        to: TEST_USER,
        amount: 1n,
      });
    }));
  }

  // Benchmark: FT Balance Query
  {
    const store = new InMemoryTokenStore();
    const handler = createTokenHandler(store);
    const deployResult = await handler.handleDeploy(createTokenContext(), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: 1000000n,
    });
    const tokenId = deployResult.data!.tokenId;

    results.push(await runMicroBench('token.balance.ft', iterations * 10, async () => {
      await handler.handleGetBalance({
        tokenId,
        holder: TEST_CALLER,
      });
    }));
  }

  // Benchmark: Token Info Query
  {
    const store = new InMemoryTokenStore();
    const handler = createTokenHandler(store);
    const deployResult = await handler.handleDeploy(createTokenContext(), {
      type: 'FT',
      symbol: 'TEST',
    });
    const tokenId = deployResult.data!.tokenId;

    results.push(await runMicroBench('token.get.info', iterations * 10, async () => {
      await handler.handleGetToken({ tokenId });
    }));
  }

  // Benchmark: FT Approve
  {
    const store = new InMemoryTokenStore();
    const handler = createTokenHandler(store);
    const deployResult = await handler.handleDeploy(createTokenContext(), {
      type: 'FT',
      symbol: 'TEST',
    });
    const tokenId = deployResult.data!.tokenId;

    results.push(await runMicroBench('token.approve.ft', iterations, async () => {
      await handler.handleApprove(createTokenContext(), {
        tokenId,
        spender: TEST_USER,
        amount: 1000n,
      });
    }));
  }

  const suiteEnd = performance.now();

  return {
    name: 'Token Operations',
    results,
    totalDurationMs: suiteEnd - suiteStart,
  };
}

// ============================================================================
// Variable Store Benchmarks
// ============================================================================

export async function runVarBenchmarks(iterations = 1000): Promise<MicroBenchSuite> {
  const results: MicroBenchResult[] = [];
  const suiteStart = performance.now();

  // Benchmark: Namespace Create
  {
    const store = new InMemoryVarStore();
    let nonce = 0;

    results.push(await runMicroBench('var.namespace.create', iterations, async () => {
      const ns = accountNamespace(`0x${(nonce++).toString(16).padStart(40, '0')}`);
      await store.createNamespace(ns, TEST_CALLER);
    }));
  }

  // Benchmark: Variable Set (small value)
  {
    const store = new InMemoryVarStore();
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);
    let keyNum = 0;

    results.push(await runMicroBench('var.set.small', iterations, async () => {
      await store.set({
        namespace: ns,
        key: makeKey(`key_${keyNum++}`),
        value: encodeValue('hello world', 'string'),
        type: 'string',
      }, TEST_CALLER);
    }));
  }

  // Benchmark: Variable Set (large value - 1KB)
  {
    const store = new InMemoryVarStore();
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);
    let keyNum = 0;
    const largeValue = 'x'.repeat(1024);

    results.push(await runMicroBench('var.set.1kb', iterations, async () => {
      await store.set({
        namespace: ns,
        key: makeKey(`key_${keyNum++}`),
        value: encodeValue(largeValue, 'string'),
        type: 'string',
      }, TEST_CALLER);
    }));
  }

  // Benchmark: Variable Get
  {
    const store = new InMemoryVarStore();
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);
    const key = makeKey('test_key');
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('test value', 'string'),
      type: 'string',
    }, TEST_CALLER);

    results.push(await runMicroBench('var.get', iterations * 10, async () => {
      await store.get(ns, key, TEST_CALLER);
    }));
  }

  // Benchmark: Variable Get (miss)
  {
    const store = new InMemoryVarStore();
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);
    const key = makeKey('nonexistent');

    results.push(await runMicroBench('var.get.miss', iterations * 10, async () => {
      await store.get(ns, key, TEST_CALLER);
    }));
  }

  // Benchmark: Variable Update (with version check)
  {
    const store = new InMemoryVarStore();
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);
    const key = makeKey('update_key');
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('initial', 'string'),
      type: 'string',
    }, TEST_CALLER);

    let version = 0n;
    let counter = 0;

    results.push(await runMicroBench('var.update', iterations, async () => {
      const result = await store.set({
        namespace: ns,
        key,
        value: encodeValue(`value_${counter++}`, 'string'),
        type: 'string',
        expectedVersion: version,
      }, TEST_CALLER);
      version = result.newVersion!;
    }));
  }

  // Benchmark: Variable Delete
  {
    const store = new InMemoryVarStore();
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);
    let keyNum = 0;

    // Pre-create variables to delete
    for (let i = 0; i < iterations; i++) {
      await store.set({
        namespace: ns,
        key: makeKey(`del_key_${i}`),
        value: encodeValue('to delete', 'string'),
        type: 'string',
      }, TEST_CALLER);
    }

    results.push(await runMicroBench('var.delete', iterations, async () => {
      await store.delete(ns, makeKey(`del_key_${keyNum++}`), TEST_CALLER);
    }));
  }

  // Benchmark: Variable List
  {
    const store = new InMemoryVarStore();
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);

    // Pre-create 100 variables
    for (let i = 0; i < 100; i++) {
      await store.set({
        namespace: ns,
        key: makeKey(`list_key_${i.toString().padStart(3, '0')}`),
        value: encodeValue(`value_${i}`, 'string'),
        type: 'string',
      }, TEST_CALLER);
    }

    results.push(await runMicroBench('var.list.100', iterations, async () => {
      await store.list(ns, TEST_CALLER, { limit: 100 });
    }));
  }

  // Benchmark: Permission Grant
  {
    const store = new InMemoryVarStore();
    // Create a namespace owned by TEST_CALLER
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);
    let nonce = 0;

    results.push(await runMicroBench('var.permission.grant', iterations, async () => {
      await store.grantPermission(ns, {
        grantee: `0x${(nonce++).toString(16).padStart(40, '1')}`,
        granteeType: 'address',
        permissions: { read: true, write: true, delete: false, admin: false },
      }, TEST_CALLER);
    }));
  }

  // Benchmark: Check Exists
  {
    const store = new InMemoryVarStore();
    const ns = accountNamespace(TEST_CALLER);
    await store.createNamespace(ns, TEST_CALLER);
    const key = makeKey('exists_key');
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('exists', 'string'),
      type: 'string',
    }, TEST_CALLER);

    results.push(await runMicroBench('var.exists', iterations * 10, async () => {
      await store.exists(ns, key);
    }));
  }

  const suiteEnd = performance.now();

  return {
    name: 'Variable Store Operations',
    results,
    totalDurationMs: suiteEnd - suiteStart,
  };
}

// ============================================================================
// Combined Benchmark Suite
// ============================================================================

export async function runAllMicroBenchmarks(iterations = 1000): Promise<MicroBenchSuite[]> {
  const suites: MicroBenchSuite[] = [];

  suites.push(await runTokenBenchmarks(iterations));
  suites.push(await runVarBenchmarks(iterations));

  return suites;
}

// ============================================================================
// Report Formatting
// ============================================================================

export function formatMicroBenchReport(suites: MicroBenchSuite[]): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════════════════');
  lines.push('                        MICROBENCHMARK RESULTS                             ');
  lines.push('═══════════════════════════════════════════════════════════════════════════');
  lines.push('');

  for (const suite of suites) {
    lines.push(`┌─────────────────────────────────────────────────────────────────────────┐`);
    lines.push(`│ ${suite.name.padEnd(71)} │`);
    lines.push(`├─────────────────────────────────────────────────────────────────────────┤`);
    lines.push(`│ Operation                  │ Ops/sec │ Avg (μs) │ P50 (μs) │ P99 (μs) │`);
    lines.push(`├────────────────────────────┼─────────┼──────────┼──────────┼──────────┤`);

    for (const result of suite.results) {
      const name = result.name.padEnd(26).slice(0, 26);
      const ops = result.opsPerSecond.toLocaleString().padStart(7);
      const avg = result.avgLatencyUs.toFixed(1).padStart(8);
      const p50 = result.p50LatencyUs.toFixed(1).padStart(8);
      const p99 = result.p99LatencyUs.toFixed(1).padStart(8);
      lines.push(`│ ${name} │ ${ops} │ ${avg} │ ${p50} │ ${p99} │`);
    }

    lines.push(`└────────────────────────────┴─────────┴──────────┴──────────┴──────────┘`);
    lines.push(`  Total time: ${suite.totalDurationMs.toFixed(0)}ms`);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export async function runMicroBenchCLI(): Promise<void> {
  console.log('Running microbenchmarks...\n');

  const iterations = parseInt(process.env.BENCH_ITERATIONS ?? '1000', 10);
  const suites = await runAllMicroBenchmarks(iterations);

  console.log(formatMicroBenchReport(suites));
}
