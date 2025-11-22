/**
 * Org Store - State management for Organizations, Roles, Units, and Members
 *
 * Provides CRUD operations with optimistic concurrency control.
 * All operations are deterministic and suitable for consensus.
 */

import {
  OrgId,
  RoleId,
  UnitId,
  PermissionStr,
  OrgRegistration,
  OrgUnit,
  OrgRole,
  OrgMember,
  RoleAssignment,
  PermissionContext,
  PermissionCheckResult,
  resolveRolePermissions,
  makeOrgId,
  makeRoleId,
  makeUnitId,
} from './orgTypes';

// ============================================================================
// Store Interface
// ============================================================================

/** Interface for org store implementations */
export interface OrgStore {
  // Organization operations
  createOrg(org: OrgRegistration): Promise<void>;
  getOrg(orgId: OrgId): Promise<OrgRegistration | undefined>;
  updateOrg(orgId: OrgId, updates: Partial<OrgRegistration>, expectedVersion: bigint): Promise<void>;
  listOrgs(ownerAddress?: string): Promise<OrgRegistration[]>;

  // Unit operations
  createUnit(unit: OrgUnit): Promise<void>;
  getUnit(unitId: UnitId): Promise<OrgUnit | undefined>;
  updateUnit(unitId: UnitId, updates: Partial<OrgUnit>, expectedVersion: bigint): Promise<void>;
  listUnits(orgId: OrgId, parentUnitId?: UnitId | null): Promise<OrgUnit[]>;

  // Role operations
  createRole(role: OrgRole): Promise<void>;
  getRole(roleId: RoleId): Promise<OrgRole | undefined>;
  updateRole(roleId: RoleId, updates: Partial<OrgRole>, expectedVersion: bigint): Promise<void>;
  listRoles(orgId: OrgId): Promise<OrgRole[]>;

  // Member operations
  addMember(member: OrgMember): Promise<void>;
  getMember(orgId: OrgId, address: string): Promise<OrgMember | undefined>;
  updateMember(orgId: OrgId, address: string, updates: Partial<OrgMember>, expectedVersion: bigint): Promise<void>;
  removeMember(orgId: OrgId, address: string): Promise<void>;
  listMembers(orgId: OrgId, roleId?: RoleId): Promise<OrgMember[]>;

  // Permission checks
  checkPermission(ctx: PermissionContext): Promise<PermissionCheckResult>;
  getMemberPermissions(orgId: OrgId, address: string): Promise<Set<PermissionStr>>;
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

/** Optimistic concurrency error */
export class ConcurrencyError extends Error {
  constructor(
    public entityType: string,
    public entityId: string,
    public expectedVersion: bigint,
    public actualVersion: bigint
  ) {
    super(`Concurrency conflict on ${entityType} ${entityId}: expected v${expectedVersion}, got v${actualVersion}`);
    this.name = 'ConcurrencyError';
  }
}

/** Not found error */
export class NotFoundError extends Error {
  constructor(
    public entityType: string,
    public entityId: string
  ) {
    super(`${entityType} not found: ${entityId}`);
    this.name = 'NotFoundError';
  }
}

/** In-memory org store for testing and single-node usage */
export class InMemoryOrgStore implements OrgStore {
  private orgs = new Map<OrgId, OrgRegistration>();
  private units = new Map<UnitId, OrgUnit>();
  private roles = new Map<RoleId, OrgRole>();
  private members = new Map<string, OrgMember>(); // key: orgId:address

  // -------------------------------------------------------------------------
  // Organization Operations
  // -------------------------------------------------------------------------

  async createOrg(org: OrgRegistration): Promise<void> {
    if (this.orgs.has(org.orgId)) {
      throw new Error(`Org already exists: ${org.orgId}`);
    }
    this.orgs.set(org.orgId, { ...org });
  }

  async getOrg(orgId: OrgId): Promise<OrgRegistration | undefined> {
    const org = this.orgs.get(orgId);
    return org ? { ...org } : undefined;
  }

