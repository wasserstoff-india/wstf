/**
 * WSTFChain Benchmarks
 *
 * Performance benchmarks for core components:
 * - Hot Window (RecentTxRing)
 * - Pending Index
 * - Warm Mirror Cache
 * - Indexer
 * - Mempool Store
 */

import crypto from 'crypto';
import { RecentTxRing } from '../fastpath/hotwindow/recentTxRing';
import { TxMeta } from '../fastpath/hotwindow/types';
import { PendingIndex } from '../fastpath/pending/pendingIndex';
import { WarmMirrorCache } from '../mirror';
import { Indexer } from '../indexer';
import { MempoolStore } from '../mempool/store';

// ============================================================
// Utilities
// ============================================================

function formatOps(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M ops/s`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K ops/s`;
  return `${ops.toFixed(2)} ops/s`;
}

function formatTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function randomHex(length: number): string {
  return crypto.randomBytes(length / 2).toString('hex');
}

function randomAddress(): string {
  return `gc1${randomHex(38)}`;
}

interface BenchResult {
  name: string;
  ops: number;
  avgMs: number;
  totalMs: number;
  iterations: number;
}

async function bench(
  name: string,
  fn: () => void | Promise<void>,
  options: { iterations?: number; warmup?: number } = {}
): Promise<BenchResult> {
  const iterations = options.iterations ?? 10_000;
  const warmup = options.warmup ?? 100;

  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Measure
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const totalMs = performance.now() - start;

  const avgMs = totalMs / iterations;
  const ops = 1000 / avgMs;

  return { name, ops, avgMs, totalMs, iterations };
}

function printResult(result: BenchResult): void {
  console.log(
    `  ${result.name.padEnd(45)} ${formatOps(result.ops).padStart(15)} | ${formatTime(result.avgMs).padStart(10)}`
  );
}

// ============================================================
// Hot Window Benchmarks
// ============================================================

async function benchHotWindow(): Promise<void> {
  console.log('\n📊 Hot Window (RecentTxRing) Benchmarks');
  console.log('─'.repeat(75));

  // Create a ring with 100K capacity
  const ring = new RecentTxRing({ size: 100_000, perSenderDepth: 1024, perStateDepth: 64, perIidDepth: 256 });

  // Pre-populate with 50K entries
  const senders = Array.from({ length: 1000 }, () => randomAddress());
  const states = Array.from({ length: 500 }, () => `state:${randomHex(32)}`);
  const txIds: string[] = [];

  for (let i = 0; i < 50_000; i++) {
    const txId = randomHex(64);
    txIds.push(txId);
    const meta: TxMeta = {
      txId,
      from: senders[i % senders.length],
      nonce: BigInt(Math.floor(i / 1000)),
      blockHash: randomHex(64),
      height: BigInt(Math.floor(i / 100)),
      touchedStates: [states[i % states.length]],
      iidList: [],
      timestamp: Date.now(),
      version: 2,
    };
    ring.push(meta);
  }

  // Benchmark push
  let addIdx = 50_000;
  printResult(await bench('push (new entry)', () => {
    const meta: TxMeta = {
      txId: randomHex(64),
      from: senders[addIdx % senders.length],
      nonce: BigInt(Math.floor(addIdx / 1000)),
      blockHash: randomHex(64),
      height: BigInt(Math.floor(addIdx / 100)),
      touchedStates: [states[addIdx % states.length]],
      iidList: [],
      timestamp: Date.now(),
      version: 2,
    };
    ring.push(meta);
    addIdx++;
  }, { iterations: 10_000 }));

  // Benchmark lookup by txId
  const sampleTxIds = txIds.slice(-1000); // Use most recent
  let txIdx = 0;
  printResult(await bench('getByTxId (hit)', () => {
    ring.getByTxId(sampleTxIds[txIdx % sampleTxIds.length]);
    txIdx++;
  }, { iterations: 50_000 }));

  // Benchmark lookup miss
  printResult(await bench('getByTxId (miss)', () => {
    ring.getByTxId(randomHex(64));
  }, { iterations: 50_000 }));

  // Benchmark has
  let hasIdx = 0;
  printResult(await bench('has (hit)', () => {
    ring.has(sampleTxIds[hasIdx % sampleTxIds.length]);
    hasIdx++;
  }, { iterations: 100_000 }));

  // Benchmark getBySender
  let senderIdx = 0;
  printResult(await bench('getBySender', () => {
    ring.getBySender(senders[senderIdx % senders.length], { limit: 10 });
    senderIdx++;
  }, { iterations: 10_000 }));

  // Benchmark getByStates
  let stateIdx = 0;
  printResult(await bench('getByStates (1 state)', () => {
    ring.getByStates([states[stateIdx % states.length]], { limit: 10 });
    stateIdx++;
  }, { iterations: 10_000 }));

  // Benchmark getRecent
  printResult(await bench('getRecent (limit 100)', () => {
    ring.getRecent({ limit: 100 });
  }, { iterations: 5_000 }));
}

