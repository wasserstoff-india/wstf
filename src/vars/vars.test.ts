/**
 * Variables Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VarNamespace,
  VarKey,
  makeNamespace,
  makeKey,
  orgNamespace,
  appNamespace,
  accountNamespace,
  globalNamespace,
  parseNamespace,
  encodeValue,
  decodeValue,
  isValidNamespace,
  isValidKey,
  READ_ONLY,
  READ_WRITE,
  ADMIN_ACCESS,
} from './types';
import {
  InMemoryVarStore,
  createVarStore,
  VarPermissionError,
  NamespaceExistsError,
  NamespaceNotFoundError,
} from './store';
import {
  VarService,
  createVarService,
} from './service';
import { InMemoryOrgStore, generateOrgId, generateRoleId } from '../accounts/orgStore';
import { makeOrgId, makeRoleId, Permissions, OrgRegistration, OrgRole, OrgMember } from '../accounts/orgTypes';

describe('Variable Types', () => {
  describe('Namespace helpers', () => {
    it('should create org namespace', () => {
      const ns = orgNamespace('org_123');
      expect(ns).toBe('org:org_123');
    });

    it('should create app namespace', () => {
      const ns = appNamespace('app_456');
      expect(ns).toBe('app:app_456');
    });

    it('should create account namespace', () => {
      const ns = accountNamespace('gc1abc');
      expect(ns).toBe('account:gc1abc');
    });

    it('should create global namespace', () => {
      const ns = globalNamespace();
      expect(ns).toBe('global');
    });

    it('should parse namespace', () => {
      expect(parseNamespace('org:123' as VarNamespace)).toEqual({ type: 'org', id: '123' });
      expect(parseNamespace('app:456' as VarNamespace)).toEqual({ type: 'app', id: '456' });
      expect(parseNamespace('account:addr' as VarNamespace)).toEqual({ type: 'account', id: 'addr' });
      expect(parseNamespace('global' as VarNamespace)).toEqual({ type: 'global', id: 'global' });
    });

    it('should reject invalid namespace', () => {
      expect(() => parseNamespace('invalid' as VarNamespace)).toThrow();
    });
  });

  describe('Namespace validation', () => {
    it('should validate correct namespaces', () => {
      expect(isValidNamespace('org:123')).toBe(true);
      expect(isValidNamespace('app:456')).toBe(true);
      expect(isValidNamespace('account:addr')).toBe(true);
      expect(isValidNamespace('global')).toBe(true);
    });

    it('should reject invalid namespaces', () => {
      expect(isValidNamespace('invalid')).toBe(false);
      expect(isValidNamespace('org:')).toBe(false);
      expect(isValidNamespace(':id')).toBe(false);
    });
  });

  describe('Key validation', () => {
    it('should validate correct keys', () => {
      expect(isValidKey('simple')).toBe(true);
      expect(isValidKey('with_underscore')).toBe(true);
      expect(isValidKey('with-dash')).toBe(true);
      expect(isValidKey('with.dot')).toBe(true);
      expect(isValidKey('with:colon')).toBe(true);
      expect(isValidKey('with/slash')).toBe(true);
      expect(isValidKey('config/db/host')).toBe(true);
    });

    it('should reject invalid keys', () => {
      expect(isValidKey('')).toBe(false);
      expect(isValidKey('with space')).toBe(false);
      expect(isValidKey('with@symbol')).toBe(false);
      expect(isValidKey('a'.repeat(257))).toBe(false);
    });
  });

  describe('Value encoding/decoding', () => {
    it('should encode/decode strings', () => {
      const original = 'hello world';
      const encoded = encodeValue(original, 'string');
      const decoded = decodeValue<string>(encoded, 'string');
      expect(decoded).toBe(original);
    });

    it('should encode/decode numbers', () => {
      const original = 123.456;
      const encoded = encodeValue(original, 'number');
      const decoded = decodeValue<number>(encoded, 'number');
      expect(decoded).toBeCloseTo(original);
    });

    it('should encode/decode bigints', () => {
      const original = 12345678901234567890n;
      const encoded = encodeValue(original, 'bigint');
      const decoded = decodeValue<bigint>(encoded, 'bigint');
      expect(decoded).toBe(original);
    });

    it('should encode/decode booleans', () => {
      expect(decodeValue<boolean>(encodeValue(true, 'boolean'), 'boolean')).toBe(true);
      expect(decodeValue<boolean>(encodeValue(false, 'boolean'), 'boolean')).toBe(false);
    });

    it('should encode/decode JSON', () => {
      const original = { name: 'test', count: 42, nested: { value: true } };
      const encoded = encodeValue(original, 'json');
      const decoded = decodeValue<typeof original>(encoded, 'json');
      expect(decoded).toEqual(original);
    });

    it('should handle buffers', () => {
      const original = Buffer.from([1, 2, 3, 4, 5]);
      const encoded = encodeValue(original, 'buffer');
      const decoded = decodeValue<Buffer>(encoded, 'buffer');
      expect(decoded.equals(original)).toBe(true);
    });
  });
});

describe('Variable Store', () => {
  let store: InMemoryVarStore;
  const testUser = 'gc1testuser';
  const testNs = accountNamespace(testUser);

  beforeEach(() => {
    store = new InMemoryVarStore();
  });

  describe('Account namespace (self-access)', () => {
    it('should allow user to read/write their own namespace', async () => {
      const key = makeKey('mykey');
      const value = Buffer.from('myvalue');

      const result = await store.set({
        namespace: testNs,
        key,
        value,
        type: 'string',
      }, testUser);

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(0n);

      const retrieved = await store.get(testNs, key, testUser);
      expect(retrieved).toBeDefined();
      expect(retrieved!.value.toString()).toBe('myvalue');
    });

    it('should reject other users from accessing account namespace', async () => {
      const key = makeKey('private');
      const value = Buffer.from('secret');

      await store.set({ namespace: testNs, key, value, type: 'string' }, testUser);

      await expect(store.get(testNs, key, 'otheruser')).rejects.toThrow(VarPermissionError);
    });
  });

  describe('Namespace with ACL', () => {
    const appNs = appNamespace('myapp');

    beforeEach(async () => {
      await store.createNamespace(appNs, testUser, {
        defaultPermissions: READ_ONLY,
        publicReadable: false,
      });
    });

    it('should allow owner full access', async () => {
      const key = makeKey('config');
      const value = Buffer.from('value');

      const result = await store.set({ namespace: appNs, key, value, type: 'string' }, testUser);
      expect(result.success).toBe(true);

      const retrieved = await store.get(appNs, key, testUser);
      expect(retrieved).toBeDefined();
    });

    it('should allow granted users access', async () => {
      const grantedUser = 'gc1granted';

      // Grant read-write
      await store.grantPermission(appNs, {
        grantee: grantedUser,
        granteeType: 'address',
        permissions: READ_WRITE,
      }, testUser);

      const key = makeKey('shared');
      const value = Buffer.from('data');

      // Owner writes
      await store.set({ namespace: appNs, key, value, type: 'string' }, testUser);

      // Granted user can read and write
      const retrieved = await store.get(appNs, key, grantedUser);
      expect(retrieved).toBeDefined();

      const updateResult = await store.set({
        namespace: appNs,
        key,
        value: Buffer.from('updated'),
        type: 'string',
        expectedVersion: 0n,
      }, grantedUser);
      expect(updateResult.success).toBe(true);
    });

    it('should allow default read for READ_ONLY default permission', async () => {
      const key = makeKey('readable');
      const value = Buffer.from('data');

      await store.set({ namespace: appNs, key, value, type: 'string' }, testUser);

      // Default READ_ONLY should allow reading
      const retrieved = await store.get(appNs, key, 'random');
      expect(retrieved).toBeDefined();

      // But writing should fail
      const writeResult = await store.set({
        namespace: appNs,
        key: makeKey('attempt'),
        value: Buffer.from('nope'),
        type: 'string',
      }, 'random');
      expect(writeResult.success).toBe(false);
    });

    it('should reject non-granted users with no default permissions', async () => {
      const restrictedNs = appNamespace('restricted');
      await store.createNamespace(restrictedNs, testUser, {
        defaultPermissions: { read: false, write: false, delete: false, admin: false },
        publicReadable: false,
      });

      const key = makeKey('secret');
      await store.set({ namespace: restrictedNs, key, value: Buffer.from('secret'), type: 'string' }, testUser);

      await expect(store.get(restrictedNs, key, 'random')).rejects.toThrow(VarPermissionError);
    });

    it('should handle public readable namespaces', async () => {
      const publicNs = appNamespace('public');
      await store.createNamespace(publicNs, testUser, {
        publicReadable: true,
      });

      const key = makeKey('public-data');
      await store.set({ namespace: publicNs, key, value: Buffer.from('hello'), type: 'string' }, testUser);

      // Anyone can read
      const retrieved = await store.get(publicNs, key, 'anyone');
      expect(retrieved).toBeDefined();

      // But not write
      const writeResult = await store.set({
        namespace: publicNs,
        key: makeKey('attempt'),
        value: Buffer.from('nope'),
        type: 'string',
      }, 'anyone');
      expect(writeResult.success).toBe(false);
    });
  });

  describe('Optimistic concurrency', () => {
    const ns = accountNamespace(testUser);

    it('should update with correct version', async () => {
      const key = makeKey('versioned');

      // Create
      const r1 = await store.set({ namespace: ns, key, value: Buffer.from('v1'), type: 'string' }, testUser);
      expect(r1.newVersion).toBe(0n);

      // Update with correct version
      const r2 = await store.set({
        namespace: ns,
        key,
        value: Buffer.from('v2'),
        type: 'string',
        expectedVersion: 0n,
      }, testUser);
      expect(r2.success).toBe(true);
      expect(r2.newVersion).toBe(1n);
    });

    it('should reject update with wrong version', async () => {
      const key = makeKey('conflict');

      await store.set({ namespace: ns, key, value: Buffer.from('initial'), type: 'string' }, testUser);

      const result = await store.set({
        namespace: ns,
        key,
        value: Buffer.from('updated'),
        type: 'string',
        expectedVersion: 99n,
      }, testUser);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Version mismatch');
    });
  });

  describe('Batch operations', () => {
    const ns = accountNamespace(testUser);

    it('should execute non-atomic batch', async () => {
      const result = await store.batch({
        operations: [
          { namespace: ns, key: makeKey('a'), value: Buffer.from('1'), type: 'string' },
          { namespace: ns, key: makeKey('b'), value: Buffer.from('2'), type: 'string' },
          { namespace: ns, key: makeKey('c'), value: Buffer.from('3'), type: 'string' },
        ],
        atomic: false,
      }, testUser);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results.every(r => r.success)).toBe(true);
    });

    it('should rollback atomic batch on failure', async () => {
      // Create a key first
      await store.set({ namespace: ns, key: makeKey('existing'), value: Buffer.from('old'), type: 'string' }, testUser);

      const result = await store.batch({
        operations: [
          { namespace: ns, key: makeKey('new1'), value: Buffer.from('1'), type: 'string' },
          { namespace: ns, key: makeKey('existing'), value: Buffer.from('updated'), type: 'string', expectedVersion: 99n }, // Wrong version
          { namespace: ns, key: makeKey('new2'), value: Buffer.from('3'), type: 'string' },
        ],
        atomic: true,
      }, testUser);

      expect(result.success).toBe(false);
    });
  });

  describe('List and filter', () => {
    const ns = accountNamespace(testUser);

    beforeEach(async () => {
      await store.set({ namespace: ns, key: makeKey('config/db/host'), value: Buffer.from('localhost'), type: 'string' }, testUser);
      await store.set({ namespace: ns, key: makeKey('config/db/port'), value: Buffer.from('5432'), type: 'string' }, testUser);
      await store.set({ namespace: ns, key: makeKey('config/api/key'), value: Buffer.from('secret'), type: 'string', metadata: { tags: ['secret'] } }, testUser);
      await store.set({ namespace: ns, key: makeKey('data/count'), value: Buffer.from('42'), type: 'string' }, testUser);
    });

    it('should list all variables', async () => {
      const result = await store.list(ns, testUser);
      expect(result.total).toBe(4);
    });

    it('should filter by prefix', async () => {
      const result = await store.list(ns, testUser, { keyPrefix: 'config/db' });
      expect(result.total).toBe(2);
    });

    it('should filter by tags', async () => {
      const result = await store.list(ns, testUser, { tags: ['secret'] });
      expect(result.total).toBe(1);
    });

    it('should paginate results', async () => {
      const page1 = await store.list(ns, testUser, { limit: 2, offset: 0 });
      expect(page1.records).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await store.list(ns, testUser, { limit: 2, offset: 2 });
      expect(page2.records).toHaveLength(2);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe('Delete operations', () => {
    const ns = accountNamespace(testUser);

    it('should delete variable', async () => {
      const key = makeKey('todelete');
      await store.set({ namespace: ns, key, value: Buffer.from('value'), type: 'string' }, testUser);

      expect(await store.exists(ns, key)).toBe(true);

      const result = await store.delete(ns, key, testUser);
      expect(result.success).toBe(true);

      expect(await store.exists(ns, key)).toBe(false);
    });

    it('should reject delete with wrong version', async () => {
      const key = makeKey('versioneddelete');
      await store.set({ namespace: ns, key, value: Buffer.from('value'), type: 'string' }, testUser);

      const result = await store.delete(ns, key, testUser, 99n);
      expect(result.success).toBe(false);
    });
  });

  describe('Expiry', () => {
    const ns = accountNamespace(testUser);

    it('should not return expired variables', async () => {
      const key = makeKey('expires');
      const pastTime = BigInt(Date.now() - 1000); // Expired 1 second ago

      await store.set({
        namespace: ns,
        key,
        value: Buffer.from('expired'),
        type: 'string',
        metadata: { expiresAt: pastTime },
      }, testUser);

      // Should not find expired var
      const result = await store.get(ns, key, testUser);
      expect(result).toBeUndefined();

      expect(await store.exists(ns, key)).toBe(false);
    });
  });
});

describe('Variable Store with Org Integration', () => {
  let store: InMemoryVarStore;
  let orgStore: InMemoryOrgStore;
  let orgId: string;
  const owner = 'gc1owner';
  const member = 'gc1member';

  beforeEach(async () => {
    orgStore = new InMemoryOrgStore();
    store = new InMemoryVarStore(orgStore);

    // Create org
    orgId = generateOrgId(owner, 'TestOrg', 0n);
    const org: OrgRegistration = {
      orgId: makeOrgId(orgId),
      name: 'Test Org',
      ownerAddress: owner,
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      isActive: true,
      version: 0n,
    };
    await orgStore.createOrg(org);

    // Create role with ORG_READ permission
    const roleId = generateRoleId(makeOrgId(orgId), 'reader', 0n);
    const role: OrgRole = {
      roleId: makeRoleId(roleId),
      orgId: makeOrgId(orgId),
      name: 'Reader',
      permissions: [Permissions.ORG_READ],
      inheritsFrom: [],
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      isActive: true,
      version: 0n,
    };
    await orgStore.createRole(role);

    // Add member with reader role
    const memberRecord: OrgMember = {
      orgId: makeOrgId(orgId),
      address: member,
      roleAssignments: [{ roleId: makeRoleId(roleId), assignedAt: BigInt(Date.now()), assignedBy: owner, scopeUnitId: null }],
      joinedAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      isActive: true,
      version: 0n,
    };
    await orgStore.addMember(memberRecord);
  });

  it('should allow org owner to access org namespace', async () => {
    const ns = orgNamespace(makeOrgId(orgId));
    const key = makeKey('config');

    const result = await store.set({ namespace: ns, key, value: Buffer.from('value'), type: 'string' }, owner);
    expect(result.success).toBe(true);

    const retrieved = await store.get(ns, key, owner);
    expect(retrieved).toBeDefined();
  });

  it('should allow org member with read permission to read', async () => {
    const ns = orgNamespace(makeOrgId(orgId));
    const key = makeKey('shared');

    // Owner creates namespace and sets value
    await store.createNamespace(ns, owner);
    await store.set({ namespace: ns, key, value: Buffer.from('data'), type: 'string' }, owner);

    // Member with ORG_READ can read
    const retrieved = await store.get(ns, key, member);
    expect(retrieved).toBeDefined();
  });
});

describe('Variable Service', () => {
  let store: InMemoryVarStore;
  let service: VarService;
  const testUser = 'gc1testuser';

  const mockContext = {
    addr: testUser,
    trustTier: 1,
    orgs: [],
    scopes: ['vars:read', 'vars:write'],
  };

  beforeEach(() => {
    store = new InMemoryVarStore();
    service = createVarService(store);
  });

  it('should get and set variables', async () => {
    const ns = accountNamespace(testUser);

    const setResult = await service.set(mockContext, {
      namespace: ns,
      key: 'greeting',
      value: 'hello world',
      type: 'string',
    });

    expect(setResult.success).toBe(true);

    const getResult = await service.get<string>(mockContext, {
      namespace: ns,
      key: 'greeting',
    });

    expect(getResult.found).toBe(true);
    expect(getResult.variable?.value).toBe('hello world');
  });

  it('should list variables', async () => {
    const ns = accountNamespace(testUser);

    await service.set(mockContext, { namespace: ns, key: 'a', value: '1', type: 'string' });
    await service.set(mockContext, { namespace: ns, key: 'b', value: '2', type: 'string' });

    const result = await service.list(mockContext, { namespace: ns });

    expect(result.total).toBe(2);
    expect(result.variables).toHaveLength(2);
  });

  it('should delete variables', async () => {
    const ns = accountNamespace(testUser);

    await service.set(mockContext, { namespace: ns, key: 'temp', value: 'data', type: 'string' });
    expect(await service.exists({ namespace: ns, key: 'temp' })).toBe(true);

    await service.delete(mockContext, { namespace: ns, key: 'temp' });
    expect(await service.exists({ namespace: ns, key: 'temp' })).toBe(false);
  });

  it('should create and manage namespaces', async () => {
    const ns = appNamespace('myapp');

    await service.createNamespace(mockContext, ns, {
      publicReadable: true,
    });

    // Check ACL
    const acl = await store.getNamespaceACL(ns);
    expect(acl).toBeDefined();
    expect(acl!.owner).toBe(testUser);
    expect(acl!.publicReadable).toBe(true);
  });

  it('should grant and revoke permissions', async () => {
    const ns = appNamespace('shared');
    const grantee = 'gc1friend';

    await service.createNamespace(mockContext, ns);
    await service.set(mockContext, { namespace: ns, key: 'data', value: 'secret', type: 'string' });

    // Grant read access
    await service.grantPermission(mockContext, ns, grantee, READ_ONLY);

    // Grantee can read
    const granteeCtx = { addr: grantee, trustTier: 1, orgs: [], scopes: [] };
    const result = await service.get(granteeCtx, { namespace: ns, key: 'data' });
    expect(result.found).toBe(true);

    // Revoke
    await service.revokePermission(mockContext, ns, grantee);

    // Grantee can no longer read
    await expect(service.get(granteeCtx, { namespace: ns, key: 'data' })).rejects.toThrow();
  });
});
