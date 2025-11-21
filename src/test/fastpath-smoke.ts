/**
 * Fast-path smoke tests
 *
 * Tests for Hot Window, Pending Index, Preflight, Confirmation Tracker,
 * SSE Events, and Journal components.
 */

// Trust types
import {
  ConfirmationTier,
  getRequiredTier,
  getKDepth,
  estimateConfirmationTimes,
  DEFAULT_CONFIRMATION_CONFIG,
} from '../trust/types';
import { ConfirmationTracker } from '../trust/confirmationTracker';

// Trust policy
import {
  PolicyEngine,
  BALANCED_POLICY,
  CONSERVATIVE_POLICY,
  AGGRESSIVE_POLICY,
} from '../trust/policy';

// Status service
import { StatusService, formatStatusResponse } from '../trust/status';

// Hot Window
import { RecentTxRing } from '../fastpath/hotwindow/recentTxRing';
import { TxMeta } from '../fastpath/hotwindow/types';

// Pending Index
import { PendingIndex } from '../fastpath/pending/pendingIndex';
import { PendingTxRef } from '../fastpath/pending/types';

// Preflight
import { PreflightService } from '../fastpath/preflight/service';

// SSE
import { SSEService } from '../events/sse.service';

// Journal
import { JournalCollector } from '../journal/collector';
import { MockJournalWriter } from '../journal/adapters/mock';

// Sync
import { SyncService, SyncState } from '../sync';
import { InMemoryChainStore, ChainStore } from '../chain/store';
import {
  MessageType,
  createGetHeaders,
  createHeaders,
  createGetBlocks,
  CompactHeader,
} from '../p2p/messages';

// Mempool Reconciler
import { MempoolStore } from '../mempool/store';
import { MempoolReconciler } from '../mempool/reconciler';

// Journal Finalizer
import { JournalFinalizer } from '../journal/finalizer';

// SSE Hardening
import {
  TokenBucket,
  ConnectionManager,
  DegradationController,
  DegradationMode,
} from '../events/hardening';

// Warm Mirror
import { WarmMirrorCache, StateProvider } from '../mirror';

// Indexer
import { Indexer, BlockToIndex } from '../indexer';

// Identity
import { IdentityService } from '../identity';

// Compiler API
import { CompilerService, ProgramCache } from '../compiler-api';

// Economics
import {
  estimateGas,
  GasMeter,
  InMemoryBalanceStore,
  FeeService,
  InMemoryRentStore,
  RentCollector,
} from '../economics';

// Tx v2F
import { buildPreimage, computeIntegrityHash, validateTxV2FStructure, createSampleTxV2F } from '../tx/v2f';