  async updateOrg(orgId: OrgId, updates: Partial<OrgRegistration>, expectedVersion: bigint): Promise<void> {
    const org = this.orgs.get(orgId);
    if (!org) {
      throw new NotFoundError('Org', orgId);
    }
    if (org.version !== expectedVersion) {
      throw new ConcurrencyError('Org', orgId, expectedVersion, org.version);
    }

    this.orgs.set(orgId, {
      ...org,
      ...updates,
      orgId, // prevent overwrite
      version: org.version + 1n,
    });
  }

  async listOrgs(ownerAddress?: string): Promise<OrgRegistration[]> {
    const orgs = Array.from(this.orgs.values()).map((o) => ({ ...o }));
    if (ownerAddress) {
      return orgs.filter((o) => o.ownerAddress === ownerAddress);
    }
    return orgs;
  }

  // -------------------------------------------------------------------------
  // Unit Operations
  // -------------------------------------------------------------------------

  async createUnit(unit: OrgUnit): Promise<void> {
    if (this.units.has(unit.unitId)) {
      throw new Error(`Unit already exists: ${unit.unitId}`);
    }
    // Verify org exists
    if (!this.orgs.has(unit.orgId)) {
      throw new NotFoundError('Org', unit.orgId);
    }
    // Verify parent unit exists if specified
    if (unit.parentUnitId && !this.units.has(unit.parentUnitId)) {
      throw new NotFoundError('Unit', unit.parentUnitId);
    }
    this.units.set(unit.unitId, { ...unit });
  }

  async getUnit(unitId: UnitId): Promise<OrgUnit | undefined> {
    const unit = this.units.get(unitId);
    return unit ? { ...unit } : undefined;
  }

  async updateUnit(unitId: UnitId, updates: Partial<OrgUnit>, expectedVersion: bigint): Promise<void> {
    const unit = this.units.get(unitId);
    if (!unit) {
      throw new NotFoundError('Unit', unitId);
    }
    if (unit.version !== expectedVersion) {
      throw new ConcurrencyError('Unit', unitId, expectedVersion, unit.version);
    }

    this.units.set(unitId, {
      ...unit,
      ...updates,
      unitId, // prevent overwrite
      orgId: unit.orgId, // prevent overwrite
      version: unit.version + 1n,
    });
  }

  async listUnits(orgId: OrgId, parentUnitId?: UnitId | null): Promise<OrgUnit[]> {
    const units = Array.from(this.units.values())
      .filter((u) => u.orgId === orgId)
      .map((u) => ({ ...u }));

    if (parentUnitId !== undefined) {
      return units.filter((u) => u.parentUnitId === parentUnitId);
    }
    return units;
  }

  // -------------------------------------------------------------------------
  // Role Operations
  // -------------------------------------------------------------------------

  async createRole(role: OrgRole): Promise<void> {
    if (this.roles.has(role.roleId)) {
      throw new Error(`Role already exists: ${role.roleId}`);
    }
    // Verify org exists
    if (!this.orgs.has(role.orgId)) {
      throw new NotFoundError('Org', role.orgId);
    }
    // Verify parent roles exist
    for (const parentId of role.inheritsFrom) {
      if (!this.roles.has(parentId)) {
        throw new NotFoundError('Role', parentId);
      }
    }
    this.roles.set(role.roleId, { ...role, permissions: [...role.permissions], inheritsFrom: [...role.inheritsFrom] });
  }

  async getRole(roleId: RoleId): Promise<OrgRole | undefined> {
    const role = this.roles.get(roleId);
    return role ? { ...role, permissions: [...role.permissions], inheritsFrom: [...role.inheritsFrom] } : undefined;
  }

  async updateRole(roleId: RoleId, updates: Partial<OrgRole>, expectedVersion: bigint): Promise<void> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new NotFoundError('Role', roleId);
    }
    if (role.version !== expectedVersion) {
      throw new ConcurrencyError('Role', roleId, expectedVersion, role.version);
    }

