/**
 * SLO Benchmark Runner
 *
 * Runs benchmarks and validates against SLO targets.
 * Usage: npm run bench:slo
 */
import crypto from 'crypto';
import { RecentTxRing } from '../fastpath/hotwindow/recentTxRing';
import { TxMeta } from '../fastpath/hotwindow/types';
import { PendingIndex } from '../fastpath/pending/pendingIndex';
import { WarmMirrorCache } from '../mirror';
import { Indexer } from '../indexer';
import { MempoolStore } from '../mempool/store';
import { MemoryStore } from '../storage';
import { estimateGas, GasMeter, FeeService, InMemoryBalanceStore } from '../economics';
import {
  SLOChecker,
  SLOCheckResult,
  formatSLOResult,
  printSLOSummary,
} from './slo';

// ============================================================
// Utilities
// ============================================================

function randomHex(length: number): string {
  return crypto.randomBytes(length / 2).toString('hex');
}

function randomAddress(): string {
  return `gc1${randomHex(44)}`;
}

interface BenchResult {
  ops: number;
  avgMs: number;
}

async function bench(
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

  return { ops, avgMs };
}

// ============================================================
// Benchmark Functions
// ============================================================

async function benchHotWindow(checker: SLOChecker): Promise<SLOCheckResult[]> {
  const results: SLOCheckResult[] = [];
  const ring = new RecentTxRing({ size: 100_000, perSenderDepth: 1024, perStateDepth: 64, perIidDepth: 256 });

  // Pre-populate
  const senders = Array.from({ length: 1000 }, () => randomAddress());
  const states = Array.from({ length: 500 }, () => `state:${randomHex(32)}`);
  const txIds: string[] = [];

  for (let i = 0; i < 50_000; i++) {
    const txId = randomHex(64);
    txIds.push(txId);
    ring.push({
      txId,
      from: senders[i % senders.length],
      nonce: BigInt(Math.floor(i / 1000)),
      blockHash: randomHex(64),
      height: BigInt(Math.floor(i / 100)),
      touchedStates: [states[i % states.length]],
      iidList: [],
      timestamp: Date.now(),
      version: 2,
    });
  }

  // push
  let idx = 50_000;
  const pushResult = await bench(() => {
    ring.push({
      txId: randomHex(64),
      from: senders[idx % senders.length],
      nonce: BigInt(Math.floor(idx / 1000)),
      blockHash: randomHex(64),
      height: BigInt(Math.floor(idx / 100)),
      touchedStates: [states[idx % states.length]],
      iidList: [],
      timestamp: Date.now(),
      version: 2,
    });
    idx++;
  }, { iterations: 10_000 });
  results.push(checker.check('hotwindow.push', { ops: pushResult.ops, avgLatencyMs: pushResult.avgMs }));

  // getByTxId
  const sampleTxIds = txIds.slice(-1000);
  let txIdx = 0;
  const getResult = await bench(() => {
    ring.getByTxId(sampleTxIds[txIdx % sampleTxIds.length]);
    txIdx++;
  }, { iterations: 50_000 });
  results.push(checker.check('hotwindow.getByTxId', { ops: getResult.ops, avgLatencyMs: getResult.avgMs }));

  // has
  let hasIdx = 0;
  const hasResult = await bench(() => {
    ring.has(sampleTxIds[hasIdx % sampleTxIds.length]);
    hasIdx++;
  }, { iterations: 100_000 });
  results.push(checker.check('hotwindow.has', { ops: hasResult.ops, avgLatencyMs: hasResult.avgMs }));

  // getBySender
  let senderIdx = 0;
  const bySenderResult = await bench(() => {
    ring.getBySender(senders[senderIdx % senders.length], { limit: 10 });
    senderIdx++;
  }, { iterations: 10_000 });
  results.push(checker.check('hotwindow.getBySender', { ops: bySenderResult.ops, avgLatencyMs: bySenderResult.avgMs }));

  // getByStates
  let stateIdx = 0;
  const byStatesResult = await bench(() => {
    ring.getByStates([states[stateIdx % states.length]], { limit: 10 });
    stateIdx++;
  }, { iterations: 10_000 });
  results.push(checker.check('hotwindow.getByStates', { ops: byStatesResult.ops, avgLatencyMs: byStatesResult.avgMs }));

  // getRecent
  const recentResult = await bench(() => {
    ring.getRecent({ limit: 100 });
  }, { iterations: 5_000 });
  results.push(checker.check('hotwindow.getRecent', { ops: recentResult.ops, avgLatencyMs: recentResult.avgMs }));

  return results;
}

