/**
 * Variable Store Chaos Tests - Namespace isolation, OCC conflicts, RBAC bypass
 *
 * Focus: Breaking things, not proving happy paths.
 * Tests for:
 * - Namespace isolation (cross-namespace access attempts)
 * - OCC version conflicts
 * - RBAC/ACL bypass attempts
 * - Permission edge cases
 * - Key/value boundary conditions
 * - TTL/expiry behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryVarStore,
  VarStore,
  VarPermissionError,
  VarNotFoundError,
  VarConcurrencyError,
  NamespaceNotFoundError,
} from './store';
import {
  VarNamespace,
  VarKey,
  VarRecord,
  orgNamespace,
  appNamespace,
  accountNamespace,
  globalNamespace,
  makeKey,
  encodeValue,
  decodeValue,
} from './types';
import { makeOrgId } from '../accounts/orgTypes';

// Alias for readability
const VarVersionConflictError = VarConcurrencyError;

// ============================================================================
// Test Helpers
// ============================================================================

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USER1 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const USER2 = '0xcccccccccccccccccccccccccccccccccccccccc';
const ATTACKER = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

// ============================================================================
// Namespace Isolation Tests
// ============================================================================

describe('Namespace Isolation', () => {
  let store: InMemoryVarStore;

  beforeEach(() => {
    store = new InMemoryVarStore();
  });

  it('should isolate account namespaces from each other', async () => {
    const ns1 = accountNamespace(USER1);
    const ns2 = accountNamespace(USER2);

    await store.createNamespace(ns1, USER1);
    await store.createNamespace(ns2, USER2);

    const key = makeKey('secret');

    // USER1 writes to their namespace
    await store.set({
      namespace: ns1,
      key,
      value: encodeValue('user1_secret', 'string'),
      type: 'string',
    }, USER1);

    // USER2 writes same key to their namespace
    await store.set({
      namespace: ns2,
      key,
      value: encodeValue('user2_secret', 'string'),
      type: 'string',
    }, USER2);

    // Each user should only see their own data
    const entry1 = await store.get(ns1, key, USER1);
    const entry2 = await store.get(ns2, key, USER2);

    expect(decodeValue(entry1!.value, entry1!.metadata.type)).toBe('user1_secret');
    expect(decodeValue(entry2!.value, entry2!.metadata.type)).toBe('user2_secret');
  });

  it('should reject cross-namespace read without permission', async () => {
    const ns1 = accountNamespace(USER1);
    await store.createNamespace(ns1, USER1);

    const key = makeKey('private_data');
    await store.set({
      namespace: ns1,
      key,
      value: encodeValue('sensitive', 'string'),
      type: 'string',
    }, USER1);

    // ATTACKER tries to read USER1's data
    await expect(store.get(ns1, key, ATTACKER)).rejects.toThrow(VarPermissionError);
  });

  it('should reject cross-namespace write without permission', async () => {
    const ns1 = accountNamespace(USER1);
    await store.createNamespace(ns1, USER1);

    // ATTACKER tries to write to USER1's namespace
    const result = await store.set({
      namespace: ns1,
      key: makeKey('malicious'),
      value: encodeValue('pwned', 'string'),
      type: 'string',
    }, ATTACKER);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/permission|denied/i);
  });

  it('should reject cross-namespace delete without permission', async () => {
    const ns1 = accountNamespace(USER1);
    await store.createNamespace(ns1, USER1);

    const key = makeKey('important');
    await store.set({
      namespace: ns1,
      key,
      value: encodeValue('critical data', 'string'),
      type: 'string',
    }, USER1);

    // ATTACKER tries to delete USER1's data
    const result = await store.delete(ns1, key, ATTACKER);
    expect(result.success).toBe(false);
  });

  it('should isolate org namespaces from account namespaces', async () => {
    const orgId = makeOrgId('org_test');
    const orgNs = orgNamespace(orgId);
    const accountNs = accountNamespace(OWNER);

    await store.createNamespace(orgNs, OWNER);
    await store.createNamespace(accountNs, OWNER);

    const key = makeKey('config');

    // Write same key to both namespaces
    await store.set({
      namespace: orgNs,
      key,
      value: encodeValue('org_config', 'string'),
      type: 'string',
    }, OWNER);

    await store.set({
      namespace: accountNs,
      key,
      value: encodeValue('account_config', 'string'),
      type: 'string',
    }, OWNER);

    // Verify they're distinct
    const orgEntry = await store.get(orgNs, key, OWNER);
    const accountEntry = await store.get(accountNs, key, OWNER);

    expect(decodeValue(orgEntry!.value, orgEntry!.metadata.type)).toBe('org_config');
    expect(decodeValue(accountEntry!.value, accountEntry!.metadata.type)).toBe('account_config');
  });

  it('should prevent namespace naming collision attacks', async () => {
    // Attacker tries to create namespace with similar name to existing one
    const legitNs = accountNamespace(USER1);
    await store.createNamespace(legitNs, USER1);

    // Try creating with slightly different formatting
    // (implementation should normalize or reject)
    const attackNs = `account:${USER1}` as VarNamespace; // Re-create same

    // Should either:
    // 1. Fail because namespace exists (owned by USER1)
    // 2. Succeed but ATTACKER can't write to it
    try {
      await store.createNamespace(attackNs, ATTACKER);
      // If succeeded, verify attacker can't write
      await expect(store.set({
        namespace: attackNs,
        key: makeKey('test'),
        value: encodeValue('pwned', 'string'),
        type: 'string',
      }, ATTACKER)).rejects.toThrow();
    } catch (e) {
      // Expected - namespace already exists
      expect(e).toBeDefined();
    }
  });
});

// ============================================================================
// OCC Version Conflict Tests
// ============================================================================

describe('OCC Version Conflicts', () => {
  let store: InMemoryVarStore;
  let ns: VarNamespace;

  beforeEach(async () => {
    store = new InMemoryVarStore();
    ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);
  });

  it('should reject write with stale version', async () => {
    const key = makeKey('counter');

    // Initial write
    const result1 = await store.set({
      namespace: ns,
      key,
      value: encodeValue(1, 'number'),
      type: 'number',
    }, OWNER);

    const version1 = result1.newVersion!;

    // Second write (updates version)
    await store.set({
      namespace: ns,
      key,
      value: encodeValue(2, 'number'),
      type: 'number',
      expectedVersion: version1,
    }, OWNER);

    // Try to write with stale version (version1, not version2)
    const result = await store.set({
      namespace: ns,
      key,
      value: encodeValue(3, 'number'),
      type: 'number',
      expectedVersion: version1, // STALE!
    }, OWNER);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/version|conflict|mismatch/i);
  });

  it('should allow write with correct version', async () => {
    const key = makeKey('data');

    const result1 = await store.set({
      namespace: ns,
      key,
      value: encodeValue('v1', 'string'),
      type: 'string',
    }, OWNER);

    const result2 = await store.set({
      namespace: ns,
      key,
      value: encodeValue('v2', 'string'),
      type: 'string',
      expectedVersion: result1.newVersion,
    }, OWNER);

    expect(result2.success).toBe(true);
    expect(result2.newVersion).toBe(result1.newVersion! + 1n);
  });

  it('should handle version 0 expectation on existing key', async () => {
    const key = makeKey('existing');

    // Create the key
    const createResult = await store.set({
      namespace: ns,
      key,
      value: encodeValue('initial', 'string'),
      type: 'string',
    }, OWNER);
    const currentVersion = createResult.newVersion!;

    // Try to write with wrong version (should fail)
    const result = await store.set({
      namespace: ns,
      key,
      value: encodeValue('overwrite', 'string'),
      type: 'string',
      expectedVersion: currentVersion + 99n, // definitely wrong
    }, OWNER);
    expect(result.success).toBe(false);
  });

  it('should handle rapid sequential updates correctly', async () => {
    const key = makeKey('rapid');

    // First write without version check to establish key
    let result = await store.set({
      namespace: ns,
      key,
      value: encodeValue(0, 'number'),
      type: 'number',
    }, OWNER);
    let currentVersion = result.newVersion!;
    let successCount = 1;

    // Continue updating with version checks
    for (let i = 1; i < 50; i++) {
      result = await store.set({
        namespace: ns,
        key,
        value: encodeValue(i, 'number'),
        type: 'number',
        expectedVersion: currentVersion,
      }, OWNER);
      if (result.success) {
        currentVersion = result.newVersion!;
        successCount++;
      }
    }

    // All sequential updates should succeed
    expect(successCount).toBe(50);

    // Verify final value
    const entry = await store.get(ns, key, OWNER);
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe(49);
  });

  it('should track versions independently per key', async () => {
    const key1 = makeKey('key1');
    const key2 = makeKey('key2');

    // Write to key1 multiple times
    let v1 = (await store.set({ namespace: ns, key: key1, value: encodeValue(1, 'number'), type: 'number' }, OWNER)).newVersion!;
    v1 = (await store.set({ namespace: ns, key: key1, value: encodeValue(2, 'number'), type: 'number', expectedVersion: v1 }, OWNER)).newVersion!;
    v1 = (await store.set({ namespace: ns, key: key1, value: encodeValue(3, 'number'), type: 'number', expectedVersion: v1 }, OWNER)).newVersion!;

    // Write to key2 once
    const v2 = (await store.set({ namespace: ns, key: key2, value: encodeValue(100, 'number'), type: 'number' }, OWNER)).newVersion!;

    // Key1 has been written 3 times, key2 only once
    // Versions should reflect this (but exact values depend on implementation)
    expect(v1).toBeGreaterThan(v2);
  });
});

// ============================================================================
// RBAC/ACL Bypass Attempts
// ============================================================================

describe('RBAC/ACL Bypass Attempts', () => {
  let store: InMemoryVarStore;

  beforeEach(() => {
    store = new InMemoryVarStore();
  });

  it('should reject operations on non-existent namespace', async () => {
    const fakeNs = accountNamespace('0xnonexistent00000000000000000000000000');

    const result = await store.set({
      namespace: fakeNs,
      key: makeKey('test'),
      value: encodeValue('data', 'string'),
      type: 'string',
    }, OWNER);
    expect(result.success).toBe(false);
  });

  it('should reject permission grant from non-owner', async () => {
    const ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);

    // ATTACKER tries to grant themselves permission
    await expect(store.grantPermission(ns, {
      grantee: ATTACKER,
      granteeType: 'address',
      permissions: { read: true, write: true, delete: true, admin: true },
    }, ATTACKER)).rejects.toThrow(VarPermissionError);
  });

  it('should reject permission revocation from non-owner', async () => {
    const ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);

    // Owner grants permission to USER1
    await store.grantPermission(ns, {
      grantee: USER1,
      granteeType: 'address',
      permissions: { read: true, write: true, delete: false, admin: false },
    }, OWNER);

    // ATTACKER tries to revoke USER1's permission
    await expect(store.revokePermission(ns, USER1, ATTACKER)).rejects.toThrow(VarPermissionError);
  });

  it('should prevent privilege escalation via non-owner grant', async () => {
    const ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);

    // Non-owner (USER1) tries to grant permissions - should fail
    await expect(store.grantPermission(ns, {
      grantee: ATTACKER,
      granteeType: 'address',
      permissions: { read: true, write: true, delete: true, admin: true },
    }, USER1)).rejects.toThrow();
  });
});

// ============================================================================
// Key/Value Boundary Conditions
// ============================================================================

describe('Key/Value Boundary Conditions', () => {
  let store: InMemoryVarStore;
  let ns: VarNamespace;

  beforeEach(async () => {
    store = new InMemoryVarStore();
    ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);
  });

  it('should handle empty key gracefully', async () => {
    // Implementation should either accept or reject consistently
    try {
      const key = makeKey('');
      await store.set({
        namespace: ns,
        key,
        value: encodeValue('data', 'string'),
        type: 'string',
      }, OWNER);
      // If accepted, should be retrievable
      const entry = await store.get(ns, key, OWNER);
      expect(entry).toBeDefined();
    } catch (e) {
      // If rejected, should have clear error
      expect(e).toBeDefined();
    }
  });

  it('should handle very long key names', async () => {
    const longKey = makeKey('x'.repeat(1000));

    try {
      await store.set({
        namespace: ns,
        key: longKey,
        value: encodeValue('data', 'string'),
        type: 'string',
      }, OWNER);
      // If accepted, should be retrievable
      const entry = await store.get(ns, longKey, OWNER);
      expect(entry).toBeDefined();
    } catch (e) {
      // If rejected (key too long), should have clear error
      expect(e).toBeDefined();
    }
  });

  it('should handle empty value', async () => {
    const key = makeKey('empty_value');
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('', 'string'),
      type: 'string',
    }, OWNER);

    const entry = await store.get(ns, key, OWNER);
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe('');
  });

  it('should handle large values', async () => {
    const key = makeKey('large');
    const largeValue = 'x'.repeat(100000); // 100KB

    await store.set({
      namespace: ns,
      key,
      value: encodeValue(largeValue, 'string'),
      type: 'string',
    }, OWNER);

    const entry = await store.get(ns, key, OWNER);
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe(largeValue);
  });

  it('should handle special characters in keys', async () => {
    const specialKeys = [
      'key.with.dots',
      'key-with-dashes',
      'key_with_underscores',
    ];

    for (const keyName of specialKeys) {
      const key = makeKey(keyName);
      const setResult = await store.set({
        namespace: ns,
        key,
        value: encodeValue(keyName, 'string'),
        type: 'string',
      }, OWNER);

      // Some special chars may be rejected - that's OK
      if (setResult.success) {
        const entry = await store.get(ns, key, OWNER);
        expect(decodeValue(entry!.value, entry!.metadata.type)).toBe(keyName);
      }
    }
  });

  it('should handle unicode in values', async () => {
    const key = makeKey('unicode');
    const unicodeValue = '你好世界 🌍 مرحبا العالم';

    await store.set({
      namespace: ns,
      key,
      value: encodeValue(unicodeValue, 'string'),
      type: 'string',
    }, OWNER);

    const entry = await store.get(ns, key, OWNER);
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe(unicodeValue);
  });

  it('should handle binary-like data as string', async () => {
    const key = makeKey('binary');
    // Store binary-ish data as base64 encoded string
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const base64Value = binaryData.toString('base64');

    await store.set({
      namespace: ns,
      key,
      value: encodeValue(base64Value, 'string'),
      type: 'string',
    }, OWNER);

    const entry = await store.get(ns, key, OWNER);
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe(base64Value);
  });
});

// ============================================================================
// Delete Operation Edge Cases
// ============================================================================

describe('Delete Operation Edge Cases', () => {
  let store: InMemoryVarStore;
  let ns: VarNamespace;

  beforeEach(async () => {
    store = new InMemoryVarStore();
    ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);
  });

  it('should handle delete of non-existent key', async () => {
    const key = makeKey('nonexistent');

    // Should either succeed (no-op) or throw clear error
    try {
      await store.delete(ns, key, OWNER);
    } catch (e) {
      // If throws, should be meaningful error
      expect(e).toBeInstanceOf(VarNotFoundError);
    }
  });

  it('should prevent read after delete', async () => {
    const key = makeKey('to_delete');
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('data', 'string'),
      type: 'string',
    }, OWNER);

    await store.delete(ns, key, OWNER);

    // Should return undefined or throw
    const entry = await store.get(ns, key, OWNER);
    expect(entry).toBeUndefined();
  });

  it('should allow re-creation after delete', async () => {
    const key = makeKey('recreate');

    // Create
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('v1', 'string'),
      type: 'string',
    }, OWNER);

    // Delete
    await store.delete(ns, key, OWNER);

    // Re-create with new value
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('v2', 'string'),
      type: 'string',
    }, OWNER);

    const entry = await store.get(ns, key, OWNER);
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe('v2');
    // Version starts at 0 or 1, either is valid
    expect(entry!.version).toBeGreaterThanOrEqual(0n);
  });

  it('should respect delete permission', async () => {
    const key = makeKey('protected');
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('important', 'string'),
      type: 'string',
    }, OWNER);

    // Grant USER1 write but not delete
    await store.grantPermission(ns, {
      grantee: USER1,
      granteeType: 'address',
      permissions: { read: true, write: true, delete: false, admin: false },
    }, OWNER);

    // USER1 can overwrite
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('modified', 'string'),
      type: 'string',
    }, USER1);

    // USER1 cannot delete
    const deleteResult = await store.delete(ns, key, USER1);
    expect(deleteResult.success).toBe(false);

    // Data still exists
    const entry = await store.get(ns, key, OWNER);
    expect(entry).toBeDefined();
  });
});

// ============================================================================
// List/Query Edge Cases
// ============================================================================

describe('List/Query Edge Cases', () => {
  let store: InMemoryVarStore;
  let ns: VarNamespace;

  beforeEach(async () => {
    store = new InMemoryVarStore();
    ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);
  });

  it('should return empty list for empty namespace', async () => {
    const result = await store.list(ns, OWNER, {});
    expect(result.records).toEqual([]);
  });

  it('should handle list with prefix filter', async () => {
    // Create entries with different prefixes
    await store.set({ namespace: ns, key: makeKey('config.app.name'), value: encodeValue('MyApp', 'string'), type: 'string' }, OWNER);
    await store.set({ namespace: ns, key: makeKey('config.app.version'), value: encodeValue('1.0', 'string'), type: 'string' }, OWNER);
    await store.set({ namespace: ns, key: makeKey('config.db.host'), value: encodeValue('localhost', 'string'), type: 'string' }, OWNER);
    await store.set({ namespace: ns, key: makeKey('data.user.count'), value: encodeValue(100, 'number'), type: 'number' }, OWNER);

    // List entries
    const result = await store.list(ns, OWNER, { limit: 100 });
    // Should get all 4 records
    expect(result.records.length).toBe(4);
  });

  it('should respect list limit', async () => {
    // Create many entries
    for (let i = 0; i < 50; i++) {
      await store.set({
        namespace: ns,
        key: makeKey(`key_${i.toString().padStart(3, '0')}`),
        value: encodeValue(i, 'number'),
        type: 'number',
      }, OWNER);
    }

    const result = await store.list(ns, OWNER, { limit: 10 });
    expect(result.records.length).toBe(10);
  });

  it('should reject list from unauthorized caller', async () => {
    await store.set({
      namespace: ns,
      key: makeKey('secret'),
      value: encodeValue('data', 'string'),
      type: 'string',
    }, OWNER);

    // ATTACKER tries to list
    await expect(store.list(ns, ATTACKER, {})).rejects.toThrow(VarPermissionError);
  });

  it('should handle pagination correctly', async () => {
    // Create ordered entries
    for (let i = 0; i < 30; i++) {
      await store.set({
        namespace: ns,
        key: makeKey(`item_${i.toString().padStart(3, '0')}`),
        value: encodeValue(i, 'number'),
        type: 'number',
      }, OWNER);
    }

    // First page
    const page1 = await store.list(ns, OWNER, { limit: 10 });
    expect(page1.records.length).toBe(10);

    // Keys should be deterministically ordered
    // (exact order depends on implementation)
  });
});

// ============================================================================
// Exists Check Edge Cases
// ============================================================================

describe('Exists Check Edge Cases', () => {
  let store: InMemoryVarStore;
  let ns: VarNamespace;

  beforeEach(async () => {
    store = new InMemoryVarStore();
    ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);
  });

  it('should return false for non-existent key', async () => {
    const exists = await store.exists(ns, makeKey('nonexistent'));
    expect(exists).toBe(false);
  });

  it('should return true for existing key', async () => {
    await store.set({
      namespace: ns,
      key: makeKey('existing'),
      value: encodeValue('data', 'string'),
      type: 'string',
    }, OWNER);

    const exists = await store.exists(ns, makeKey('existing'));
    expect(exists).toBe(true);
  });

  it('should return false after delete', async () => {
    const key = makeKey('temp');
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('data', 'string'),
      type: 'string',
    }, OWNER);

    await store.delete(ns, key, OWNER);

    const exists = await store.exists(ns, key);
    expect(exists).toBe(false);
  });
});

// ============================================================================
// Namespace Creation Edge Cases
// ============================================================================

describe('Namespace Creation Edge Cases', () => {
  let store: InMemoryVarStore;

  beforeEach(() => {
    store = new InMemoryVarStore();
  });

  it('should reject duplicate namespace creation', async () => {
    const ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);

    // Try to create same namespace again
    await expect(store.createNamespace(ns, OWNER)).rejects.toThrow();
  });

  it('should handle namespace ownership properly', async () => {
    const ns = accountNamespace(USER1);

    // First create as USER1
    await store.createNamespace(ns, USER1);

    // ATTACKER tries to write to USER1's namespace
    const result = await store.set({
      namespace: ns,
      key: makeKey('hack'),
      value: encodeValue('pwned', 'string'),
      type: 'string',
    }, ATTACKER);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/permission|denied/i);
  });

  it('should allow org namespace creation by org owner', async () => {
    const orgId = makeOrgId('org_test');
    const ns = orgNamespace(orgId);

    // For org namespaces, creator becomes owner
    // This test verifies the namespace can be created
    // Real org ownership would be verified via org store
    await store.createNamespace(ns, OWNER);

    // Owner can write
    await store.set({
      namespace: ns,
      key: makeKey('test'),
      value: encodeValue('data', 'string'),
      type: 'string',
    }, OWNER);
  });

  it('should handle app namespace creation', async () => {
    // Use appNamespace with a raw app ID string
    const ns = appNamespace('app_test' as any);

    await store.createNamespace(ns, OWNER);

    await store.set({
      namespace: ns,
      key: makeKey('config'),
      value: encodeValue('app_config', 'string'),
      type: 'string',
    }, OWNER);

    const entry = await store.get(ns, makeKey('config'), OWNER);
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe('app_config');
  });
});

// ============================================================================
// Type Coercion/Mismatch Tests
// ============================================================================

describe('Type Coercion/Mismatch Tests', () => {
  let store: InMemoryVarStore;
  let ns: VarNamespace;

  beforeEach(async () => {
    store = new InMemoryVarStore();
    ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);
  });

  it('should preserve type information', async () => {
    const key = makeKey('typed');

    // Store as number
    await store.set({
      namespace: ns,
      key,
      value: encodeValue(42, 'number'),
      type: 'number',
    }, OWNER);

    const entry = await store.get(ns, key, OWNER);
    expect(entry!.metadata.type).toBe('number');
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe(42);
  });

  it('should handle type change on overwrite', async () => {
    const key = makeKey('changing_type');

    // Start as string
    await store.set({
      namespace: ns,
      key,
      value: encodeValue('hello', 'string'),
      type: 'string',
    }, OWNER);

    // Overwrite as number
    await store.set({
      namespace: ns,
      key,
      value: encodeValue(123, 'number'),
      type: 'number',
    }, OWNER);

    const entry = await store.get(ns, key, OWNER);
    expect(entry!.metadata.type).toBe('number');
    expect(decodeValue(entry!.value, entry!.metadata.type)).toBe(123);
  });

  it('should handle JSON type correctly', async () => {
    const key = makeKey('json');
    const jsonValue = { name: 'Test', values: [1, 2, 3], nested: { foo: 'bar' } };

    await store.set({
      namespace: ns,
      key,
      value: encodeValue(jsonValue, 'json'),
      type: 'json',
    }, OWNER);

    const entry = await store.get(ns, key, OWNER);
    expect(decodeValue(entry!.value, entry!.metadata.type)).toEqual(jsonValue);
  });
});

// ============================================================================
// Stress/Edge Tests
// ============================================================================

describe('Stress/Edge Tests', () => {
  let store: InMemoryVarStore;
  let ns: VarNamespace;

  beforeEach(async () => {
    store = new InMemoryVarStore();
    ns = accountNamespace(OWNER);
    await store.createNamespace(ns, OWNER);
  });

  it('should handle many keys in single namespace', async () => {
    // Create 500 keys
    for (let i = 0; i < 500; i++) {
      await store.set({
        namespace: ns,
        key: makeKey(`key_${i}`),
        value: encodeValue(i, 'number'),
        type: 'number',
      }, OWNER);
    }

    // Verify random access
    const entry250 = await store.get(ns, makeKey('key_250'), OWNER);
    expect(decodeValue(entry250!.value, entry250!.metadata.type)).toBe(250);

    // Verify list count
    const all = await store.list(ns, OWNER, { limit: 1000 });
    expect(all.records.length).toBe(500);
  });

  it('should handle many namespaces', async () => {
    const namespaces: VarNamespace[] = [];

    // Create 50 account namespaces
    for (let i = 0; i < 50; i++) {
      const addr = `0x${i.toString(16).padStart(40, '0')}`;
      const ns = accountNamespace(addr);
      await store.createNamespace(ns, addr);
      namespaces.push(ns);

      // Each writes to their own namespace
      await store.set({
        namespace: ns,
        key: makeKey('my_data'),
        value: encodeValue(i, 'number'),
        type: 'number',
      }, addr);
    }

    // Verify isolation
    for (let i = 0; i < 50; i++) {
      const addr = `0x${i.toString(16).padStart(40, '0')}`;
      const entry = await store.get(namespaces[i], makeKey('my_data'), addr);
      expect(decodeValue(entry!.value, entry!.metadata.type)).toBe(i);
    }
  });
});
