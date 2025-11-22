/**
 * Org/RBAC Tests - Organization, Roles, Units, and Members
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OrgId,
  RoleId,
  UnitId,
  PermissionStr,
  OrgRegistration,
  OrgRole,
  OrgUnit,
  OrgMember,
  Permissions,
  makeOrgId,
  makeRoleId,
  makeUnitId,
  makePermission,
  isValidPermission,
  resolveRolePermissions,
} from './orgTypes';
import {
  InMemoryOrgStore,
  createOrgStore,
  generateOrgId,
  generateRoleId,
  generateUnitId,
  ConcurrencyError,
  NotFoundError,
} from './orgStore';

describe('Org Types', () => {
  describe('Permission validation', () => {
    it('should validate correct permission format', () => {
      expect(isValidPermission('tx.submit')).toBe(true);
      expect(isValidPermission('org.admin')).toBe(true);
      expect(isValidPermission('approval.sign')).toBe(true);
      expect(isValidPermission('prog.deploy.test')).toBe(true);
    });

    it('should reject invalid permission format', () => {
      expect(isValidPermission('')).toBe(false);
      expect(isValidPermission('invalid')).toBe(false);
      expect(isValidPermission('UPPERCASE.test')).toBe(false);
      expect(isValidPermission('a.b.c.d')).toBe(false);
      expect(isValidPermission('test.')).toBe(false);
    });
  });

  describe('Branded type helpers', () => {
    it('should create branded types', () => {
      const orgId = makeOrgId('test-org');
      const roleId = makeRoleId('test-role');
      const unitId = makeUnitId('test-unit');
      const perm = makePermission('tx.submit');

      expect(orgId).toBe('test-org');
      expect(roleId).toBe('test-role');
      expect(unitId).toBe('test-unit');
      expect(perm).toBe('tx.submit');
    });
  });

  describe('Role permission resolution', () => {
    it('should resolve direct permissions', () => {
      const role: OrgRole = {
        roleId: makeRoleId('admin'),
        orgId: makeOrgId('org1'),
        name: 'Admin',
        permissions: [Permissions.TX_SUBMIT, Permissions.ORG_ADMIN],
        inheritsFrom: [],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      const roleMap = new Map<RoleId, OrgRole>();
      roleMap.set(role.roleId, role);

      const perms = resolveRolePermissions(role, roleMap);
      expect(perms.has(Permissions.TX_SUBMIT)).toBe(true);
      expect(perms.has(Permissions.ORG_ADMIN)).toBe(true);
      expect(perms.size).toBe(2);
    });

    it('should resolve inherited permissions', () => {
      const baseRole: OrgRole = {
        roleId: makeRoleId('base'),
        orgId: makeOrgId('org1'),
        name: 'Base',
        permissions: [Permissions.TX_SUBMIT],
        inheritsFrom: [],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      const adminRole: OrgRole = {
        roleId: makeRoleId('admin'),
        orgId: makeOrgId('org1'),
        name: 'Admin',
        permissions: [Permissions.ORG_ADMIN],
        inheritsFrom: [baseRole.roleId],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      const roleMap = new Map<RoleId, OrgRole>();
      roleMap.set(baseRole.roleId, baseRole);
      roleMap.set(adminRole.roleId, adminRole);

      const perms = resolveRolePermissions(adminRole, roleMap);
      expect(perms.has(Permissions.TX_SUBMIT)).toBe(true); // inherited
      expect(perms.has(Permissions.ORG_ADMIN)).toBe(true); // direct
      expect(perms.size).toBe(2);
    });

    it('should handle circular inheritance safely', () => {
      const roleA: OrgRole = {
        roleId: makeRoleId('roleA'),
        orgId: makeOrgId('org1'),
        name: 'Role A',
        permissions: [Permissions.TX_SUBMIT],
        inheritsFrom: [makeRoleId('roleB')],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      const roleB: OrgRole = {
        roleId: makeRoleId('roleB'),
        orgId: makeOrgId('org1'),
        name: 'Role B',
        permissions: [Permissions.ORG_ADMIN],
        inheritsFrom: [makeRoleId('roleA')],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      const roleMap = new Map<RoleId, OrgRole>();
      roleMap.set(roleA.roleId, roleA);
      roleMap.set(roleB.roleId, roleB);

      // Should not infinite loop
      const perms = resolveRolePermissions(roleA, roleMap);
      expect(perms.has(Permissions.TX_SUBMIT)).toBe(true);
      expect(perms.has(Permissions.ORG_ADMIN)).toBe(true);
    });
  });
});

describe('Org Store', () => {
  let store: InMemoryOrgStore;

  beforeEach(() => {
    store = new InMemoryOrgStore();
  });

  describe('Organization operations', () => {
    const createTestOrg = (): OrgRegistration => ({
      orgId: generateOrgId('owner1', 'TestOrg', 0n),
      name: 'TestOrg',
      description: 'Test organization',
      ownerAddress: 'owner1',
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      version: 0n,
      isActive: true,
    });

    it('should create an organization', async () => {
      const org = createTestOrg();
      await store.createOrg(org);

      const retrieved = await store.getOrg(org.orgId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('TestOrg');
      expect(retrieved!.ownerAddress).toBe('owner1');
    });

    it('should reject duplicate org creation', async () => {
      const org = createTestOrg();
      await store.createOrg(org);

      await expect(store.createOrg(org)).rejects.toThrow('already exists');
    });

    it('should update an organization with correct version', async () => {
      const org = createTestOrg();
      await store.createOrg(org);

      await store.updateOrg(org.orgId, { name: 'UpdatedOrg' }, 0n);

      const updated = await store.getOrg(org.orgId);
      expect(updated!.name).toBe('UpdatedOrg');
      expect(updated!.version).toBe(1n);
    });

    it('should reject update with wrong version', async () => {
      const org = createTestOrg();
      await store.createOrg(org);

      await expect(
        store.updateOrg(org.orgId, { name: 'UpdatedOrg' }, 99n)
      ).rejects.toThrow(ConcurrencyError);
    });

    it('should list organizations by owner', async () => {
      const org1 = createTestOrg();
      const org2: OrgRegistration = {
        ...createTestOrg(),
        orgId: generateOrgId('owner2', 'Org2', 0n),
        name: 'Org2',
        ownerAddress: 'owner2',
      };

      await store.createOrg(org1);
      await store.createOrg(org2);

      const owner1Orgs = await store.listOrgs('owner1');
      expect(owner1Orgs.length).toBe(1);
      expect(owner1Orgs[0].name).toBe('TestOrg');

      const allOrgs = await store.listOrgs();
      expect(allOrgs.length).toBe(2);
    });
  });

  describe('Role operations', () => {
    let orgId: OrgId;

    beforeEach(async () => {
      orgId = generateOrgId('owner1', 'TestOrg', 0n);
      await store.createOrg({
        orgId,
        name: 'TestOrg',
        ownerAddress: 'owner1',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });
    });

    it('should create a role', async () => {
      const role: OrgRole = {
        roleId: generateRoleId(orgId, 'Admin', 0n),
        orgId,
        name: 'Admin',
        permissions: [Permissions.TX_SUBMIT, Permissions.ORG_ADMIN],
        inheritsFrom: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.createRole(role);

      const retrieved = await store.getRole(role.roleId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Admin');
      expect(retrieved!.permissions.length).toBe(2);
    });

    it('should reject role creation for non-existent org', async () => {
      const role: OrgRole = {
        roleId: generateRoleId(makeOrgId('fake'), 'Admin', 0n),
        orgId: makeOrgId('fake'),
        name: 'Admin',
        permissions: [],
        inheritsFrom: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await expect(store.createRole(role)).rejects.toThrow(NotFoundError);
    });

    it('should update a role', async () => {
      const role: OrgRole = {
        roleId: generateRoleId(orgId, 'Admin', 0n),
        orgId,
        name: 'Admin',
        permissions: [Permissions.TX_SUBMIT],
        inheritsFrom: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.createRole(role);
      await store.updateRole(role.roleId, {
        permissions: [Permissions.TX_SUBMIT, Permissions.ORG_ADMIN],
      }, 0n);

      const updated = await store.getRole(role.roleId);
      expect(updated!.permissions.length).toBe(2);
      expect(updated!.version).toBe(1n);
    });

    it('should list roles by org', async () => {
      const role1: OrgRole = {
        roleId: generateRoleId(orgId, 'Admin', 0n),
        orgId,
        name: 'Admin',
        permissions: [Permissions.ORG_ADMIN],
        inheritsFrom: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      const role2: OrgRole = {
        roleId: generateRoleId(orgId, 'User', 1n),
        orgId,
        name: 'User',
        permissions: [Permissions.TX_SUBMIT],
        inheritsFrom: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.createRole(role1);
      await store.createRole(role2);

      const roles = await store.listRoles(orgId);
      expect(roles.length).toBe(2);
    });
  });

  describe('Unit operations', () => {
    let orgId: OrgId;

    beforeEach(async () => {
      orgId = generateOrgId('owner1', 'TestOrg', 0n);
      await store.createOrg({
        orgId,
        name: 'TestOrg',
        ownerAddress: 'owner1',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });
    });

    it('should create a unit', async () => {
      const unit: OrgUnit = {
        unitId: generateUnitId(orgId, 'Engineering', 0n),
        orgId,
        parentUnitId: null,
        name: 'Engineering',
        createdAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.createUnit(unit);

      const retrieved = await store.getUnit(unit.unitId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Engineering');
    });

    it('should create nested units', async () => {
      const parentUnit: OrgUnit = {
        unitId: generateUnitId(orgId, 'Engineering', 0n),
        orgId,
        parentUnitId: null,
        name: 'Engineering',
        createdAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.createUnit(parentUnit);

      const childUnit: OrgUnit = {
        unitId: generateUnitId(orgId, 'Backend', 1n),
        orgId,
        parentUnitId: parentUnit.unitId,
        name: 'Backend',
        createdAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.createUnit(childUnit);

      const retrieved = await store.getUnit(childUnit.unitId);
      expect(retrieved!.parentUnitId).toBe(parentUnit.unitId);
    });

    it('should list units by org and parent', async () => {
      const eng: OrgUnit = {
        unitId: generateUnitId(orgId, 'Engineering', 0n),
        orgId,
        parentUnitId: null,
        name: 'Engineering',
        createdAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      const backend: OrgUnit = {
        unitId: generateUnitId(orgId, 'Backend', 1n),
        orgId,
        parentUnitId: eng.unitId,
        name: 'Backend',
        createdAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.createUnit(eng);
      await store.createUnit(backend);

      const topLevel = await store.listUnits(orgId, null);
      expect(topLevel.length).toBe(1);
      expect(topLevel[0].name).toBe('Engineering');

      const subUnits = await store.listUnits(orgId, eng.unitId);
      expect(subUnits.length).toBe(1);
      expect(subUnits[0].name).toBe('Backend');
    });
  });

  describe('Member operations', () => {
    let orgId: OrgId;
    let roleId: RoleId;

    beforeEach(async () => {
      orgId = generateOrgId('owner1', 'TestOrg', 0n);
      await store.createOrg({
        orgId,
        name: 'TestOrg',
        ownerAddress: 'owner1',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });

      roleId = generateRoleId(orgId, 'Admin', 0n);
      await store.createRole({
        roleId,
        orgId,
        name: 'Admin',
        permissions: [Permissions.TX_SUBMIT, Permissions.ORG_ADMIN],
        inheritsFrom: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });
    });

    it('should add a member', async () => {
      const member: OrgMember = {
        address: 'user1',
        orgId,
        roleAssignments: [{
          roleId,
          scopeUnitId: null,
          assignedAt: BigInt(Date.now()),
          assignedBy: 'owner1',
        }],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.addMember(member);

      const retrieved = await store.getMember(orgId, 'user1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.roleAssignments.length).toBe(1);
    });

    it('should reject duplicate member', async () => {
      const member: OrgMember = {
        address: 'user1',
        orgId,
        roleAssignments: [],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.addMember(member);
      await expect(store.addMember(member)).rejects.toThrow('already exists');
    });

    it('should update member roles', async () => {
      const member: OrgMember = {
        address: 'user1',
        orgId,
        roleAssignments: [{
          roleId,
          scopeUnitId: null,
          assignedAt: BigInt(Date.now()),
          assignedBy: 'owner1',
        }],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.addMember(member);
      await store.updateMember(orgId, 'user1', {
        roleAssignments: [], // Remove roles
      }, 0n);

      const updated = await store.getMember(orgId, 'user1');
      expect(updated!.roleAssignments.length).toBe(0);
    });

    it('should remove a member', async () => {
      const member: OrgMember = {
        address: 'user1',
        orgId,
        roleAssignments: [],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.addMember(member);
      await store.removeMember(orgId, 'user1');

      const retrieved = await store.getMember(orgId, 'user1');
      expect(retrieved).toBeUndefined();
    });

    it('should list members by role', async () => {
      const member1: OrgMember = {
        address: 'user1',
        orgId,
        roleAssignments: [{
          roleId,
          scopeUnitId: null,
          assignedAt: BigInt(Date.now()),
          assignedBy: 'owner1',
        }],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      const member2: OrgMember = {
        address: 'user2',
        orgId,
        roleAssignments: [],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await store.addMember(member1);
      await store.addMember(member2);

      const adminMembers = await store.listMembers(orgId, roleId);
      expect(adminMembers.length).toBe(1);
      expect(adminMembers[0].address).toBe('user1');

      const allMembers = await store.listMembers(orgId);
      expect(allMembers.length).toBe(2);
    });
  });

  describe('Permission checks', () => {
    let orgId: OrgId;
    let roleId: RoleId;

    beforeEach(async () => {
      orgId = generateOrgId('owner1', 'TestOrg', 0n);
      await store.createOrg({
        orgId,
        name: 'TestOrg',
        ownerAddress: 'owner1',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });

      roleId = generateRoleId(orgId, 'Admin', 0n);
      await store.createRole({
        roleId,
        orgId,
        name: 'Admin',
        permissions: [Permissions.TX_SUBMIT, Permissions.ORG_ADMIN],
        inheritsFrom: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });
    });

    it('should grant owner all permissions', async () => {
      const result = await store.checkPermission({
        address: 'owner1',
        orgId,
        permission: Permissions.ORG_ADMIN,
      });

      expect(result.granted).toBe(true);
      expect(result.grantedVia).toBe('owner');
    });

    it('should grant permission to member with role', async () => {
      await store.addMember({
        address: 'user1',
        orgId,
        roleAssignments: [{
          roleId,
          scopeUnitId: null,
          assignedAt: BigInt(Date.now()),
          assignedBy: 'owner1',
        }],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });

      const result = await store.checkPermission({
        address: 'user1',
        orgId,
        permission: Permissions.TX_SUBMIT,
      });

      expect(result.granted).toBe(true);
      expect(result.grantedVia).toBe('direct');
    });

    it('should deny permission to non-member', async () => {
      const result = await store.checkPermission({
        address: 'stranger',
        orgId,
        permission: Permissions.TX_SUBMIT,
      });

      expect(result.granted).toBe(false);
      expect(result.deniedReason).toContain('Not a member');
    });

    it('should deny permission not granted by role', async () => {
      await store.addMember({
        address: 'user1',
        orgId,
        roleAssignments: [{
          roleId,
          scopeUnitId: null,
          assignedAt: BigInt(Date.now()),
          assignedBy: 'owner1',
        }],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });

      const result = await store.checkPermission({
        address: 'user1',
        orgId,
        permission: Permissions.ASSET_MINT, // Not in Admin role
      });

      expect(result.granted).toBe(false);
    });

    it('should get all member permissions', async () => {
      await store.addMember({
        address: 'user1',
        orgId,
        roleAssignments: [{
          roleId,
          scopeUnitId: null,
          assignedAt: BigInt(Date.now()),
          assignedBy: 'owner1',
        }],
        joinedAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      });

      const perms = await store.getMemberPermissions(orgId, 'user1');
      expect(perms.has(Permissions.TX_SUBMIT)).toBe(true);
      expect(perms.has(Permissions.ORG_ADMIN)).toBe(true);
      expect(perms.size).toBe(2);
    });
  });

  describe('ID generation', () => {
    it('should generate deterministic org IDs', () => {
      const id1 = generateOrgId('owner', 'Test', 0n);
      const id2 = generateOrgId('owner', 'Test', 0n);
      const id3 = generateOrgId('owner', 'Test', 1n);

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });

    it('should generate deterministic role IDs', () => {
      const orgId = makeOrgId('org1');
      const id1 = generateRoleId(orgId, 'Admin', 0n);
      const id2 = generateRoleId(orgId, 'Admin', 0n);
      const id3 = generateRoleId(orgId, 'User', 0n);

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });

    it('should generate deterministic unit IDs', () => {
      const orgId = makeOrgId('org1');
      const id1 = generateUnitId(orgId, 'Engineering', 0n);
      const id2 = generateUnitId(orgId, 'Engineering', 0n);
      const id3 = generateUnitId(orgId, 'Marketing', 0n);

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });
  });
});