console.log('🧪 Starting Fast-path smoke tests...\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`✓ ${name}`);
        passed++;
      }).catch((e: any) => {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${e.message}`);
        failed++;
      });
    }
    console.log(`✓ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

async function runTests() {
  // ============================================================
  // Trust Types Tests
  // ============================================================
  console.log('\n--- Trust Types ---');

  test('Trust: High score + low risk = ADMITTED tier', () => {
    const tier = getRequiredTier(95, 'low');
    if (tier !== ConfirmationTier.ADMITTED) {
      throw new Error(`Expected ADMITTED (1), got ${tier}`);
    }
  });

  test('Trust: Medium score + low risk = INCLUDED tier', () => {
    const tier = getRequiredTier(75, 'low');
    if (tier !== ConfirmationTier.INCLUDED) {
      throw new Error(`Expected INCLUDED (2), got ${tier}`);
    }
  });

  test('Trust: Low score = CROSS_CHAIN tier', () => {
    const tier = getRequiredTier(30, 'medium');
    if (tier !== ConfirmationTier.CROSS_CHAIN) {
      throw new Error(`Expected CROSS_CHAIN (4), got ${tier}`);
    }
  });

  test('Trust: High risk always = CROSS_CHAIN', () => {
    const tier = getRequiredTier(100, 'high');
    if (tier !== ConfirmationTier.CROSS_CHAIN) {
      throw new Error(`Expected CROSS_CHAIN (4), got ${tier}`);
    }
  });

  test('Trust: K-depth varies by score', () => {
    const highK = getKDepth(95);
    const lowK = getKDepth(30);
    if (highK >= lowK) {
      throw new Error(`High trust K (${highK}) should be < low trust K (${lowK})`);
    }
  });

  test('Trust: Estimate confirmation times', () => {
    const estimates = estimateConfirmationTimes();
    if (estimates.admittedMs >= estimates.includedMs) {
      throw new Error('Admitted should be faster than included');
    }
    if (estimates.includedMs >= estimates.kDepthMs) {
      throw new Error('Included should be faster than kDepth');
    }
  });

  // ============================================================
  // Confirmation Tracker Tests
  // ============================================================
  console.log('\n--- Confirmation Tracker ---');

  test('Tracker: Track through tiers', () => {
    const tracker = new ConfirmationTracker();

    const tx = tracker.trackPreflight('tx1', 'gc1test', 1n, 80, ConfirmationTier.INCLUDED);
    if (tx.tier !== ConfirmationTier.PREFLIGHT) {
      throw new Error('Should start at PREFLIGHT');
    }

    tracker.markAdmitted('tx1');
    const admitted = tracker.get('tx1');
    if (admitted?.tier !== ConfirmationTier.ADMITTED) {
      throw new Error('Should be ADMITTED after markAdmitted');
    }

    tracker.markIncluded('tx1', 'block1', 100n);
    const included = tracker.get('tx1');
    if (included?.tier !== ConfirmationTier.INCLUDED) {
      throw new Error('Should be INCLUDED after markIncluded');
    }
  });

  test('Tracker: K-depth progression', () => {
    const tracker = new ConfirmationTracker();

    tracker.trackPreflight('tx2', 'gc1test', 2n, 50, ConfirmationTier.K_DEPTH);
    tracker.markAdmitted('tx2');
    tracker.markIncluded('tx2', 'block2', 100n);

    // Update depth
    tracker.updateDepth(105n); // 5 deep
    let tx = tracker.get('tx2');
    if (tx?.tier !== ConfirmationTier.INCLUDED) {
      throw new Error('Should still be INCLUDED at 5 deep');
    }

    tracker.updateDepth(107n); // 7 deep (past default K=6)
    tx = tracker.get('tx2');
    if (tx?.tier !== ConfirmationTier.K_DEPTH) {
      throw new Error('Should be K_DEPTH at 7 deep');
    }
  });

  test('Tracker: Reorg handling', () => {
    const tracker = new ConfirmationTracker();

    tracker.trackPreflight('tx3', 'gc1test', 3n, 50, ConfirmationTier.K_DEPTH);
    tracker.markAdmitted('tx3');
    tracker.markIncluded('tx3', 'block3', 100n);

    // Simulate reorg
    const affected = tracker.handleReorg(['block3']);
    if (affected.length !== 1 || affected[0].txId !== 'tx3') {
      throw new Error('Should return affected tx');
    }

    const tx = tracker.get('tx3');
    if (tx?.tier !== ConfirmationTier.ADMITTED) {
      throw new Error('Should be back to ADMITTED after reorg');
    }
  });

  // ============================================================
  // Policy Engine Tests
  // ============================================================
  console.log('\n--- Policy Engine ---');

  test('Policy: Balanced policy - high trust low risk', () => {
    const engine = new PolicyEngine(BALANCED_POLICY);

    const result = engine.evaluate({
      trustScore: 95,
      actionRisk: 'low',
      value: 500n,
    });

    if (result.requiredTier !== ConfirmationTier.ADMITTED) {
      throw new Error(`Expected ADMITTED tier, got ${result.requiredTier}`);
    }

    if (!result.matchedRule.includes('high-trust')) {
      throw new Error(`Expected rule matching 'high-trust', got ${result.matchedRule}`);
    }
  });

  test('Policy: Conservative policy - higher thresholds', () => {
    const engine = new PolicyEngine(CONSERVATIVE_POLICY);

    // Same context but conservative requires more confirmation
    const result = engine.evaluate({
      trustScore: 90,
      actionRisk: 'low',
      value: 500n,
    });

    // Conservative policy doesn't have rules for score=90, so it falls to default
    if (result.requiredTier < ConfirmationTier.INCLUDED) {
      throw new Error(`Conservative should require at least INCLUDED, got ${result.requiredTier}`);
    }
  });

  test('Policy: Aggressive policy - faster confirmation', () => {
    const engine = new PolicyEngine(AGGRESSIVE_POLICY);

    const result = engine.evaluate({
      trustScore: 55,
      actionRisk: 'low',
      value: 5000n,
    });

    if (result.requiredTier !== ConfirmationTier.ADMITTED) {
      throw new Error(`Aggressive should allow ADMITTED for moderate trust, got ${result.requiredTier}`);
    }
  });

  test('Policy: High value escalates tier', () => {
    const engine = new PolicyEngine(BALANCED_POLICY);

    const result = engine.evaluate({
      trustScore: 95,
      actionRisk: 'low',
      value: 200000n, // High value
    });

    if (result.requiredTier < ConfirmationTier.K_DEPTH) {
      throw new Error(`High value should require at least K_DEPTH, got ${result.requiredTier}`);
    }
  });

  test('Policy: Switch policies dynamically', () => {
    const engine = new PolicyEngine();

    engine.setPolicy('conservative');
    if (engine.getPolicy().name !== 'conservative') {
      throw new Error('Should switch to conservative');
    }

    engine.setPolicy('aggressive');
    if (engine.getPolicy().name !== 'aggressive') {
      throw new Error('Should switch to aggressive');
    }
  });

  test('Policy: Validate custom policy', () => {
    const validation = PolicyEngine.validatePolicy({
      name: 'custom',
      description: 'Test',
      thresholds: { instantAccept: 90, softConfirm: 70, hardConfirm: 50 },
      kDepth: { default: 6, highTrust: 2, lowTrust: 12 },
      valueThresholds: { low: 1000n, medium: 100000n },
      rules: [],
      defaultTier: ConfirmationTier.K_DEPTH,
    });

    if (!validation.valid) {
      throw new Error(`Custom policy should be valid: ${validation.errors.join(', ')}`);
    }
  });

  // ============================================================
  // Status Service Tests
  // ============================================================
  console.log('\n--- Status Service ---');

  test('Status: Get transaction status', () => {
    const tracker = new ConfirmationTracker();
    const statusService = new StatusService(tracker);

    // Track a transaction
    tracker.trackPreflight('status-tx1', 'gc1status', 1n, 80, ConfirmationTier.INCLUDED);
    tracker.markAdmitted('status-tx1');
    tracker.markIncluded('status-tx1', 'block-status', 100n);

    const status = statusService.getStatus('status-tx1');

    if (!status) {
      throw new Error('Should find status');
    }

    if (status.tier !== ConfirmationTier.INCLUDED) {
      throw new Error(`Expected INCLUDED tier, got ${status.tier}`);
    }

    if (status.tierName !== 'Confirmed') {
      throw new Error(`Expected 'Confirmed' tierName, got ${status.tierName}`);
    }

    if (!status.isComplete) {
      throw new Error('Should be complete (requiredTier is INCLUDED)');
    }
  });

  test('Status: Progress calculation', () => {
    const tracker = new ConfirmationTracker();
    const statusService = new StatusService(tracker);

    // Track a transaction that needs K_DEPTH
    tracker.trackPreflight('progress-tx', 'gc1progress', 1n, 50, ConfirmationTier.K_DEPTH);
    tracker.markAdmitted('progress-tx');
    tracker.markIncluded('progress-tx', 'block-prog', 100n);

    // At INCLUDED, not at K_DEPTH yet
    const status = statusService.getStatus('progress-tx');

    if (!status) {
      throw new Error('Should find status');
    }

    if (status.isComplete) {
      throw new Error('Should NOT be complete yet');
    }

    if (status.progress >= 100) {
      throw new Error('Progress should be < 100');
    }
  });

  test('Status: Batch status', () => {
    const tracker = new ConfirmationTracker();
    const statusService = new StatusService(tracker);

    tracker.trackPreflight('batch-1', 'gc1batch', 1n, 80, ConfirmationTier.ADMITTED);
    tracker.trackPreflight('batch-2', 'gc1batch', 2n, 80, ConfirmationTier.ADMITTED);
    tracker.markAdmitted('batch-1');

    const batch = statusService.getBatchStatus({ txIds: ['batch-1', 'batch-2', 'nonexistent'] });

    if (batch.found !== 2) {
      throw new Error(`Expected 2 found, got ${batch.found}`);
    }

    if (batch.notFound !== 1) {
      throw new Error(`Expected 1 not found, got ${batch.notFound}`);
    }
  });

  test('Status: Format response for API', () => {
    const tracker = new ConfirmationTracker();
    const statusService = new StatusService(tracker);

    tracker.trackPreflight('format-tx', 'gc1format', 1n, 90, ConfirmationTier.ADMITTED);
    tracker.markAdmitted('format-tx');

    const status = statusService.getStatus('format-tx');
    const formatted = formatStatusResponse(status);

    if (!formatted) {
      throw new Error('Should format status');
    }

    if (formatted.tierName !== 'Sent') {
      throw new Error(`Expected 'Sent', got ${formatted.tierName}`);
    }

    if (formatted.requiredTierName !== 'Sent') {
      throw new Error(`Expected requiredTierName 'Sent', got ${formatted.requiredTierName}`);
    }
  });

  // ============================================================
  // Hot Window Tests
  // ============================================================
  console.log('\n--- Hot Window ---');

  test('HotWindow: Add and retrieve by txId', () => {
    const ring = new RecentTxRing({ size: 100 });

    const meta: TxMeta = {
      txId: 'tx001',
      from: 'gc1alice',
      nonce: 1n,
      touchedStates: ['state1'],
      iidList: ['sys|SYS|REG'],
      height: 100n,
      blockHash: 'block100',
      timestamp: Date.now(),
      version: 2,
    };

    ring.push(meta);

    const retrieved = ring.getByTxId('tx001');
    if (!retrieved || retrieved.from !== 'gc1alice') {
      throw new Error('Failed to retrieve by txId');
    }
  });

  test('HotWindow: Query by sender', () => {
    const ring = new RecentTxRing({ size: 100 });

    for (let i = 0; i < 5; i++) {
      ring.push({
        txId: `tx${i}`,
        from: 'gc1bob',
        nonce: BigInt(i),
        touchedStates: [],
        iidList: [],
        height: BigInt(100 + i),
        blockHash: `block${100 + i}`,
        timestamp: Date.now() + i,
        version: 1,
      });
    }

    const bobTxs = ring.getBySender('gc1bob');
    if (bobTxs.length !== 5) {
      throw new Error(`Expected 5 txs, got ${bobTxs.length}`);
    }

    // Should be sorted by nonce
    if (bobTxs[0].nonce !== 0n || bobTxs[4].nonce !== 4n) {
      throw new Error('Not sorted by nonce');
    }
  });

  test('HotWindow: Query by states', () => {
    const ring = new RecentTxRing({ size: 100 });

    ring.push({
      txId: 'tx-state1',
      from: 'gc1carol',
      nonce: 1n,
      touchedStates: ['stateA', 'stateB'],
      iidList: [],
      height: 200n,
      blockHash: 'block200',
      timestamp: Date.now(),
      version: 2,
    });

    ring.push({
      txId: 'tx-state2',
      from: 'gc1dave',
      nonce: 1n,
      touchedStates: ['stateB', 'stateC'],
      iidList: [],
      height: 201n,
      blockHash: 'block201',
      timestamp: Date.now(),
      version: 2,
    });

    const stateBTxs = ring.getByStates(['stateB']);
    if (stateBTxs.length !== 2) {
      throw new Error(`Expected 2 txs touching stateB, got ${stateBTxs.length}`);
    }
  });

  test('HotWindow: Ring overflow', () => {
    const ring = new RecentTxRing({ size: 10 });

    for (let i = 0; i < 20; i++) {
      ring.push({
        txId: `overflow-${i}`,
        from: 'gc1overflow',
        nonce: BigInt(i),
        touchedStates: [],
        iidList: [],
        height: BigInt(i),
        blockHash: `block${i}`,
        timestamp: Date.now(),
        version: 1,
      });
    }

    // Should only keep last 10
    if (ring.size() !== 10) {
      throw new Error(`Expected 10 entries, got ${ring.size()}`);
    }

    // First 10 should be gone
    if (ring.has('overflow-0')) {
      throw new Error('Old entry should be evicted');
    }

    // Last 10 should exist
    if (!ring.has('overflow-19')) {
      throw new Error('Recent entry should exist');
    }
  });

  // ============================================================
  // Pending Index Tests
  // ============================================================
  console.log('\n--- Pending Index ---');

  test('PendingIndex: Check nonce conflict', () => {
    const pending = new PendingIndex();
    pending.setBaseNonce('gc1eve', 5n);

    // Try to submit with wrong nonce
    const result = pending.check({
      from: 'gc1eve',
      nonce: 3n, // Too low
      states: [],
      expected: [],
    });

    if (result.ok) {
      throw new Error('Should detect nonce conflict');
    }

    if (result.conflicts[0].type !== 'nonce') {
      throw new Error('Conflict should be nonce type');
    }
  });

  test('PendingIndex: Check state conflict', () => {
    const pending = new PendingIndex();
    pending.setBaseNonce('gc1frank', 0n);

    // Admit first tx
    const tx1: PendingTxRef = {
      txId: 'pending1',
      from: 'gc1frank',
      nonce: 0n,
      stateTouches: ['sharedState'],
      expected: new Map([['sharedState', 'v1']]),
      lockWrites: false,
      arrivedAt: Date.now(),
    };
    pending.onAdmit(tx1);

    // Check second tx touching same state
    const result = pending.check({
      from: 'gc1grace',
      nonce: 0n,
      states: ['sharedState'],
      expected: [['sharedState', 'v1']],
      lockWrites: false,
    });

    if (result.ok) {
      throw new Error('Should detect state conflict');
    }

    if (result.conflicts[0].type !== 'state') {
      throw new Error('Conflict should be state type');
    }
  });

  test('PendingIndex: Lock conflict detection', () => {
    const pending = new PendingIndex();
    pending.setBaseNonce('gc1hank', 0n);

    // Admit tx with lock
    pending.onAdmit({
      txId: 'locking-tx',
      from: 'gc1hank',
      nonce: 0n,
      stateTouches: ['lockedState'],
      expected: new Map([['lockedState', 'v1']]),
      lockWrites: true,
      arrivedAt: Date.now(),
    });

    // Check another tx wanting the same state
    const result = pending.check({
      from: 'gc1ivy',
      nonce: 0n,
      states: ['lockedState'],
      expected: [['lockedState', 'v1']],
      lockWrites: false,
    });

    if (result.ok) {
      throw new Error('Should detect lock conflict');
    }

    if (result.conflicts[0].type !== 'lock') {
      throw new Error('Conflict should be lock type');
    }
  });

  test('PendingIndex: Commit removes entry', () => {
    const pending = new PendingIndex();
    pending.setBaseNonce('gc1jack', 0n);

    pending.onAdmit({
      txId: 'commit-test',
      from: 'gc1jack',
      nonce: 0n,
      stateTouches: [],
      expected: new Map(),
      lockWrites: false,
      arrivedAt: Date.now(),
    });

    if (!pending.has('commit-test')) {
      throw new Error('Should have pending tx');
    }

    pending.onCommit('gc1jack', 0n, 'commit-test');

    if (pending.has('commit-test')) {
      throw new Error('Should remove after commit');
    }
  });

  // ============================================================
  // Preflight Service Tests
  // ============================================================
  console.log('\n--- Preflight Service ---');

  await test('Preflight: Basic check passes', async () => {
    const pendingIndex = new PendingIndex();
    const hotWindow = new RecentTxRing({ size: 100 });

    pendingIndex.setBaseNonce('gc1preflight', 0n);

    const preflight = new PreflightService({
      pendingIndex,
      hotWindow,
      getState: async () => ({ version: 'v1' }),
      getTip: () => ({ hash: 'tip123', height: 500n }),
    });

    const result = await preflight.check({
      from: 'gc1preflight',
      nonce: 0n,
      states: ['state1'],
      expected: [['state1', 'v1']],
    });

    if (!result.ok) {
      throw new Error('Preflight should pass');
    }

    if (!result.warmStateStamp.header) {
      throw new Error('Should have warmStateStamp');
    }

    if (!result.confirmation.tipHash) {
      throw new Error('Should have confirmation info');
    }
  });

  await test('Preflight: Conflict detected', async () => {
    const pendingIndex = new PendingIndex();
    const hotWindow = new RecentTxRing({ size: 100 });

    pendingIndex.setBaseNonce('gc1conflict', 0n);

    // Add a pending tx
    pendingIndex.onAdmit({
      txId: 'blocking-tx',
      from: 'gc1other',
      nonce: 0n,
      stateTouches: ['contestedState'],
      expected: new Map([['contestedState', 'v1']]),
      lockWrites: true,
      arrivedAt: Date.now(),
    });

    const preflight = new PreflightService({
      pendingIndex,
      hotWindow,
      getState: async () => ({ version: 'v1' }),
      getTip: () => ({ hash: 'tip456', height: 501n }),
    });

    const result = await preflight.check({
      from: 'gc1conflict',
      nonce: 0n,
      states: ['contestedState'],
      expected: [['contestedState', 'v1']],
      lockWrites: false,
    });

    if (result.ok) {
      throw new Error('Preflight should fail with conflict');
    }

    if (result.conflicts.length === 0) {
      throw new Error('Should have conflicts');
    }
  });

  // ============================================================
  // SSE Service Tests
  // ============================================================
  console.log('\n--- SSE Service ---');

  test('SSE: Broadcast to matching clients', () => {
    const sse = new SSEService();
    sse.start();

    let received = false;
    const mockWrite = (data: string) => {
      if (data.includes('mempool_admit')) {
        received = true;
      }
      return true;
    };

    sse.addClient('127.0.0.1', { addr: 'gc1sse' }, mockWrite, () => {});

    sse.emitMempoolAdmit('tx-sse', 'gc1sse', 1n);

    if (!received) {
      throw new Error('Client should receive matching event');
    }

    sse.stop();
  });

  test('SSE: Filter by address', () => {
    const sse = new SSEService();
    sse.start();

    let received = false;
    const mockWrite = (data: string) => {
      if (data.includes('mempool_admit')) {
        received = true;
      }
      return true;
    };

    // Filter for gc1other only
    sse.addClient('127.0.0.1', { addr: 'gc1other' }, mockWrite, () => {});

    // Emit for gc1different
    sse.emitMempoolAdmit('tx-filtered', 'gc1different', 1n);

    if (received) {
      throw new Error('Client should NOT receive event for different address');
    }

    sse.stop();
  });

  // ============================================================
  // Journal Tests
  // ============================================================
  console.log('\n--- Journal ---');

  await test('Journal: Mock writer stores journal', async () => {
    const mockWriter = new MockJournalWriter({ writeDelay: 10 });

    const result = await mockWriter.write({
      id: 'journal1',
      blockHashStart: 'start',
      blockHashEnd: 'end',
      heightStart: 100n,
      heightEnd: 109n,
      timestamp: Date.now(),
      stateRootBefore: 'root0',
      stateRootAfter: 'root1',
      entries: [
        {
          stateId: 'state1',
          versionBefore: 'v0',
          versionAfter: 'v1',
          dataHashBefore: 'h0',
          dataHashAfter: 'h1',
          txId: 'tx1',
        },
      ],
      attestations: [],
    });

    if (!result.ok) {
      throw new Error('Mock write should succeed');
    }

    if (!result.txHash) {
      throw new Error('Should have txHash');
    }

    if (mockWriter.count() !== 1) {
      throw new Error('Should store journal');
    }
  });

  await test('Journal: Collector batches blocks', async () => {
    const collector = new JournalCollector({
      enabled: true,
      batchSize: 2,
      delayAfterKDepthMs: 10,
      adapters: ['mock'],
    });

    const mockWriter = new MockJournalWriter({ writeDelay: 10 });
    collector.registerWriter(mockWriter);

    // Add blocks
    collector.addKDepthBlock({
      hash: 'b1',
      height: 100n,
      timestamp: Date.now(),
      stateRootBefore: 'r0',
      stateRootAfter: 'r1',
      changes: [],
    });

    collector.addKDepthBlock({
      hash: 'b2',
      height: 101n,
      timestamp: Date.now(),
      stateRootBefore: 'r1',
      stateRootAfter: 'r2',
      changes: [],
    });

    // Flush to process
    await collector.flush();

    if (mockWriter.count() !== 1) {
      throw new Error(`Expected 1 journal, got ${mockWriter.count()}`);
    }
  });

  // ============================================================
  // Sync Service Tests
  // ============================================================
  console.log('\n--- Sync Service ---');

  test('Sync: Initial state is IDLE', () => {
    const adapter = new InMemoryChainStore();
    const store = new ChainStore(adapter);
    const sync = new SyncService(store);

    if (sync.getState() !== SyncState.IDLE) {
      throw new Error(`Expected IDLE, got ${sync.getState()}`);
    }
  });

  test('Sync: Starts in HEADERS state', async () => {
    const adapter = new InMemoryChainStore();
    const store = new ChainStore(adapter);
    const sync = new SyncService(store);

    await sync.start();

    if (sync.getState() !== SyncState.HEADERS) {
      throw new Error(`Expected HEADERS, got ${sync.getState()}`);
    }

    sync.stop();
  });

  test('Sync: Register and remove peers', () => {
    const adapter = new InMemoryChainStore();
    const store = new ChainStore(adapter);
    const sync = new SyncService(store);

    sync.registerPeer('peer1', 'hash1', 100n);
    sync.registerPeer('peer2', 'hash2', 200n);

    const progress = sync.getProgress();
    if (progress.networkHeight !== 200n) {
      throw new Error(`Expected network height 200, got ${progress.networkHeight}`);
    }

    sync.removePeer('peer2');
    // peer1 is still there
  });

  test('Sync: Build block locator', async () => {
    const adapter = new InMemoryChainStore();
    const store = new ChainStore(adapter);
    const sync = new SyncService(store);

    // Empty chain returns empty locator
    const locator = await sync.buildLocator();
    if (locator.hashes.length !== 0) {
      throw new Error(`Expected empty locator for empty chain`);
    }
  });

  test('Sync: Handle headers message', async () => {
    const adapter = new InMemoryChainStore();
    const store = new ChainStore(adapter);
    const sync = new SyncService(store);

    await sync.start();
    sync.registerPeer('peer1', 'tiphash', 10n);

    // Receive empty headers -> transitions to SYNCED
    await sync.handleHeaders('peer1', []);

    if (sync.getState() !== SyncState.SYNCED) {
      throw new Error(`Expected SYNCED after empty headers, got ${sync.getState()}`);
    }
  });

  test('Sync: Orphan pool management', async () => {
    const adapter = new InMemoryChainStore();
    const store = new ChainStore(adapter);
    const sync = new SyncService(store, { ...require('../sync/types').DEFAULT_SYNC_CONFIG, maxOrphans: 3 });

    // Manually check orphan count (internal state test)
    if (sync.getOrphanCount() !== 0) {
      throw new Error('Initial orphan count should be 0');
    }
  });

  test('Sync: P2P message helpers', () => {
    // Test message creation
    const getHeaders = createGetHeaders(['hash1', 'hash2'], 'stopHash', 100);
    if (getHeaders.type !== MessageType.GET_HEADERS) {
      throw new Error('Wrong message type');
    }
    if (getHeaders.locator.length !== 2) {
      throw new Error('Wrong locator length');
    }

    const headers = createHeaders([
      {
        hash: 'h1',
        parentHash: 'p1',
        height: '100',
        timestamp: Date.now(),
        target: 'ff'.repeat(32),
        nonce: '123',
        stateRoot: 'sr',
        txRoot: 'tr',
      },
    ]);
    if (headers.type !== MessageType.HEADERS) {
      throw new Error('Wrong message type');
    }
    if (headers.headers.length !== 1) {
      throw new Error('Wrong headers count');
    }

    const getBlocks = createGetBlocks(['b1', 'b2', 'b3']);
    if (getBlocks.type !== MessageType.GET_BLOCKS) {
      throw new Error('Wrong message type');
    }
    if (getBlocks.hashes.length !== 3) {
      throw new Error('Wrong hashes count');
    }
  });

  // ============================================================
  // Mempool Reconciler Tests
  // ============================================================
  console.log('\n--- Mempool Reconciler ---');

  test('Reconciler: Block commit removes txs', () => {
    const store = new MempoolStore({
      maxPoolSize: 1000,
      maxTxBytes: 10000,
      maxTxPerSender: 100,
    });
    const pendingIndex = new PendingIndex();
    const reconciler = new MempoolReconciler(store, pendingIndex);

    // Add a tx to mempool
    const tx = { from: 'gc1test', nonce: 0, data: 'test' };
    const addResult = store.add(tx);
    if (!addResult.ok || !addResult.id) {
      throw new Error('Failed to add tx to mempool');
    }

    // Commit block containing this tx
    const result = reconciler.onBlockCommit({
      hash: 'block1',
      height: 1n,
      txIds: [addResult.id],
      senderNonces: new Map([['gc1test', 0n]]),
    });

    if (result.removed.length !== 1) {
      throw new Error(`Expected 1 removed, got ${result.removed.length}`);
    }

    if (store.has(addResult.id)) {
      throw new Error('Tx should be removed from mempool');
    }
  });

  test('Reconciler: Syncs with Pending Index', () => {
    const store = new MempoolStore({
      maxPoolSize: 1000,
      maxTxBytes: 10000,
      maxTxPerSender: 100,
    });
    const pendingIndex = new PendingIndex();
    const reconciler = new MempoolReconciler(store, pendingIndex);

    // Set initial base nonce
    pendingIndex.setBaseNonce('gc1sync', 0n);

    // Add tx to mempool and pending index
    const tx = { from: 'gc1sync', nonce: 0, data: 'test' };
    store.add(tx);

    // Sync mempool to pending index
    reconciler.fullSync();

    // After sync, pending index should have the tx
    const stats = pendingIndex.getStats();
    if (stats.totalTxs !== 1) {
      throw new Error(`Expected 1 pending tx, got ${stats.totalTxs}`);
    }
  });

  test('Reconciler: Stats tracking', () => {
    const store = new MempoolStore({
      maxPoolSize: 1000,
      maxTxBytes: 10000,
      maxTxPerSender: 100,
    });
    const reconciler = new MempoolReconciler(store, null);

    // Add some txs
    store.add({ from: 'gc1a', nonce: 0, data: 'a' });
    store.add({ from: 'gc1b', nonce: 0, data: 'b' });

    const stats = reconciler.getStats();
    if (stats.mempoolStats.totalTxs !== 2) {
      throw new Error(`Expected 2 txs, got ${stats.mempoolStats.totalTxs}`);
    }
    if (stats.orphanedTxCount !== 0) {
      throw new Error(`Expected 0 orphaned txs, got ${stats.orphanedTxCount}`);
    }
  });

  // ============================================================
  // Journal Finalizer Tests
  // ============================================================
  console.log('\n--- Journal Finalizer ---');

  test('Finalizer: Initialize with collector', () => {
    const collector = new JournalCollector({
      enabled: true,
      batchSize: 2,
      delayAfterKDepthMs: 100,
      adapters: ['mock'],
    });

    const finalizer = new JournalFinalizer(collector, null, null);

    const state = finalizer.getCollectorState();
    if (state.totalWritten !== 0) {
      throw new Error(`Expected 0 written, got ${state.totalWritten}`);
    }
  });

  test('Finalizer: Checkpoint management', () => {
    const collector = new JournalCollector({ enabled: true, batchSize: 2, delayAfterKDepthMs: 100, adapters: [] });
    const finalizer = new JournalFinalizer(collector, null, null);

    // Initial checkpoint
    const cp1 = finalizer.getCheckpoint();
    if (cp1.totalFinalized !== 0) {
      throw new Error(`Expected 0 finalized, got ${cp1.totalFinalized}`);
    }

    // Load checkpoint
    finalizer.loadCheckpoint({
      lastHeight: 100n,
      lastJournalId: 'journal123',
      timestamp: Date.now(),
      totalFinalized: 5,
    });

    const cp2 = finalizer.getCheckpoint();
    if (cp2.totalFinalized !== 5) {
      throw new Error(`Expected 5 finalized after load, got ${cp2.totalFinalized}`);
    }
    if (cp2.lastHeight !== 100n) {
      throw new Error(`Expected height 100, got ${cp2.lastHeight}`);
    }
  });

  test('Finalizer: Retry stats', () => {
    const collector = new JournalCollector({ enabled: true, batchSize: 2, delayAfterKDepthMs: 100, adapters: [] });
    const finalizer = new JournalFinalizer(collector, null, null);

    const retryStats = finalizer.getRetryStats();
    if (retryStats.pending !== 0) {
      throw new Error(`Expected 0 pending retries, got ${retryStats.pending}`);
    }
  });

  // ============================================================
  // SSE Hardening Tests
  // ============================================================
  console.log('\n--- SSE Hardening ---');

  test('TokenBucket: Rate limiting', () => {
    const bucket = new TokenBucket(10, 10); // 10 tokens, 10/sec refill

    // Should allow first 10
    for (let i = 0; i < 10; i++) {
      if (!bucket.consume()) {
        throw new Error(`Should allow token ${i}`);
      }
    }

    // Should deny after exhaustion
    if (bucket.consume()) {
      throw new Error('Should deny when exhausted');
    }
  });

  test('ConnectionManager: Track connections', () => {
    const manager = new ConnectionManager();

    manager.register('client1');
    manager.register('client2');

    const stats = manager.getStats();
    if (stats.totalConnections !== 2) {
      throw new Error(`Expected 2 connections, got ${stats.totalConnections}`);
    }

    manager.unregister('client1');
    const stats2 = manager.getStats();
    if (stats2.totalConnections !== 1) {
      throw new Error(`Expected 1 connection after unregister, got ${stats2.totalConnections}`);
    }
  });

  test('ConnectionManager: Health tracking', () => {
    const manager = new ConnectionManager();

    manager.register('healthClient');
    manager.recordSend('healthClient', 50);
    manager.recordSend('healthClient', 100);

    const avgLatency = manager.getAverageLatency('healthClient');
    if (avgLatency !== 75) {
      throw new Error(`Expected avg latency 75ms, got ${avgLatency}`);
    }

    const health = manager.getHealth('healthClient');
    if (!health || health.eventsSent !== 2) {
      throw new Error(`Expected 2 events sent`);
    }
  });

  test('DegradationController: Mode transitions', () => {
    const controller = new DegradationController();

    if (controller.getMode() !== DegradationMode.NORMAL) {
      throw new Error('Should start in NORMAL mode');
    }

    // Simulate high CPU
    controller.updateMetrics(75, 0);
    if (controller.getMode() !== DegradationMode.LIGHT) {
      throw new Error('Should be LIGHT at 75% CPU');
    }

    controller.updateMetrics(90, 0);
    if (controller.getMode() !== DegradationMode.HEAVY) {
      throw new Error('Should be HEAVY at 90% CPU');
    }

    controller.updateMetrics(96, 0);
    if (controller.getMode() !== DegradationMode.CRITICAL) {
      throw new Error('Should be CRITICAL at 96% CPU');
    }
  });

  test('DegradationController: Event filtering', () => {
    const controller = new DegradationController();

    // In NORMAL, all events should pass
    if (!controller.shouldDeliver('preflight_ok')) {
      throw new Error('NORMAL should deliver preflight_ok');
    }

    // In HEAVY, only essential
    controller.forceMode(DegradationMode.HEAVY);
    if (controller.shouldDeliver('preflight_ok')) {
      throw new Error('HEAVY should NOT deliver preflight_ok');
    }
    if (!controller.shouldDeliver('cross_chain_final')) {
      throw new Error('HEAVY should deliver cross_chain_final');
    }
  });

  // ============================================================
  // Warm Mirror Tests
  // ============================================================
  console.log('\n--- Warm Mirror ---');

  test('WarmMirrorCache: Basic get/set', () => {
    const cache = new WarmMirrorCache({ maxEntries: 100 });

    cache.set('state1', 'value1', 'v1', 100n);

    const entry = cache.get('state1');
    if (!entry) {
      throw new Error('Should retrieve cached entry');
    }
    if (entry.value !== 'value1') {
      throw new Error(`Expected value1, got ${entry.value}`);
    }
    if (entry.version !== 'v1') {
      throw new Error(`Expected version v1, got ${entry.version}`);
    }
  });

  test('WarmMirrorCache: LRU eviction', () => {
    const cache = new WarmMirrorCache({ maxEntries: 3 });

    cache.set('s1', 'v1', 'ver1', 100n);
    cache.set('s2', 'v2', 'ver2', 100n);
    cache.set('s3', 'v3', 'ver3', 100n);

    // Access s1 to make it recently used
    cache.get('s1');

    // Add s4, should evict s2 (least recently used)
    cache.set('s4', 'v4', 'ver4', 100n);

    if (!cache.get('s1')) {
      throw new Error('s1 should still exist (was accessed)');
    }
    if (cache.get('s2')) {
      throw new Error('s2 should be evicted (LRU)');
    }
    if (!cache.get('s3')) {
      throw new Error('s3 should still exist');
    }
    if (!cache.get('s4')) {
      throw new Error('s4 should exist');
    }
  });

  test('WarmMirrorCache: Stats tracking', () => {
    const cache = new WarmMirrorCache({ maxEntries: 100 });

    cache.set('hit1', 'v1', 'ver1', 100n);

    // Hit
    cache.get('hit1');
    cache.get('hit1');

    // Miss
    cache.get('nonexistent');

    const stats = cache.getStats();
    if (stats.hits !== 2) {
      throw new Error(`Expected 2 hits, got ${stats.hits}`);
    }
    if (stats.misses !== 1) {
      throw new Error(`Expected 1 miss, got ${stats.misses}`);
    }
    if (stats.hitRatio < 0.66 || stats.hitRatio > 0.67) {
      throw new Error(`Expected ~0.67 hit ratio, got ${stats.hitRatio}`);
    }
  });

  await test('WarmMirrorCache: Prefetch with provider', async () => {
    const mockProvider: StateProvider = {
      getState: async (stateId: string) => ({ value: `val-${stateId}`, version: 'v1' }),
      getStates: async (stateIds: string[]) => {
        const map = new Map<string, { value: string; version: string }>();
        for (const id of stateIds) {
          map.set(id, { value: `val-${id}`, version: 'v1' });
        }
        return map;
      },
      getCurrentHeader: () => ({ hash: 'header123', height: 500n }),
    };

    const cache = new WarmMirrorCache({ maxEntries: 100, prefetchBudgetMs: 1000 });
    cache.setProvider(mockProvider);

    const result = await cache.prefetch({ stateIds: ['state1', 'state2', 'state3'] });

    if (!result.complete) {
      throw new Error('Prefetch should complete');
    }
    if (result.fetched.size !== 3) {
      throw new Error(`Expected 3 fetched, got ${result.fetched.size}`);
    }
    if (result.failed.length !== 0) {
      throw new Error(`Expected 0 failed, got ${result.failed.length}`);
    }

    // Now cache should have the entries
    const entry = cache.get('state1');
    if (!entry || entry.value !== 'val-state1') {
      throw new Error('state1 should be cached after prefetch');
    }
  });

  test('WarmMirrorCache: Invalidation', () => {
    const cache = new WarmMirrorCache({ maxEntries: 100 });

    cache.set('inv1', 'v1', 'ver1', 100n);
    cache.set('inv2', 'v2', 'ver2', 100n);
    cache.set('inv3', 'v3', 'ver3', 100n);

    if (!cache.get('inv1')) {
      throw new Error('inv1 should exist before invalidation');
    }

    cache.invalidate('inv1');

    if (cache.get('inv1')) {
      throw new Error('inv1 should be invalidated');
    }

    // Batch invalidation
    const count = cache.invalidateMany(['inv2', 'inv3', 'nonexistent']);
    if (count !== 2) {
      throw new Error(`Expected 2 invalidated, got ${count}`);
    }
  });

  test('WarmMirrorCache: Create stamp', () => {
    const mockProvider: StateProvider = {
      getState: async () => null,
      getStates: async () => new Map(),
      getCurrentHeader: () => ({ hash: 'stampHeader123', height: 600n }),
    };

    const cache = new WarmMirrorCache({ maxEntries: 100 });
    cache.setProvider(mockProvider);

    cache.set('stampState1', 'val1', 'ver1', 600n);
    cache.set('stampState2', 'val2', 'ver2', 600n);

    const stamp = cache.createStamp(['stampState1', 'stampState2']);
    if (!stamp) {
      throw new Error('Should create stamp');
    }
    if (stamp.headerHash !== 'stampHeader123') {
      throw new Error(`Expected headerHash stampHeader123, got ${stamp.headerHash}`);
    }
    if (stamp.height !== 600n) {
      throw new Error(`Expected height 600, got ${stamp.height}`);
    }
    if (!stamp.readsHash || !stamp.pairsHash) {
      throw new Error('Stamp should have readsHash and pairsHash');
    }
  });

  // ============================================================
  // Indexer Tests
  // ============================================================
  console.log('\n--- Indexer ---');

  test('Indexer: Index block and get tx', () => {
    const indexer = new Indexer({ maxIndexedTxs: 1000, maxStateChanges: 5000 });

    const block: BlockToIndex = {
      hash: 'block1',
      height: 100n,
      timestamp: Date.now(),
      transactions: [
        { txId: 'tx1', from: 'alice', nonce: 0n, statesTouched: ['state1'], success: true },
        { txId: 'tx2', from: 'bob', nonce: 0n, statesTouched: ['state1', 'state2'], success: true },
      ],
      stateChanges: [
        { stateId: 'state1', txId: 'tx1', prevValue: null, newValue: 'val1', prevVersion: null, newVersion: 'v1' },
      ],
    };

    indexer.indexBlock(block);

    const tx = indexer.getTx('tx1');
    if (!tx) {
      throw new Error('Should retrieve indexed tx');
    }
    if (tx.from !== 'alice') {
      throw new Error(`Expected alice, got ${tx.from}`);
    }
    if (tx.blockHeight !== 100n) {
      throw new Error(`Expected height 100, got ${tx.blockHeight}`);
    }
  });

  test('Indexer: Search by sender', () => {
    const indexer = new Indexer({ maxIndexedTxs: 1000 });

    indexer.indexBlock({
      hash: 'blk1', height: 100n, timestamp: 1000,
      transactions: [
        { txId: 'tx1', from: 'alice', nonce: 0n, statesTouched: [], success: true },
        { txId: 'tx2', from: 'alice', nonce: 1n, statesTouched: [], success: true },
        { txId: 'tx3', from: 'bob', nonce: 0n, statesTouched: [], success: true },
      ],
      stateChanges: [],
    });

    const aliceTxs = indexer.getTxsBySender('alice');
    if (aliceTxs.length !== 2) {
      throw new Error(`Expected 2 txs for alice, got ${aliceTxs.length}`);
    }

    const bobTxs = indexer.getTxsBySender('bob');
    if (bobTxs.length !== 1) {
      throw new Error(`Expected 1 tx for bob, got ${bobTxs.length}`);
    }
  });

  test('Indexer: Search by state', () => {
    const indexer = new Indexer({ maxIndexedTxs: 1000 });

    indexer.indexBlock({
      hash: 'blk1', height: 100n, timestamp: 1000,
      transactions: [
        { txId: 'tx1', from: 'alice', nonce: 0n, statesTouched: ['stateA', 'stateB'], success: true },
        { txId: 'tx2', from: 'bob', nonce: 0n, statesTouched: ['stateA'], success: true },
        { txId: 'tx3', from: 'carol', nonce: 0n, statesTouched: ['stateC'], success: true },
      ],
      stateChanges: [],
    });

    const stateATxs = indexer.getTxsByState('stateA');
    if (stateATxs.length !== 2) {
      throw new Error(`Expected 2 txs touching stateA, got ${stateATxs.length}`);
    }

    const stateBTxs = indexer.getTxsByState('stateB');
    if (stateBTxs.length !== 1) {
      throw new Error(`Expected 1 tx touching stateB, got ${stateBTxs.length}`);
    }
  });

  test('Indexer: State history', () => {
    const indexer = new Indexer({ maxIndexedTxs: 1000, maxStateChanges: 5000 });

    indexer.indexBlock({
      hash: 'blk1', height: 100n, timestamp: 1000,
      transactions: [{ txId: 'tx1', from: 'alice', nonce: 0n, statesTouched: ['counter'], success: true }],
      stateChanges: [{ stateId: 'counter', txId: 'tx1', prevValue: null, newValue: '1', prevVersion: null, newVersion: 'v1' }],
    });

    indexer.indexBlock({
      hash: 'blk2', height: 101n, timestamp: 2000,
      transactions: [{ txId: 'tx2', from: 'bob', nonce: 0n, statesTouched: ['counter'], success: true }],
      stateChanges: [{ stateId: 'counter', txId: 'tx2', prevValue: '1', newValue: '2', prevVersion: 'v1', newVersion: 'v2' }],
    });

    const history = indexer.getStateHistory('counter');
    if (history.length !== 2) {
      throw new Error(`Expected 2 history entries, got ${history.length}`);
    }
    // Most recent first
    if (history[0].newValue !== '2') {
      throw new Error(`Expected newest change first with value '2', got ${history[0].newValue}`);
    }
  });

  test('Indexer: Search with filters', () => {
    const indexer = new Indexer({ maxIndexedTxs: 1000 });

    indexer.indexBlock({
      hash: 'blk1', height: 100n, timestamp: 1000,
      transactions: [
        { txId: 'tx1', from: 'alice', nonce: 0n, statesTouched: [], success: true },
        { txId: 'tx2', from: 'alice', nonce: 1n, statesTouched: [], success: false },
      ],
      stateChanges: [],
    });

    indexer.indexBlock({
      hash: 'blk2', height: 200n, timestamp: 2000,
      transactions: [
        { txId: 'tx3', from: 'alice', nonce: 2n, statesTouched: [], success: true },
      ],
      stateChanges: [],
    });

    // Search successful txs only
    const successResult = indexer.searchTxs({ from: 'alice', success: true });
    if (successResult.total !== 2) {
      throw new Error(`Expected 2 successful txs, got ${successResult.total}`);
    }

    // Search by height range
    const heightResult = indexer.searchTxs({ from: 'alice', heightFrom: 150n });
    if (heightResult.total !== 1) {
      throw new Error(`Expected 1 tx above height 150, got ${heightResult.total}`);
    }
  });

  test('Indexer: Handle reorg', () => {
    const indexer = new Indexer({ maxIndexedTxs: 1000, maxStateChanges: 5000 });

    // Index blocks at heights 100, 101, 102
    for (let i = 0; i < 3; i++) {
      indexer.indexBlock({
        hash: `blk${i}`, height: BigInt(100 + i), timestamp: 1000 + i * 1000,
        transactions: [{ txId: `tx${i}`, from: 'alice', nonce: BigInt(i), statesTouched: [], success: true }],
        stateChanges: [],
      });
    }

    const stats1 = indexer.getStats();
    if (stats1.totalTxs !== 3) {
      throw new Error(`Expected 3 txs before reorg, got ${stats1.totalTxs}`);
    }

    // Reorg at height 100 (remove 101, 102)
    const removed = indexer.handleReorg(100n);
    if (removed !== 2) {
      throw new Error(`Expected 2 removed, got ${removed}`);
    }

    const stats2 = indexer.getStats();
    if (stats2.totalTxs !== 1) {
      throw new Error(`Expected 1 tx after reorg, got ${stats2.totalTxs}`);
    }
  });

  test('Indexer: Stats tracking', () => {
    const indexer = new Indexer({ maxIndexedTxs: 1000, maxStateChanges: 5000 });

    indexer.indexBlock({
      hash: 'blk1', height: 100n, timestamp: 1000,
      transactions: [
        { txId: 'tx1', from: 'alice', nonce: 0n, statesTouched: ['s1'], success: true },
        { txId: 'tx2', from: 'bob', nonce: 0n, statesTouched: ['s1', 's2'], success: true },
      ],
      stateChanges: [
        { stateId: 's1', txId: 'tx1', prevValue: null, newValue: 'v1', prevVersion: null, newVersion: 'ver1' },
      ],
    });

    const stats = indexer.getStats();
    if (stats.totalTxs !== 2) {
      throw new Error(`Expected 2 txs, got ${stats.totalTxs}`);
    }
    if (stats.uniqueSenders !== 2) {
      throw new Error(`Expected 2 unique senders, got ${stats.uniqueSenders}`);
    }
    if (stats.uniqueStates !== 2) {
      throw new Error(`Expected 2 unique states, got ${stats.uniqueStates}`);
    }
    if (stats.totalStateChanges !== 1) {
      throw new Error(`Expected 1 state change, got ${stats.totalStateChanges}`);
    }
  });

  // ============================================================
  // Identity Service Tests
  // ============================================================
  console.log('\n--- Identity Service ---');

  test('Identity: Register and retrieve', () => {
    const identity = new IdentityService();

    const id = identity.registerIdentity(
      'gc1alice123456789',
      'ed25519',
      'sha256',
      100n,
      Date.now(),
      'pubkey123'
    );

    if (id.address !== 'gc1alice123456789') {
      throw new Error(`Expected address gc1alice123456789, got ${id.address}`);
    }

    const retrieved = identity.getIdentity('gc1alice123456789');
    if (!retrieved) {
      throw new Error('Should retrieve identity');
    }
    if (retrieved.sigAlg !== 'ed25519') {
      throw new Error(`Expected sigAlg ed25519, got ${retrieved.sigAlg}`);
    }
  });

  test('Identity: Record signature events', () => {
    const identity = new IdentityService();

    identity.recordSignatureEvent({
      type: 'SIGN',
      address: 'gc1signer',
      digest: '0x' + '00'.repeat(32),
      txId: 'tx1',
      blockHash: 'block1',
      blockHeight: 100n,
      timestamp: Date.now(),
    });

    identity.recordSignatureEvent({
      type: 'VERIFY',
      address: 'gc1verifier',
      digest: '0x' + '00'.repeat(32),
      txId: 'tx2',
      blockHash: 'block1',
      blockHeight: 100n,
      timestamp: Date.now(),
    });

    const byAddr = identity.getSignaturesByAddress('gc1signer');
    if (byAddr.length !== 1) {
      throw new Error(`Expected 1 event for signer, got ${byAddr.length}`);
    }

    const stats = identity.getStats();
    if (stats.totalEvents !== 2) {
      throw new Error(`Expected 2 total events, got ${stats.totalEvents}`);
    }
  });

  // ============================================================
  // Compiler API Tests
  // ============================================================
  console.log('\n--- Compiler API ---');

  test('Compiler: Compile DSL', () => {
    const compiler = new CompilerService({ cacheEnabled: true });

    const result = compiler.compile({ dsl: 'SYS.REG\nSYS.INIT' });

    if (!result.ok) {
      throw new Error(`Compilation failed: ${result.error}`);
    }
    if (!result.programHex) {
      throw new Error('Expected programHex');
    }
    if (!result.instructionsHash) {
      throw new Error('Expected instructionsHash');
    }
  });

  test('Compiler: Cache hit', () => {
    const compiler = new CompilerService({ cacheEnabled: true });

    const dsl = 'SYS.REG\nSYS.VERIFY';
    compiler.compile({ dsl });
    const result2 = compiler.compile({ dsl });

    const stats = compiler.getStats();
    if (stats.cacheHits < 1) {
      throw new Error('Expected cache hit');
    }
  });

  test('Compiler: List schemas', () => {
    const compiler = new CompilerService();

    const schemas = compiler.listSchemas();
    if (schemas.length === 0) {
      throw new Error('Expected some schemas');
    }
    if (!schemas.includes('SYS.REG@v1')) {
      throw new Error('Expected SYS.REG@v1 schema');
    }
  });

  test('Program Cache: LRU eviction', () => {
    const cache = new ProgramCache({ cacheMax: 2, cacheTtlMs: 60000 });

    cache.set('dsl1', 'prog1', 'hash1', 100n);
    cache.set('dsl2', 'prog2', 'hash2', 100n);

    // Access hash1 to make it recently used
    cache.getByHash('hash1');

    // Add third entry, should evict hash2
    cache.set('dsl3', 'prog3', 'hash3', 100n);

    if (!cache.has('hash1')) {
      throw new Error('hash1 should still exist');
    }
    if (cache.has('hash2')) {
      throw new Error('hash2 should be evicted');
    }
    if (!cache.has('hash3')) {
      throw new Error('hash3 should exist');
    }
  });

  // ============================================================
  // Economics Tests
  // ============================================================
  console.log('\n--- Economics ---');

  test('Gas: Estimate gas', () => {
    const gas = estimateGas({
      programHex: '0x' + '00'.repeat(100),
      instructions: [
        { selector: 'SYS.REG' },
        { selector: 'SYS.UPDATE', args: { patch: { op: 'put', totalBytes: 64 } } },
      ],
    });

    if (gas <= 0n) {
      throw new Error('Expected positive gas');
    }
  });

  test('Gas: Meter tracks usage', () => {
    const meter = new GasMeter(10000n);

    meter.charge({ selector: 'SYS.REG' });
    meter.charge({ selector: 'SYS.VERIFY', args: { algo: 'ed25519' } });

    if (meter.getUsed() <= 0n) {
      throw new Error('Expected used gas > 0');
    }
    if (meter.getRemaining() >= 10000n) {
      throw new Error('Expected remaining < limit');
    }
  });

  test('Gas: Meter throws on OOG', () => {
    const meter = new GasMeter(100n);

    let threw = false;
    try {
      meter.chargeRaw(200n);
    } catch (e: any) {
      if (e.message === 'OOG') threw = true;
    }

    if (!threw) {
      throw new Error('Expected OOG error');
    }
  });

  test('Balances: Credit and debit', async () => {
    const balances = new InMemoryBalanceStore();

    await balances.credit('alice', 1000n);

    const bal = await balances.get('alice');
    if (bal !== 1000n) {
      throw new Error(`Expected 1000, got ${bal}`);
    }

    const debitOk = await balances.debit('alice', 300n);
    if (!debitOk) {
      throw new Error('Debit should succeed');
    }

    const bal2 = await balances.get('alice');
    if (bal2 !== 700n) {
      throw new Error(`Expected 700, got ${bal2}`);
    }

    const debitFail = await balances.debit('alice', 1000n);
    if (debitFail) {
      throw new Error('Debit should fail for insufficient funds');
    }
  });

  test('Balances: Transfer', async () => {
    const balances = new InMemoryBalanceStore();

    await balances.credit('alice', 500n);
    const ok = await balances.transfer('alice', 'bob', 200n);

    if (!ok) {
      throw new Error('Transfer should succeed');
    }

    const aliceBal = await balances.get('alice');
    const bobBal = await balances.get('bob');

    if (aliceBal !== 300n) {
      throw new Error(`Expected alice 300, got ${aliceBal}`);
    }
    if (bobBal !== 200n) {
      throw new Error(`Expected bob 200, got ${bobBal}`);
    }
  });

  await test('Fees: Quote and charge', async () => {
    const balances = new InMemoryBalanceStore();
    await balances.credit('gc1payer', 10000n);

    const feeService = new FeeService(balances, { enabled: true, minGasPrice: 1n });

    const quote = await feeService.quoteFee({ programHex: '0x' + '00'.repeat(50) });
    if (quote.gasEstimate <= 0n) {
      throw new Error('Expected positive gas estimate');
    }

    const result = await feeService.chargeAndDistribute({
      feePayer: 'gc1payer',
      from: 'gc1payer',
      maxGas: 5000n,
      gasPrice: 1n,
      gasInput: { programHex: '0x' + '00'.repeat(50) },
    }, 'gc1miner');

    if (result.feePaid <= 0n) {
      throw new Error('Expected positive fee paid');
    }

    const minerBal = await balances.get('gc1miner');
    if (minerBal <= 0n) {
      throw new Error('Miner should receive credits');
    }
  });

  await test('Rent: Register and collect', async () => {
    const rentStore = new InMemoryRentStore();
    const balances = new InMemoryBalanceStore();
    await balances.credit('gc1payer', 1000n);

    const collector = new RentCollector(rentStore, balances, {
      enabled: true,
      collectEvery: 10,
      defaultPerBlock: 5n,
    });

    await collector.registerRent('0x' + '00'.repeat(32) as `0x${string}`, 'gc1payer', 5n, 0n);

    // Collect at block 10
    const result = await collector.collectRent(10n);

    if (result.charged !== 1) {
      throw new Error(`Expected 1 charged, got ${result.charged}`);
    }

    const payerBal = await balances.get('gc1payer');
    if (payerBal !== 995n) {
      throw new Error(`Expected 995 after rent, got ${payerBal}`);
    }
  });

  // ============================================================
  // Tx v2F Tests
  // ============================================================
  console.log('\n--- Tx v2F ---');

  test('Tx v2F: Build preimage', () => {
    const preimage = buildPreimage({
      version: 3,
      from: 'gc1' + '00'.repeat(22),
      nonce: 1n,
      instructionsHash: '0x' + '00'.repeat(32) as `0x${string}`,
      readsHash: '0x' + '00'.repeat(32) as `0x${string}`,
      locksHash: '0x' + '00'.repeat(32) as `0x${string}`,
      maxGas: 10000n,
      gasPrice: 1n,
      feePayer: 'gc1' + '00'.repeat(22),
    });

    // Expected size: 4 + 22 + 8 + 32 + 32 + 32 + 8 + 8 + 22 + 22 = 190 bytes
    if (preimage.length !== 190) {
      throw new Error(`Expected preimage length 190, got ${preimage.length}`);
    }
  });

  test('Tx v2F: Integrity hash is deterministic', () => {
    const preimage1 = buildPreimage({
      version: 3,
      from: 'gc1' + 'aa'.repeat(19),
      nonce: 5n,
      instructionsHash: '0x' + 'bb'.repeat(32) as `0x${string}`,
      readsHash: '0x' + 'cc'.repeat(32) as `0x${string}`,
      locksHash: '0x' + 'dd'.repeat(32) as `0x${string}`,
      maxGas: 5000n,
      gasPrice: 2n,
      feePayer: 'gc1' + 'aa'.repeat(19),
    });

    const preimage2 = buildPreimage({
      version: 3,
      from: 'gc1' + 'aa'.repeat(19),
      nonce: 5n,
      instructionsHash: '0x' + 'bb'.repeat(32) as `0x${string}`,
      readsHash: '0x' + 'cc'.repeat(32) as `0x${string}`,
      locksHash: '0x' + 'dd'.repeat(32) as `0x${string}`,
      maxGas: 5000n,
      gasPrice: 2n,
      feePayer: 'gc1' + 'aa'.repeat(19),
    });

    const hash1 = computeIntegrityHash(preimage1);
    const hash2 = computeIntegrityHash(preimage2);

    if (hash1 !== hash2) {
      throw new Error('Integrity hash should be deterministic');
    }
  });

  test('Tx v2F: Validate structure', () => {
    const validTx = createSampleTxV2F({
      from: 'gc1' + '00'.repeat(22),
      nonce: 1n,
    });

    const result = validateTxV2FStructure(validTx);
    if (!result.ok) {
      throw new Error(`Validation should pass: ${result.code}`);
    }

    // Test invalid tx
    const invalidResult = validateTxV2FStructure({ version: 1 });
    if (invalidResult.ok) {
      throw new Error('Validation should fail for invalid tx');
    }
  });

  // ============================================================
  // Runner Profiles Tests
  // ============================================================
  console.log('\n--- Runner Profiles ---');

  test('Profiles: Load dev profile', () => {
    const { getProfile, DEV_PROFILE } = require('../runner');
    const profile = getProfile('dev');
    if (!profile) {
      throw new Error('Dev profile should exist');
    }
    if (profile.name !== 'dev') {
      throw new Error('Profile name should be dev');
    }
  });

  test('Profiles: List all profiles', () => {
    const { listProfiles } = require('../runner');
    const profiles = listProfiles();
    if (profiles.length < 4) {
      throw new Error('Should have at least 4 profiles');
    }
  });

  test('Profiles: Merge config', () => {
    const { mergeConfig, DEV_PROFILE } = require('../runner');
    const merged = mergeConfig(DEV_PROFILE.config, {
      services: { validator: { port: 9999 } }
    });
    if (merged.services.validator.port !== 9999) {
      throw new Error('Config merge should override port');
    }
  });

  // ============================================================
  // Observability Tests
  // ============================================================
  console.log('\n--- Observability ---');

  test('Health: Register and run checks', async () => {
    const { HealthService } = require('../observability');
    const health = new HealthService('0.1.0');

    health.register('test-check', async () => ({ healthy: true, message: 'OK' }));

    const result = await health.getHealth();
    if (result.status !== 'healthy') {
      throw new Error('Health should be healthy');
    }
    if (result.components.length !== 1) {
      throw new Error('Should have one component');
    }
  });

  test('Health: Readiness check', async () => {
    const { HealthService } = require('../observability');
    const health = new HealthService('0.1.0');

    health.register('db', async () => ({ healthy: true }));

    const readiness = await health.getReadiness();
    if (!readiness.ready) {
      throw new Error('Should be ready');
    }
  });

  test('Health: Liveness check', () => {
    const { HealthService } = require('../observability');
    const health = new HealthService('0.1.0');

    const liveness = health.getLiveness();
    if (!liveness.alive) {
      throw new Error('Should be alive');
    }
  });

  test('Metrics: Counter and gauge', () => {
    const { MetricsRegistry } = require('../observability');
    const metrics = new MetricsRegistry();

    const counter = metrics.counter('requests');
    counter.inc();
    counter.inc(5);
    if (counter.get() !== 6) {
      throw new Error('Counter should be 6');
    }

    const gauge = metrics.gauge('connections');
    gauge.set(10);
    gauge.dec(3);
    if (gauge.get() !== 7) {
      throw new Error('Gauge should be 7');
    }
  });

  test('Metrics: Histogram', () => {
    const { MetricsRegistry } = require('../observability');
    const metrics = new MetricsRegistry();

    const histogram = metrics.histogram('latency');
    histogram.observe(10);
    histogram.observe(20);
    histogram.observe(30);

    const snap = histogram.getSnapshot();
    if (snap.count !== 3) {
      throw new Error('Histogram count should be 3');
    }
    if (snap.sum !== 60) {
      throw new Error('Histogram sum should be 60');
    }
  });

  // ============================================================
  // Storage Tests
  // ============================================================
  console.log('\n--- Storage ---');

  test('Storage: MemoryStore basic ops', async () => {
    const { MemoryStore } = require('../storage');
    const store = new MemoryStore();

    await store.put('key1', Buffer.from('value1'));
    const val = await store.get('key1');
    if (!val || val.toString() !== 'value1') {
      throw new Error('Should retrieve stored value');
    }

    if (!(await store.has('key1'))) {
      throw new Error('Should have key1');
    }

    await store.delete('key1');
    if (await store.has('key1')) {
      throw new Error('Should not have key1 after delete');
    }
  });

  test('Storage: Batch operations', async () => {
    const { MemoryStore } = require('../storage');
    const store = new MemoryStore();

    await store.batch([
      { type: 'put', key: 'a', value: Buffer.from('1') },
      { type: 'put', key: 'b', value: Buffer.from('2') },
      { type: 'put', key: 'c', value: Buffer.from('3') },
    ]);

    const results = await store.multiGet(['a', 'b', 'c']);
    if (results.size !== 3) {
      throw new Error('Should have 3 results');
    }
  });

  test('Storage: Snapshot isolation', async () => {
    const { MemoryStore } = require('../storage');
    const store = new MemoryStore();

    await store.put('key', Buffer.from('original'));
    const snapshot = store.createSnapshot();

    await store.put('key', Buffer.from('modified'));

    const snapshotVal = await snapshot.get('key');
    const currentVal = await store.get('key');

    if (snapshotVal?.toString() !== 'original') {
      throw new Error('Snapshot should have original value');
    }
    if (currentVal?.toString() !== 'modified') {
      throw new Error('Current should have modified value');
    }

    snapshot.release();
  });

  test('Storage: RocksDB stub opens', async () => {
    const { createRocksDBStore } = require('../storage');
    const store = await createRocksDBStore({ path: './test-db' });

    await store.put('test', Buffer.from('value'));
    const val = await store.get('test');
    if (!val) {
      throw new Error('RocksDB stub should work');
    }

    await store.close();
  });

  test('Storage: Snapshot manager', async () => {
    const { MemoryStore, SnapshotManager } = require('../storage');
    const store = new MemoryStore();
    const manager = new SnapshotManager(store);

    await store.put('state:1', Buffer.from('val1'));
    await store.put('state:2', Buffer.from('val2'));

    const meta = await manager.createSnapshot(100n, 'blockhash123');
    if (meta.keyCount !== 2) {
      throw new Error('Snapshot should have 2 keys');
    }
    if (meta.height !== 100n) {
      throw new Error('Snapshot height should be 100');
    }
  });

  // ============================================================
  // SLO Tests
  // ============================================================
  console.log('\n--- SLO ---');

  test('SLO: Check passing', () => {
    const { SLOChecker } = require('../bench/slo');
    const checker = new SLOChecker();

    const result = checker.check('hotwindow.has', { ops: 2_000_000, avgLatencyMs: 0.0005 });
    if (!result.passed) {
      throw new Error('SLO should pass');
    }
  });

  test('SLO: Check failing', () => {
    const { SLOChecker } = require('../bench/slo');
    const checker = new SLOChecker();

    const result = checker.check('hotwindow.has', { ops: 100, avgLatencyMs: 10 });
    if (result.passed) {
      throw new Error('SLO should fail');
    }
  });

  test('SLO: List by component', () => {
    const { SLOChecker } = require('../bench/slo');
    const checker = new SLOChecker();

    const hotwindowSlos = checker.listByComponent('HotWindow');
    if (hotwindowSlos.length < 5) {
      throw new Error('Should have at least 5 HotWindow SLOs');
    }
  });

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n' + '='.repeat(50));
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n🎉 All fast-path smoke tests passed!');
  }
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