// ============================================================
// Pending Index Benchmarks
// ============================================================

async function benchPendingIndex(): Promise<void> {
  console.log('\n📊 Pending Index Benchmarks');
  console.log('─'.repeat(75));

  const pending = new PendingIndex({ perStateMax: 1024 });

  // Pre-populate with 10K senders
  const senders = Array.from({ length: 10_000 }, () => randomAddress());
  const states = Array.from({ length: 1000 }, () => `state:${randomHex(32)}`);
  const txIds: string[] = [];

  for (const sender of senders) {
    pending.setBaseNonce(sender, 0n);
  }

  // Add 50K pending txs
  for (let i = 0; i < 50_000; i++) {
    const sender = senders[i % senders.length];
    const nonce = BigInt(Math.floor(i / senders.length));
    const txId = randomHex(64);
    txIds.push(txId);
    pending.onAdmit({
      txId,
      from: sender,
      nonce,
      stateTouches: [states[i % states.length]],
      expected: new Map([[states[i % states.length], `v${i}`]]),
      lockWrites: false,
      arrivedAt: Date.now(),
    });
  }

  // Benchmark check (no conflict)
  let checkIdx = 0;
  printResult(await bench('check (no conflict)', () => {
    pending.check({
      from: randomAddress(),
      nonce: 0n,
      states: [states[checkIdx % states.length]],
      expected: [[states[checkIdx % states.length], `unique-${checkIdx}`]],
      lockWrites: false,
    });
    checkIdx++;
  }, { iterations: 10_000 }));

  // Benchmark onAdmit
  let admitIdx = 0;
  const newSenders = Array.from({ length: 1000 }, () => randomAddress());
  for (const s of newSenders) pending.setBaseNonce(s, 0n);

  printResult(await bench('onAdmit', () => {
    const sender = newSenders[admitIdx % newSenders.length];
    pending.onAdmit({
      txId: randomHex(64),
      from: sender,
      nonce: BigInt(Math.floor(admitIdx / newSenders.length)),
      stateTouches: [],
      expected: new Map(),
      lockWrites: false,
      arrivedAt: Date.now(),
    });
    admitIdx++;
  }, { iterations: 10_000 }));

  // Benchmark has
  const sampleTxIds = txIds.slice(0, 1000);
  let hasIdx = 0;
  printResult(await bench('has (hit)', () => {
    pending.has(sampleTxIds[hasIdx % sampleTxIds.length]);
    hasIdx++;
  }, { iterations: 50_000 }));

  printResult(await bench('has (miss)', () => {
    pending.has(randomHex(64));
  }, { iterations: 50_000 }));
}

// ============================================================
// Warm Mirror Benchmarks
// ============================================================