    this.roles.set(roleId, {
      ...role,
      ...updates,
      roleId, // prevent overwrite
      orgId: role.orgId, // prevent overwrite
      version: role.version + 1n,
      permissions: updates.permissions ? [...updates.permissions] : [...role.permissions],
      inheritsFrom: updates.inheritsFrom ? [...updates.inheritsFrom] : [...role.inheritsFrom],
    });
  }

  async listRoles(orgId: OrgId): Promise<OrgRole[]> {
    return Array.from(this.roles.values())
      .filter((r) => r.orgId === orgId)
      .map((r) => ({ ...r, permissions: [...r.permissions], inheritsFrom: [...r.inheritsFrom] }));
  }

  // -------------------------------------------------------------------------
  // Member Operations
  // -------------------------------------------------------------------------

  private memberKey(orgId: OrgId, address: string): string {
    return `${orgId}:${address}`;
  }

  async addMember(member: OrgMember): Promise<void> {
    const key = this.memberKey(member.orgId, member.address);
    if (this.members.has(key)) {
      throw new Error(`Member already exists: ${member.address} in org ${member.orgId}`);
    }
    // Verify org exists
    if (!this.orgs.has(member.orgId)) {
      throw new NotFoundError('Org', member.orgId);
    }
    // Verify roles exist
    for (const assignment of member.roleAssignments) {
      if (!this.roles.has(assignment.roleId)) {
        throw new NotFoundError('Role', assignment.roleId);
      }
    }
    this.members.set(key, {
      ...member,
      roleAssignments: member.roleAssignments.map((a) => ({ ...a })),
    });
  }

  async getMember(orgId: OrgId, address: string): Promise<OrgMember | undefined> {
    const member = this.members.get(this.memberKey(orgId, address));
    return member
      ? {
          ...member,
          roleAssignments: member.roleAssignments.map((a) => ({ ...a })),
        }
      : undefined;
  }

  async updateMember(
    orgId: OrgId,
    address: string,
    updates: Partial<OrgMember>,
    expectedVersion: bigint
  ): Promise<void> {
    const key = this.memberKey(orgId, address);
    const member = this.members.get(key);
    if (!member) {
      throw new NotFoundError('Member', `${address} in ${orgId}`);
    }
    if (member.version !== expectedVersion) {
      throw new ConcurrencyError('Member', key, expectedVersion, member.version);
    }

    this.members.set(key, {
      ...member,
      ...updates,
      orgId, // prevent overwrite
      address, // prevent overwrite
      version: member.version + 1n,
      roleAssignments: updates.roleAssignments
        ? updates.roleAssignments.map((a) => ({ ...a }))
        : member.roleAssignments.map((a) => ({ ...a })),
    });
  }

  async removeMember(orgId: OrgId, address: string): Promise<void> {
    const key = this.memberKey(orgId, address);
    if (!this.members.has(key)) {
      throw new NotFoundError('Member', `${address} in ${orgId}`);
    }
    this.members.delete(key);
  }

  async listMembers(orgId: OrgId, roleId?: RoleId): Promise<OrgMember[]> {
    const members = Array.from(this.members.values())
      .filter((m) => m.orgId === orgId)
      .map((m) => ({
        ...m,
        roleAssignments: m.roleAssignments.map((a) => ({ ...a })),
      }));

    if (roleId) {
      return members.filter((m) => m.roleAssignments.some((a) => a.roleId === roleId));
    }
    return members;
  }

  // -------------------------------------------------------------------------
  // Permission Checks
  // -------------------------------------------------------------------------

  async checkPermission(ctx: PermissionContext): Promise<PermissionCheckResult> {
    // Check if org exists
    const org = this.orgs.get(ctx.orgId);
    if (!org || !org.isActive) {
      return { granted: false, deniedReason: 'Org not found or inactive' };
    }

    // Owner has all permissions
    if (org.ownerAddress === ctx.address) {
      return { granted: true, grantedVia: 'owner' };
    }

    // Get member
    const member = await this.getMember(ctx.orgId, ctx.address);
    if (!member || !member.isActive) {
      return { granted: false, deniedReason: 'Not a member of org' };
    }

    // Get current timestamp for expiry check
    const now = BigInt(Date.now());

    // Check each role assignment
    for (const assignment of member.roleAssignments) {
      // Skip expired assignments
      if (assignment.expiresAt && assignment.expiresAt < now) {
        continue;
      }

      // Check scope
      if (ctx.unitId && assignment.scopeUnitId && assignment.scopeUnitId !== ctx.unitId) {
        // Check if ctx.unitId is a child of assignment.scopeUnitId
        if (!(await this.isUnitDescendant(ctx.unitId, assignment.scopeUnitId))) {
          continue;
        }
      }

      const role = this.roles.get(assignment.roleId);
      if (!role || !role.isActive) {
        continue;
      }

      // Get all permissions for this role
      const permissions = resolveRolePermissions(role, this.roles);

      if (permissions.has(ctx.permission)) {
        // Check if direct or inherited
        const isDirect = role.permissions.includes(ctx.permission);
        return {
          granted: true,
          grantedVia: isDirect ? 'direct' : 'inherited',
          grantingRoleId: role.roleId,
        };
      }
    }

    return { granted: false, deniedReason: 'No role grants this permission' };
  }

  async getMemberPermissions(orgId: OrgId, address: string): Promise<Set<PermissionStr>> {
    const permissions = new Set<PermissionStr>();

    // Check if owner
    const org = this.orgs.get(orgId);
    if (org && org.ownerAddress === address) {
      // Owner gets all defined permissions
      return new Set(Object.values(permissions));
    }

    // Get member
    const member = await this.getMember(orgId, address);
    if (!member || !member.isActive) {
      return permissions;
    }

    const now = BigInt(Date.now());

    // Collect permissions from all active role assignments
    for (const assignment of member.roleAssignments) {
      if (assignment.expiresAt && assignment.expiresAt < now) {
        continue;
      }

      const role = this.roles.get(assignment.roleId);
      if (!role || !role.isActive) {
        continue;
      }

      const rolePerms = resolveRolePermissions(role, this.roles);
      for (const perm of rolePerms) {
        permissions.add(perm);
      }
    }

    return permissions;
  }

  /** Check if childId is a descendant of parentId in unit hierarchy */
  private async isUnitDescendant(childId: UnitId, parentId: UnitId): Promise<boolean> {
    const visited = new Set<UnitId>();
    let currentId: UnitId | null = childId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const unit = this.units.get(currentId);
      if (!unit) {
        return false;
      }
      if (unit.parentUnitId === parentId) {
        return true;
      }
      currentId = unit.parentUnitId;
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /** Clear all data (for testing) */
  clear(): void {
    this.orgs.clear();
    this.units.clear();
    this.roles.clear();
    this.members.clear();
  }

  /** Get stats for debugging */
  stats(): { orgs: number; units: number; roles: number; members: number } {
    return {
      orgs: this.orgs.size,
      units: this.units.size,
      roles: this.roles.size,
      members: this.members.size,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/** Create a new in-memory org store */
export function createOrgStore(): OrgStore {
  return new InMemoryOrgStore();
}

/** Generate a deterministic org ID from owner and name */
export function generateOrgId(ownerAddress: string, name: string, nonce: bigint): OrgId {
  // Simple deterministic ID generation
  // In production, use a proper hash
  const input = `org:${ownerAddress}:${name}:${nonce}`;
  const hash = simpleHash(input);
  return makeOrgId(`org_${hash}`);
}

/** Generate a deterministic role ID */
export function generateRoleId(orgId: OrgId, name: string, nonce: bigint): RoleId {
  const input = `role:${orgId}:${name}:${nonce}`;
  const hash = simpleHash(input);
  return makeRoleId(`role_${hash}`);
}

/** Generate a deterministic unit ID */
export function generateUnitId(orgId: OrgId, name: string, nonce: bigint): UnitId {
  const input = `unit:${orgId}:${name}:${nonce}`;
  const hash = simpleHash(input);
  return makeUnitId(`unit_${hash}`);
}

/** Simple deterministic hash for ID generation */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