async function benchPendingIndex(checker: SLOChecker): Promise<SLOCheckResult[]> {
  const results: SLOCheckResult[] = [];
  const pending = new PendingIndex({ perStateMax: 1024 });

  const senders = Array.from({ length: 10_000 }, () => randomAddress());
  const states = Array.from({ length: 1000 }, () => `state:${randomHex(32)}`);
  const txIds: string[] = [];

  for (const sender of senders) {
    pending.setBaseNonce(sender, 0n);
  }

  for (let i = 0; i < 50_000; i++) {
    const txId = randomHex(64);
    txIds.push(txId);
    pending.onAdmit({
      txId,
      from: senders[i % senders.length],
      nonce: BigInt(Math.floor(i / senders.length)),
      stateTouches: [states[i % states.length]],
      expected: new Map([[states[i % states.length], `v${i}`]]),
      lockWrites: false,
      arrivedAt: Date.now(),
    });
  }

  // check
  let checkIdx = 0;
  const checkResult = await bench(() => {
    pending.check({
      from: randomAddress(),
      nonce: 0n,
      states: [states[checkIdx % states.length]],
      expected: [[states[checkIdx % states.length], `unique-${checkIdx}`]],
      lockWrites: false,
    });
    checkIdx++;
  }, { iterations: 10_000 });
  results.push(checker.check('pending.check', { ops: checkResult.ops, avgLatencyMs: checkResult.avgMs }));

  // onAdmit
  const newSenders = Array.from({ length: 1000 }, () => randomAddress());
  for (const s of newSenders) pending.setBaseNonce(s, 0n);
  let admitIdx = 0;
  const admitResult = await bench(() => {
    pending.onAdmit({
      txId: randomHex(64),
      from: newSenders[admitIdx % newSenders.length],
      nonce: BigInt(Math.floor(admitIdx / newSenders.length)),
      stateTouches: [],
      expected: new Map(),
      lockWrites: false,
      arrivedAt: Date.now(),
    });
    admitIdx++;
  }, { iterations: 10_000 });
  results.push(checker.check('pending.onAdmit', { ops: admitResult.ops, avgLatencyMs: admitResult.avgMs }));

  // has
  const sampleTxIds = txIds.slice(0, 1000);
  let hasIdx = 0;
  const hasResult = await bench(() => {
    pending.has(sampleTxIds[hasIdx % sampleTxIds.length]);
    hasIdx++;
  }, { iterations: 50_000 });
  results.push(checker.check('pending.has', { ops: hasResult.ops, avgLatencyMs: hasResult.avgMs }));

  return results;
}

async function benchWarmMirror(checker: SLOChecker): Promise<SLOCheckResult[]> {
  const results: SLOCheckResult[] = [];
  const cache = new WarmMirrorCache({ maxEntries: 100_000, defaultTtlMs: 60_000 });

  const stateIds = Array.from({ length: 50_000 }, (_, i) => `state:${i}:${randomHex(16)}`);
  for (let i = 0; i < 50_000; i++) {
    cache.set(stateIds[i], `value-${i}`, `v${i}`, BigInt(i));
  }

  // get
  let getIdx = 0;
  const getResult = await bench(() => {
    cache.get(stateIds[getIdx % stateIds.length]);
    getIdx++;
  }, { iterations: 100_000 });
  results.push(checker.check('mirror.get', { ops: getResult.ops, avgLatencyMs: getResult.avgMs }));

  // set
  let setIdx = 50_000;
  const setResult = await bench(() => {
    cache.set(`state:${setIdx}:${randomHex(16)}`, `value-${setIdx}`, `v${setIdx}`, BigInt(setIdx));
    setIdx++;
  }, { iterations: 10_000 });
  results.push(checker.check('mirror.set', { ops: setResult.ops, avgLatencyMs: setResult.avgMs }));

  return results;
}