async function benchWarmMirror(): Promise<void> {
  console.log('\n📊 Warm Mirror Cache Benchmarks');
  console.log('─'.repeat(75));

  const cache = new WarmMirrorCache({ maxEntries: 100_000, defaultTtlMs: 60_000 });

  // Pre-populate with 50K entries
  const stateIds = Array.from({ length: 50_000 }, (_, i) => `state:${i}:${randomHex(16)}`);

  for (let i = 0; i < 50_000; i++) {
    cache.set(stateIds[i], `value-${i}-${randomHex(32)}`, `v${i}`, BigInt(i));
  }

  // Benchmark get (hit)
  let getIdx = 0;
  printResult(await bench('get (hit)', () => {
    cache.get(stateIds[getIdx % stateIds.length]);
    getIdx++;
  }, { iterations: 100_000 }));

  // Benchmark get (miss)
  printResult(await bench('get (miss)', () => {
    cache.get(`nonexistent:${randomHex(32)}`);
  }, { iterations: 50_000 }));

  // Benchmark set (new entry)
  let setIdx = 50_000;
  printResult(await bench('set (new entry)', () => {
    cache.set(`state:${setIdx}:${randomHex(16)}`, `value-${setIdx}`, `v${setIdx}`, BigInt(setIdx));
    setIdx++;
  }, { iterations: 10_000 }));

  // Benchmark set (update existing)
  let updateIdx = 0;
  printResult(await bench('set (update existing)', () => {
    cache.set(stateIds[updateIdx % stateIds.length], `updated-${updateIdx}`, `v${updateIdx + 1}`, BigInt(updateIdx + 1));
    updateIdx++;
  }, { iterations: 10_000 }));

  // Benchmark invalidate
  const toInvalidate = Array.from({ length: 1000 }, (_, i) => `invalidate:${i}:${randomHex(16)}`);
  for (const id of toInvalidate) {
    cache.set(id, 'val', 'v1', 100n);
  }

  let invIdx = 0;
  printResult(await bench('invalidate', () => {
    cache.invalidate(toInvalidate[invIdx % toInvalidate.length]);
    if (invIdx % toInvalidate.length === 0) {
      // Re-add for next round
      for (const id of toInvalidate) cache.set(id, 'val', 'v1', 100n);
    }
    invIdx++;
  }, { iterations: 5_000 }));
}

// ============================================================
// Indexer Benchmarks
// ============================================================

async function benchIndexer(): Promise<void> {
  console.log('\n📊 Indexer Benchmarks');
  console.log('─'.repeat(75));

  const indexer = new Indexer({ maxIndexedTxs: 100_000, maxStateChanges: 500_000 });

  // Pre-populate with 50 blocks, 100 txs each
  const senders = Array.from({ length: 1000 }, () => randomAddress());
  const states = Array.from({ length: 500 }, () => `state:${randomHex(32)}`);
  const allTxIds: string[] = [];

  for (let blk = 0; blk < 50; blk++) {
    const txs = [];
    const changes = [];
    for (let i = 0; i < 100; i++) {
      const txId = randomHex(64);
      allTxIds.push(txId);
      const sender = senders[(blk * 100 + i) % senders.length];
      const state = states[(blk * 100 + i) % states.length];
      txs.push({
        txId,
        from: sender,
        nonce: BigInt(Math.floor((blk * 100 + i) / 1000)),
        statesTouched: [state],
        success: true,
      });
      changes.push({
        stateId: state,
        txId,
        prevValue: null,
        newValue: `val-${blk}-${i}`,
        prevVersion: null,
        newVersion: `v${blk}-${i}`,
      });
    }
    indexer.indexBlock({
      hash: randomHex(64),
      height: BigInt(blk),
      timestamp: Date.now(),
      transactions: txs,
      stateChanges: changes,
    });
  }

  // Benchmark indexBlock
  let blkIdx = 50;
  printResult(await bench('indexBlock (100 txs)', () => {
    const txs = [];
    const changes = [];
    for (let i = 0; i < 100; i++) {
      const txId = randomHex(64);
      txs.push({
        txId,
        from: senders[i % senders.length],
        nonce: BigInt(blkIdx),
        statesTouched: [states[i % states.length]],
        success: true,
      });
      changes.push({
        stateId: states[i % states.length],
        txId,
        prevValue: null,
        newValue: `val-${blkIdx}-${i}`,
        prevVersion: null,
        newVersion: `v${blkIdx}-${i}`,
      });
    }
    indexer.indexBlock({
      hash: randomHex(64),
      height: BigInt(blkIdx),
      timestamp: Date.now(),
      transactions: txs,
      stateChanges: changes,
    });
    blkIdx++;
  }, { iterations: 100 }));

  // Benchmark getTx
  const sampleTxIds = allTxIds.slice(0, 1000);

  let txIdx = 0;
  printResult(await bench('getTx', () => {
    indexer.getTx(sampleTxIds[txIdx % sampleTxIds.length]);
    txIdx++;
  }, { iterations: 50_000 }));

  // Benchmark getTxsBySender
  let senderIdx = 0;
  printResult(await bench('getTxsBySender', () => {
    indexer.getTxsBySender(senders[senderIdx % senders.length], 10);
    senderIdx++;
  }, { iterations: 10_000 }));

  // Benchmark searchTxs
  printResult(await bench('searchTxs (by sender)', () => {
    indexer.searchTxs({ from: senders[senderIdx % senders.length], limit: 20 });
    senderIdx++;
  }, { iterations: 5_000 }));

  // Benchmark getStateHistory
  let stateIdx = 0;
  printResult(await bench('getStateHistory', () => {
    indexer.getStateHistory(states[stateIdx % states.length], 10);
    stateIdx++;
  }, { iterations: 10_000 }));
}

