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
import { InMemoryMarketStore } from '../markets/store';
import {
  makeMarketId,
  makeOrderId,
  makeGridId,
  makeTradeId,
  MarketId,
  Market,
  Order,
  PriceLevel,
  LiquidityGrid,
  GEOM_RATIO_SCALE,
} from '../markets/types';

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
// Market Benchmarks
// ============================================================================

export async function runMarketBenchmarks(iterations = 1000): Promise<MicroBenchSuite> {
  const results: MicroBenchResult[] = [];
  const suiteStart = performance.now();

  const baseToken = makeTokenId('BASE');
  const quoteToken = makeTokenId('QUOTE');
  const user1 = 'user1';

  // Benchmark: Market Create
  {
    const store = new InMemoryMarketStore();
    let nonce = 0;

    results.push(await runMicroBench('market.create', iterations, async () => {
      const marketId = makeMarketId(makeTokenId(`BASE${nonce}`), makeTokenId(`QUOTE${nonce}`));
      await store.createMarket({
        marketId,
        baseTokenId: makeTokenId(`BASE${nonce}`),
        quoteTokenId: makeTokenId(`QUOTE${nonce++}`),
        tickSize: 1n,
        lotSize: 1n,
        feeBps: 30,
        status: 'active',
        creator: user1,
        createdAtHeight: 1n,
        version: 1n,
      });
    }));
  }

  // Benchmark: Order Create
  {
    const store = new InMemoryMarketStore();
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 1n,
      lotSize: 1n,
      feeBps: 30,
      status: 'active',
      creator: user1,
      createdAtHeight: 1n,
      version: 1n,
    });
    let nonce = 0n;

    results.push(await runMicroBench('market.order.create', iterations, async () => {
      const orderId = makeOrderId(marketId, user1, nonce++);
      await store.createOrder({
        orderId,
        marketId,
        owner: user1,
        side: 'bid',
        price: 1000n,
        size: 100n,
        remaining: 100n,
        status: 'open',
        createdAt: 1n,
        flags: [],
        version: 1n,
      });
    }));
  }

  // Benchmark: Order Get
  {
    const store = new InMemoryMarketStore();
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 1n,
      lotSize: 1n,
      feeBps: 30,
      status: 'active',
      creator: user1,
      createdAtHeight: 1n,
      version: 1n,
    });
    const orderId = makeOrderId(marketId, user1, 1n);
    await store.createOrder({
      orderId,
      marketId,
      owner: user1,
      side: 'bid',
      price: 1000n,
      size: 100n,
      remaining: 100n,
      status: 'open',
      createdAt: 1n,
      flags: [],
      version: 1n,
    });

    results.push(await runMicroBench('market.order.get', iterations * 10, async () => {
      await store.getOrder(orderId);
    }));
  }

  // Benchmark: Price Level Set
  {
    const store = new InMemoryMarketStore();
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 1n,
      lotSize: 1n,
      feeBps: 30,
      status: 'active',
      creator: user1,
      createdAtHeight: 1n,
      version: 1n,
    });
    let price = 0n;

    results.push(await runMicroBench('market.level.set', iterations, async () => {
      await store.setLevel({
        marketId,
        side: 'bid',
        price: price++,
        aggregate: 100n,
        orderIds: [makeOrderId(marketId, user1, price)],
        version: 1n,
      });
    }));
  }

  // Benchmark: Get Levels by Market (sorted)
  {
    const store = new InMemoryMarketStore();
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 1n,
      lotSize: 1n,
      feeBps: 30,
      status: 'active',
      creator: user1,
      createdAtHeight: 1n,
      version: 1n,
    });

    // Pre-populate 100 levels
    for (let i = 0; i < 100; i++) {
      await store.setLevel({
        marketId,
        side: 'bid',
        price: BigInt(1000 + i),
        aggregate: 100n,
        orderIds: [makeOrderId(marketId, user1, BigInt(i))],
        version: 1n,
      });
    }

    results.push(await runMicroBench('market.level.list.100', iterations, async () => {
      await store.getLevelsByMarket(marketId, 'bid', 10);
    }));
  }

  // Benchmark: Escrow Adjust
  {
    const store = new InMemoryMarketStore();
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 1n,
      lotSize: 1n,
      feeBps: 30,
      status: 'active',
      creator: user1,
      createdAtHeight: 1n,
      version: 1n,
    });

    results.push(await runMicroBench('market.escrow.adjust', iterations, async () => {
      await store.adjustEscrow(marketId, user1, baseToken, 100n);
    }));
  }

  // Benchmark: Trade Record
  {
    const store = new InMemoryMarketStore();
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 1n,
      lotSize: 1n,
      feeBps: 30,
      status: 'active',
      creator: user1,
      createdAtHeight: 1n,
      version: 1n,
    });
    let tradeNum = 0;

    results.push(await runMicroBench('market.trade.record', iterations, async () => {
      const tradeId = makeTradeId(marketId, BigInt(tradeNum), 0);
      await store.recordTrade({
        tradeId,
        marketId,
        makerOrderId: makeOrderId(marketId, user1, 1n),
        makerAddress: user1,
        takerOrderId: makeOrderId(marketId, 'user2', 1n),
        takerAddress: 'user2',
        side: 'bid',
        price: 1000n,
        size: 100n,
        quoteAmount: 100000n,
        takerFee: 30n,
        makerFee: 0n,
        height: BigInt(tradeNum++),
        timestamp: 1000n,
      });
    }));
  }

  // Benchmark: Grid Create
  {
    const store = new InMemoryMarketStore();
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 1n,
      lotSize: 1n,
      feeBps: 30,
      status: 'active',
      creator: user1,
      createdAtHeight: 1n,
      version: 1n,
    });
    let nonce = 0n;

    results.push(await runMicroBench('market.grid.create', iterations, async () => {
      const gridId = makeGridId(marketId, user1, nonce++);
      await store.createGrid({
        gridId,
        marketId,
        owner: user1,
        centerPrice: 1000n,
        halfWidth: 100n,
        levelsPerSide: 10,
        mode: 'arith',
        totalBaseSize: 1000n,
        sideBias: 'both',
        status: 'active',
        orderIds: [],
        createdAt: 1n,
        version: 1n,
      });
    }));
  }

  // Benchmark: Top of Book Update
  {
    const store = new InMemoryMarketStore();
    const marketId = makeMarketId(baseToken, quoteToken);
    await store.createMarket({
      marketId,
      baseTokenId: baseToken,
      quoteTokenId: quoteToken,
      tickSize: 1n,
      lotSize: 1n,
      feeBps: 30,
      status: 'active',
      creator: user1,
      createdAtHeight: 1n,
      version: 1n,
    });
    let version = 1n;

    results.push(await runMicroBench('market.topofbook.set', iterations, async () => {
      await store.setTopOfBook({
        marketId,
        bestBidPrice: 999n,
        bestAskPrice: 1001n,
        lastTradePrice: 1000n,
        lastTradeHeight: 1n,
        version: version++,
      });
    }));
  }

  const suiteEnd = performance.now();

  return {
    name: 'Market Operations',
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
  suites.push(await runMarketBenchmarks(iterations));

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
