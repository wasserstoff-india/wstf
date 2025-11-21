/**
 * Hot Window & Pending Index Comprehensive Unit Tests
 *
 * Tests ring buffer, conflict detection, and preflight service.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HotWindow, HotWindowEntry } from './hotWindow';
import { PendingIndex, PendingEntry } from './pendingIndex';
import { PreflightService, PreflightRequest, PreflightResult } from './preflight';

describe('HotWindow', () => {
  let hotWindow: HotWindow;
  const DEFAULT_SIZE = 1000;

  beforeEach(() => {
    hotWindow = new HotWindow(DEFAULT_SIZE);
  });

  describe('Basic operations', () => {
    it('should add and retrieve entry by txId', () => {
      const entry: HotWindowEntry = {
        txId: 'tx1',
        from: 'gc1sender1',
        nonce: 1n,
        stateIds: ['state1'],
        receivedAt: Date.now(),
      };

      hotWindow.add(entry);
      const retrieved = hotWindow.getByTxId('tx1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.txId).toBe('tx1');
      expect(retrieved?.from).toBe('gc1sender1');
    });

    it('should return undefined for missing txId', () => {
      const result = hotWindow.getByTxId('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should query by sender', () => {
      hotWindow.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 1n,
        stateIds: [],
        receivedAt: Date.now(),
      });
      hotWindow.add({
        txId: 'tx2',
        from: 'gc1alice',
        nonce: 2n,
        stateIds: [],
        receivedAt: Date.now(),
      });
      hotWindow.add({
        txId: 'tx3',
        from: 'gc1bob',
        nonce: 1n,
        stateIds: [],
        receivedAt: Date.now(),
      });

      const aliceTxs = hotWindow.getBySender('gc1alice');
      const bobTxs = hotWindow.getBySender('gc1bob');

      expect(aliceTxs.length).toBe(2);
      expect(bobTxs.length).toBe(1);
    });

    it('should query by state', () => {
      hotWindow.add({
        txId: 'tx1',
        from: 'gc1sender',
        nonce: 1n,
        stateIds: ['stateA', 'stateB'],
        receivedAt: Date.now(),
      });
      hotWindow.add({
        txId: 'tx2',
        from: 'gc1sender',
        nonce: 2n,
        stateIds: ['stateB', 'stateC'],
        receivedAt: Date.now(),
      });

      const stateATxs = hotWindow.getByState('stateA');
      const stateBTxs = hotWindow.getByState('stateB');
      const stateCTxs = hotWindow.getByState('stateC');

      expect(stateATxs.length).toBe(1);
      expect(stateBTxs.length).toBe(2);
      expect(stateCTxs.length).toBe(1);
    });
  });

  describe('Ring buffer overflow', () => {
    it('should evict oldest entries when full', () => {
      const smallWindow = new HotWindow(5);

      // Add 5 entries
      for (let i = 0; i < 5; i++) {
        smallWindow.add({
          txId: `tx${i}`,
          from: 'gc1sender',
          nonce: BigInt(i),
          stateIds: [],
          receivedAt: Date.now() + i,
        });
      }

      // All 5 should exist
      expect(smallWindow.getByTxId('tx0')).toBeDefined();
      expect(smallWindow.getByTxId('tx4')).toBeDefined();

      // Add 6th entry - should evict tx0
      smallWindow.add({
        txId: 'tx5',
        from: 'gc1sender',
        nonce: 5n,
        stateIds: [],
        receivedAt: Date.now() + 5,
      });

      expect(smallWindow.getByTxId('tx0')).toBeUndefined();
      expect(smallWindow.getByTxId('tx5')).toBeDefined();
    });

    it('should maintain index consistency after eviction', () => {
      const smallWindow = new HotWindow(3);

      // Add entries with states
      smallWindow.add({
        txId: 'tx1',
        from: 'alice',
        nonce: 1n,
        stateIds: ['stateX'],
        receivedAt: 1,
      });
      smallWindow.add({
        txId: 'tx2',
        from: 'bob',
        nonce: 1n,
        stateIds: ['stateY'],
        receivedAt: 2,
      });
      smallWindow.add({
        txId: 'tx3',
        from: 'alice',
        nonce: 2n,
        stateIds: ['stateX'],
        receivedAt: 3,
      });

      // Evict tx1
      smallWindow.add({
        txId: 'tx4',
        from: 'charlie',
        nonce: 1n,
        stateIds: ['stateZ'],
        receivedAt: 4,
      });

      // Index should not contain evicted tx1
      const aliceTxs = smallWindow.getBySender('alice');
      expect(aliceTxs.find(t => t.txId === 'tx1')).toBeUndefined();
      expect(aliceTxs.find(t => t.txId === 'tx3')).toBeDefined();
    });

    it('should handle stress load', () => {
      const window = new HotWindow(10000);

      // Add many entries
      for (let i = 0; i < 50000; i++) {
        window.add({
          txId: `tx${i}`,
          from: `gc1sender${i % 100}`,
          nonce: BigInt(i),
          stateIds: [`state${i % 500}`],
          receivedAt: Date.now() + i,
        });
      }

      // Only last 10000 should exist (tx40000 to tx49999)
      expect(window.getByTxId('tx0')).toBeUndefined();
      expect(window.getByTxId('tx39999')).toBeUndefined(); // Just before window
      expect(window.getByTxId('tx40000')).toBeDefined();   // First in window
      expect(window.getByTxId('tx49999')).toBeDefined();   // Last in window

      // Query performance should be reasonable
      const start = performance.now();
      window.getBySender('gc1sender50');
      window.getByState('state250');
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // Should be fast
    });
  });

  describe('Stats', () => {
    it('should track stats', () => {
      hotWindow.add({
        txId: 'tx1',
        from: 'gc1sender',
        nonce: 1n,
        stateIds: ['s1', 's2'],
        receivedAt: Date.now(),
      });

      const stats = hotWindow.getStats();
      expect(stats.count).toBe(1);
      expect(stats.capacity).toBe(DEFAULT_SIZE);
    });
  });
});

describe('PendingIndex', () => {
  let pendingIndex: PendingIndex;

  beforeEach(() => {
    pendingIndex = new PendingIndex();
  });

  describe('Adding entries', () => {
    it('should add pending entry', () => {
      const entry: PendingEntry = {
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 5n,
        stateIds: ['stateA'],
        stateVersions: new Map([['stateA', 'v1']]),
      };

      pendingIndex.add(entry);
      expect(pendingIndex.has('tx1')).toBe(true);
    });
  });

  describe('Nonce conflict detection', () => {
    it('should detect nonce conflict', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 5n,
        stateIds: [],
        stateVersions: new Map(),
      });

      const conflict = pendingIndex.checkNonceConflict('gc1alice', 5n);
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.conflictingTxId).toBe('tx1');
    });

    it('should not detect conflict for different nonce', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 5n,
        stateIds: [],
        stateVersions: new Map(),
      });

      const conflict = pendingIndex.checkNonceConflict('gc1alice', 6n);
      expect(conflict.hasConflict).toBe(false);
    });

    it('should not detect conflict for different sender', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 5n,
        stateIds: [],
        stateVersions: new Map(),
      });

      const conflict = pendingIndex.checkNonceConflict('gc1bob', 5n);
      expect(conflict.hasConflict).toBe(false);
    });
  });

  describe('State conflict detection', () => {
    it('should detect state version conflict', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 1n,
        stateIds: ['stateA'],
        stateVersions: new Map([['stateA', 'v1']]),
      });

      const conflict = pendingIndex.checkStateConflict('stateA', 'v1');
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.conflictingTxId).toBe('tx1');
    });

    it('should not detect conflict for different version', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 1n,
        stateIds: ['stateA'],
        stateVersions: new Map([['stateA', 'v1']]),
      });

      const conflict = pendingIndex.checkStateConflict('stateA', 'v2');
      expect(conflict.hasConflict).toBe(false);
    });
  });

  describe('Lock conflict detection', () => {
    it('should detect lock conflict', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 1n,
        stateIds: ['stateA'],
        stateVersions: new Map(),
        locks: ['stateA'],
      });

      const conflict = pendingIndex.checkLockConflict('stateA');
      expect(conflict.hasConflict).toBe(true);
    });

    it('should not detect lock conflict for different state', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 1n,
        stateIds: ['stateA'],
        stateVersions: new Map(),
        locks: ['stateA'],
      });

      const conflict = pendingIndex.checkLockConflict('stateB');
      expect(conflict.hasConflict).toBe(false);
    });
  });

  describe('Commit removes entry', () => {
    it('should remove entry on commit', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 1n,
        stateIds: [],
        stateVersions: new Map(),
      });

      expect(pendingIndex.has('tx1')).toBe(true);

      pendingIndex.commit('tx1');

      expect(pendingIndex.has('tx1')).toBe(false);
    });

    it('should clear indexes on commit', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 5n,
        stateIds: ['stateA'],
        stateVersions: new Map([['stateA', 'v1']]),
      });

      pendingIndex.commit('tx1');

      const nonceConflict = pendingIndex.checkNonceConflict('gc1alice', 5n);
      const stateConflict = pendingIndex.checkStateConflict('stateA', 'v1');

      expect(nonceConflict.hasConflict).toBe(false);
      expect(stateConflict.hasConflict).toBe(false);
    });
  });
});

describe('PreflightService', () => {
  let preflight: PreflightService;
  let pendingIndex: PendingIndex;
  let hotWindow: HotWindow;

  beforeEach(() => {
    pendingIndex = new PendingIndex();
    hotWindow = new HotWindow(1000);
    preflight = new PreflightService(pendingIndex, hotWindow);
  });

  describe('Basic check', () => {
    it('should pass preflight for clean transaction', () => {
      const request: PreflightRequest = {
        from: 'gc1alice',
        nonce: 1n,
        stateIds: ['stateA'],
        stateVersions: new Map([['stateA', 'v1']]),
      };

      const result = preflight.check(request);

      expect(result.ok).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should include sender next nonce', () => {
      const request: PreflightRequest = {
        from: 'gc1alice',
        nonce: 1n,
        stateIds: [],
        stateVersions: new Map(),
      };

      const result = preflight.check(request);

      expect(result.senderNextNonce).toBeDefined();
    });
  });

  describe('Conflict detection', () => {
    it('should detect nonce conflict', () => {
      pendingIndex.add({
        txId: 'existing',
        from: 'gc1alice',
        nonce: 5n,
        stateIds: [],
        stateVersions: new Map(),
      });

      const request: PreflightRequest = {
        from: 'gc1alice',
        nonce: 5n,
        stateIds: [],
        stateVersions: new Map(),
      };

      const result = preflight.check(request);

      expect(result.ok).toBe(false);
      expect(result.conflicts.find(c => c.type === 'nonce')).toBeDefined();
    });

    it('should detect state conflict', () => {
      pendingIndex.add({
        txId: 'existing',
        from: 'gc1bob',
        nonce: 1n,
        stateIds: ['sharedState'],
        stateVersions: new Map([['sharedState', 'v1']]),
      });

      const request: PreflightRequest = {
        from: 'gc1alice',
        nonce: 1n,
        stateIds: ['sharedState'],
        stateVersions: new Map([['sharedState', 'v1']]),
      };

      const result = preflight.check(request);

      expect(result.ok).toBe(false);
      expect(result.conflicts.find(c => c.type === 'state')).toBeDefined();
    });

    it('should detect lock conflict', () => {
      pendingIndex.add({
        txId: 'existing',
        from: 'gc1bob',
        nonce: 1n,
        stateIds: ['lockedState'],
        stateVersions: new Map(),
        locks: ['lockedState'],
      });

      const request: PreflightRequest = {
        from: 'gc1alice',
        nonce: 1n,
        stateIds: [],
        stateVersions: new Map(),
        locks: ['lockedState'],
      };

      const result = preflight.check(request);

      expect(result.ok).toBe(false);
      expect(result.conflicts.find(c => c.type === 'lock')).toBeDefined();
    });

    it('should detect multiple conflicts', () => {
      pendingIndex.add({
        txId: 'tx1',
        from: 'gc1alice',
        nonce: 5n,
        stateIds: ['stateA'],
        stateVersions: new Map([['stateA', 'v1']]),
      });
      pendingIndex.add({
        txId: 'tx2',
        from: 'gc1bob',
        nonce: 1n,
        stateIds: ['stateB'],
        stateVersions: new Map(),
        locks: ['stateB'],
      });

      const request: PreflightRequest = {
        from: 'gc1alice',
        nonce: 5n,
        stateIds: ['stateA'],
        stateVersions: new Map([['stateA', 'v1']]),
        locks: ['stateB'],
      };

      const result = preflight.check(request);

      expect(result.ok).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty state list', () => {
      const request: PreflightRequest = {
        from: 'gc1alice',
        nonce: 1n,
        stateIds: [],
        stateVersions: new Map(),
      };

      const result = preflight.check(request);
      expect(result.ok).toBe(true);
    });

    it('should handle many states', () => {
      const stateIds = Array.from({ length: 100 }, (_, i) => `state${i}`);
      const stateVersions = new Map(stateIds.map(id => [id, 'v1']));

      const request: PreflightRequest = {
        from: 'gc1alice',
        nonce: 1n,
        stateIds,
        stateVersions,
      };

      const result = preflight.check(request);
      expect(result.ok).toBe(true);
    });
  });
});