// ============================================================
// Mempool Store Benchmarks
// ============================================================

async function benchMempool(): Promise<void> {
  console.log('\n📊 Mempool Store Benchmarks');
  console.log('─'.repeat(75));

  const store = new MempoolStore({
    maxPoolSize: 100_000,
    maxTxBytes: 100_000,
    maxTxPerSender: 1000,
  });

  const senders = Array.from({ length: 1000 }, () => randomAddress());

  // Benchmark add
  let addIdx = 0;
  printResult(await bench('add (new tx)', () => {
    store.add({
      from: senders[addIdx % senders.length],
      nonce: addIdx,
      data: randomHex(200),
    });
    addIdx++;
  }, { iterations: 10_000 }));

  // Get all tx IDs for lookup
  const allTxs = store.getAll();
  const txIds = allTxs.map(t => t.id).slice(0, 1000);

  // Benchmark get
  let getIdx = 0;
  printResult(await bench('get (hit)', () => {
    store.get(txIds[getIdx % txIds.length]);
    getIdx++;
  }, { iterations: 50_000 }));

  printResult(await bench('get (miss)', () => {
    store.get(randomHex(64));
  }, { iterations: 50_000 }));

  // Benchmark has
  let hasIdx = 0;
  printResult(await bench('has (hit)', () => {
    store.has(txIds[hasIdx % txIds.length]);
    hasIdx++;
  }, { iterations: 100_000 }));

  // Benchmark getBySender
  let senderIdx = 0;
  printResult(await bench('getBySender', () => {
    store.getBySender(senders[senderIdx % senders.length]);
    senderIdx++;
  }, { iterations: 10_000 }));

  // Benchmark remove
  const toRemove = allTxs.slice(0, 1000).map(t => t.id);
  let removeIdx = 0;
  printResult(await bench('remove', () => {
    store.remove(toRemove[removeIdx % toRemove.length]);
    removeIdx++;
  }, { iterations: 1_000 }));
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  console.log('═'.repeat(75));
  console.log('  WSTFChain Performance Benchmarks');
  console.log('═'.repeat(75));

  await benchHotWindow();
  await benchPendingIndex();
  await benchWarmMirror();
  await benchIndexer();
  await benchMempool();

  console.log('\n' + '═'.repeat(75));
  console.log('  Benchmarks Complete');
  console.log('═'.repeat(75));
}

main().catch(console.error);