async function benchIndexer(checker: SLOChecker): Promise<SLOCheckResult[]> {
  const results: SLOCheckResult[] = [];
  const indexer = new Indexer({ maxIndexedTxs: 100_000, maxStateChanges: 500_000 });

  const senders = Array.from({ length: 1000 }, () => randomAddress());
  const states = Array.from({ length: 500 }, () => `state:${randomHex(32)}`);
  const allTxIds: string[] = [];

  for (let blk = 0; blk < 50; blk++) {
    const txs = [];
    const changes = [];
    for (let i = 0; i < 100; i++) {
      const txId = randomHex(64);
      allTxIds.push(txId);
      txs.push({
        txId,
        from: senders[(blk * 100 + i) % senders.length],
        nonce: BigInt(Math.floor((blk * 100 + i) / 1000)),
        statesTouched: [states[(blk * 100 + i) % states.length]],
        success: true,
      });
      changes.push({
        stateId: states[(blk * 100 + i) % states.length],
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

  // indexBlock
  let blkIdx = 50;
  const indexResult = await bench(() => {
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
  }, { iterations: 100 });
  results.push(checker.check('indexer.indexBlock', { ops: indexResult.ops, avgLatencyMs: indexResult.avgMs }));

  // getTx
  const sampleTxIds = allTxIds.slice(0, 1000);
  let txIdx = 0;
  const getTxResult = await bench(() => {
    indexer.getTx(sampleTxIds[txIdx % sampleTxIds.length]);
    txIdx++;
  }, { iterations: 50_000 });
  results.push(checker.check('indexer.getTx', { ops: getTxResult.ops, avgLatencyMs: getTxResult.avgMs }));

  // searchTxs
  let senderIdx = 0;
  const searchResult = await bench(() => {
    indexer.searchTxs({ from: senders[senderIdx % senders.length], limit: 20 });
    senderIdx++;
  }, { iterations: 5_000 });
  results.push(checker.check('indexer.searchTxs', { ops: searchResult.ops, avgLatencyMs: searchResult.avgMs }));

  return results;
}

async function benchMempool(checker: SLOChecker): Promise<SLOCheckResult[]> {
  const results: SLOCheckResult[] = [];
  const store = new MempoolStore({
    maxPoolSize: 100_000,
    maxTxBytes: 100_000,
    maxTxPerSender: 1000,
  });

  const senders = Array.from({ length: 1000 }, () => randomAddress());

  // add
  let addIdx = 0;
  const addResult = await bench(() => {
    store.add({
      from: senders[addIdx % senders.length],
      nonce: addIdx,
      data: randomHex(200),
    });
    addIdx++;
  }, { iterations: 10_000 });
  results.push(checker.check('mempool.add', { ops: addResult.ops, avgLatencyMs: addResult.avgMs }));

  const allTxs = store.getAll();
  const txIds = allTxs.map(t => t.id).slice(0, 1000);

  // get
  let getIdx = 0;
  const getResult = await bench(() => {
    store.get(txIds[getIdx % txIds.length]);
    getIdx++;
  }, { iterations: 50_000 });
  results.push(checker.check('mempool.get', { ops: getResult.ops, avgLatencyMs: getResult.avgMs }));

  // has
  let hasIdx = 0;
  const hasResult = await bench(() => {
    store.has(txIds[hasIdx % txIds.length]);
    hasIdx++;
  }, { iterations: 100_000 });
  results.push(checker.check('mempool.has', { ops: hasResult.ops, avgLatencyMs: hasResult.avgMs }));

  return results;
}

async function benchEconomics(checker: SLOChecker): Promise<SLOCheckResult[]> {
  const results: SLOCheckResult[] = [];
  const balances = new InMemoryBalanceStore();
  const feeService = new FeeService(balances);

  const senders = Array.from({ length: 100 }, () => randomAddress());
  for (const s of senders) {
    balances.credit(s, 1_000_000_000n);
  }

  // estimateGas
  const estimateResult = await bench(() => {
    estimateGas({
      instructions: [{ selector: 'SYS.UPDATE', args: { patch: { op: 'put', totalBytes: 100 } } }]
    });
  }, { iterations: 100_000 });
  results.push(checker.check('gas.estimate', { ops: estimateResult.ops, avgLatencyMs: estimateResult.avgMs }));

  // validateFees
  let validateIdx = 0;
  const validateResult = await bench(() => {
    feeService.validateFees({
      from: senders[validateIdx % senders.length],
      feePayer: senders[validateIdx % senders.length],
      maxGas: 10000n,
      gasPrice: 1n,
      gasInput: { instructions: [{ selector: 'SYS.UPDATE' }] },
    });
    validateIdx++;
  }, { iterations: 50_000 });
  results.push(checker.check('fees.validate', { ops: validateResult.ops, avgLatencyMs: validateResult.avgMs }));

  return results;
}

async function benchStorage(checker: SLOChecker): Promise<SLOCheckResult[]> {
  const results: SLOCheckResult[] = [];
  const store = new MemoryStore<Buffer>();

  // Pre-populate
  const keys = Array.from({ length: 50_000 }, (_, i) => `key:${i}:${randomHex(16)}`);
  for (let i = 0; i < 50_000; i++) {
    await store.put(keys[i], Buffer.from(`value-${i}`));
  }

  // get
  let getIdx = 0;
  const getResult = await bench(async () => {
    await store.get(keys[getIdx % keys.length]);
    getIdx++;
  }, { iterations: 100_000 });
  results.push(checker.check('storage.get', { ops: getResult.ops, avgLatencyMs: getResult.avgMs }));

  // put
  let putIdx = 50_000;
  const putResult = await bench(async () => {
    await store.put(`key:${putIdx}:${randomHex(16)}`, Buffer.from(`value-${putIdx}`));
    putIdx++;
  }, { iterations: 50_000 });
  results.push(checker.check('storage.put', { ops: putResult.ops, avgLatencyMs: putResult.avgMs }));

  return results;
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  console.log('═'.repeat(75));
  console.log('  WSTFChain SLO Benchmark Runner');
  console.log('═'.repeat(75));

  const checker = new SLOChecker();
  const allResults: SLOCheckResult[] = [];

  console.log('\n📊 Running benchmarks...\n');

  // Hot Window
  console.log('  [HotWindow]');
  const hwResults = await benchHotWindow(checker);
  for (const r of hwResults) {
    console.log('    ' + formatSLOResult(r));
  }
  allResults.push(...hwResults);

  // Pending Index
  console.log('\n  [PendingIndex]');
  const piResults = await benchPendingIndex(checker);
  for (const r of piResults) {
    console.log('    ' + formatSLOResult(r));
  }
  allResults.push(...piResults);

  // Warm Mirror
  console.log('\n  [WarmMirror]');
  const wmResults = await benchWarmMirror(checker);
  for (const r of wmResults) {
    console.log('    ' + formatSLOResult(r));
  }
  allResults.push(...wmResults);

  // Indexer
  console.log('\n  [Indexer]');
  const idxResults = await benchIndexer(checker);
  for (const r of idxResults) {
    console.log('    ' + formatSLOResult(r));
  }
  allResults.push(...idxResults);

  // Mempool
  console.log('\n  [Mempool]');
  const mpResults = await benchMempool(checker);
  for (const r of mpResults) {
    console.log('    ' + formatSLOResult(r));
  }
  allResults.push(...mpResults);

  // Economics
  console.log('\n  [Economics]');
  const ecoResults = await benchEconomics(checker);
  for (const r of ecoResults) {
    console.log('    ' + formatSLOResult(r));
  }
  allResults.push(...ecoResults);

  // Storage
  console.log('\n  [Storage]');
  const stResults = await benchStorage(checker);
  for (const r of stResults) {
    console.log('    ' + formatSLOResult(r));
  }
  allResults.push(...stResults);

  // Summary
  printSLOSummary(allResults);

  // Exit with error if critical SLOs failed
  const criticalFailed = allResults.filter(r => !r.passed && r.slo.priority === 'critical');
  if (criticalFailed.length > 0) {
    console.log('\n❌ Critical SLO failures:');
    for (const r of criticalFailed) {
      console.log(`   - ${r.slo.name}: ${r.slo.description}`);
    }
    process.exit(1);
  }

  console.log('\n✅ All critical SLOs passed');
}

main().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
