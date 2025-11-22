/**
 * SYS.ORG_* Instructions - Organization and RBAC management
 *
 * Handlers for creating and managing organizations, roles, units, and members.
 * All operations are deterministic and emit events for audit trail.
 */

import crypto from 'crypto';
import { InstructionRecord } from '../../instructions/abi';
import { ExecutionContext, ExecutionEffects } from '../types';
import { addLog, addEventLog } from '../engine';
import {
  OrgId,
  RoleId,
  UnitId,
  PermissionStr,
  OrgRegistration,
  OrgRole,
  OrgUnit,
  OrgMember,
  RoleAssignment,
  makeOrgId,
  makeRoleId,
  makeUnitId,
  makePermission,
  isValidPermission,
} from '../../accounts/orgTypes';
import { topicFromString, topicFromAddress, EventKey, Topic, EventData } from '../../events/logs/types';

// ============================================================================
// Event Keys for Org Operations
// ============================================================================

export const EVENT_KEY_ORG_CREATED = '0x4f52475f435245415445440000000000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_ORG_UPDATED = '0x4f52475f555044415445440000000000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_ROLE_CREATED = '0x524f4c455f4352454154454400000000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_ROLE_UPDATED = '0x524f4c455f5550444154454400000000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_UNIT_CREATED = '0x554e49545f4352454154454400000000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_UNIT_UPDATED = '0x554e49545f5550444154454400000000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_MEMBER_ADDED = '0x4d454d4245525f4144444544000000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_MEMBER_UPDATED = '0x4d454d4245525f555044415445440000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_MEMBER_REMOVED = '0x4d454d4245525f52454d4f5645440000000000000000000000000000000000' as EventKey;

// ============================================================================
// Helper Functions
// ============================================================================

/** Generate deterministic org ID */
function generateOrgId(ownerAddress: string, name: string, nonce: bigint): OrgId {
  const hash = crypto.createHash('sha256')
    .update(`org:${ownerAddress}:${name}:${nonce}`)
    .digest('hex')
    .slice(0, 16);
  return makeOrgId(`org_${hash}`);
}

/** Generate deterministic role ID */
function generateRoleId(orgId: OrgId, name: string, nonce: bigint): RoleId {
  const hash = crypto.createHash('sha256')
    .update(`role:${orgId}:${name}:${nonce}`)
    .digest('hex')
    .slice(0, 16);
  return makeRoleId(`role_${hash}`);
}

/** Generate deterministic unit ID */
function generateUnitId(orgId: OrgId, name: string, nonce: bigint): UnitId {
  const hash = crypto.createHash('sha256')
    .update(`unit:${orgId}:${name}:${nonce}`)
    .digest('hex')
    .slice(0, 16);
  return makeUnitId(`unit_${hash}`);
}

/** Get state ID for org (used as stateId in getState) */
function orgStateId(orgId: OrgId): string {
  return `org:${orgId}`;
}

/** Get state ID for role */
function roleStateId(roleId: RoleId): string {
  return `role:${roleId}`;
}

/** Get state ID for unit */
function unitStateId(unitId: UnitId): string {
  return `unit:${unitId}`;
}

/** Get state ID for member */
function memberStateId(orgId: OrgId, address: string): string {
  return `member:${orgId}:${address}`;
}

/** Data key used within StateData.data Map */
const DATA_KEY = 'data';

/** Encode object to state value */
function encodeState(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj, (_key, value) =>
    typeof value === 'bigint' ? value.toString() + 'n' : value
  ), 'utf8');
}

/** Decode state value to object */
function decodeState<T>(data: Map<string, Buffer>): T {
  // Get the 'data' key from the map which contains our serialized object
  const buffer = data.get('data');
  if (!buffer) {
    throw new Error('No data found in state');
  }
  return JSON.parse(buffer.toString('utf8'), (_key, value) => {
    if (typeof value === 'string' && value.endsWith('n') && /^\d+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return value;
  });
}

// ============================================================================
// ORG_CREATE Handler
// ============================================================================

export interface OrgCreateArgs {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  nonce: bigint;
}

/**
 * SYS.ORG_CREATE - Create a new organization
 * Args: { name, description?, metadata?, nonce }
 */
export async function handleORG_CREATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { name, description, metadata, nonce } = ir.args as OrgCreateArgs;

  // Validate name
  if (!name || typeof name !== 'string' || name.length < 1 || name.length > 64) {
    throw new Error('ORG_CREATE: name must be 1-64 characters');
  }

  // Generate org ID
  const orgId = generateOrgId(ctx.txFrom, name, BigInt(nonce || 0));

  // Check org doesn't already exist
  const existing = await ctx.getState(orgStateId(orgId));
  if (existing) {
    throw new Error(`ORG_CREATE: org ${orgId} already exists`);
  }

  const now = BigInt(Date.now());

  // Create org registration
  const org: OrgRegistration = {
    orgId,
    name,
    description,
    ownerAddress: ctx.txFrom,
    createdAt: now,
    updatedAt: now,
    version: 0n,
    metadata,
    isActive: true,
  };

  // Write to state - use the orgId as stateId and 'data' as key
  const stateId = orgStateId(orgId);
  const newVersion = crypto.createHash('sha256').update(encodeState(org)).digest('hex');

  effects.writes.push({
    stateId,
    key: 'data',
    value: encodeState(org),
    newVersion,
  });

  // Emit event
  addEventLog(effects, {
    module: 'SYS.ORG_CREATE',
    key: EVENT_KEY_ORG_CREATED,
    topics: [
      topicFromString(orgId),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${encodeState({ orgId, name, owner: ctx.txFrom }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_CREATE: Created org ${orgId}`, { name, owner: ctx.txFrom });
}

// ============================================================================
// ORG_UPDATE Handler
// ============================================================================

export interface OrgUpdateArgs {
  orgId: string;
  updates: {
    name?: string;
    description?: string;
    ownerAddress?: string;
    metadata?: Record<string, unknown>;
    isActive?: boolean;
  };
  expectedVersion: bigint;
}

/**
 * SYS.ORG_UPDATE - Update organization
 * Args: { orgId, updates, expectedVersion }
 */
export async function handleORG_UPDATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { orgId, updates, expectedVersion } = ir.args as OrgUpdateArgs;

  const stateId = orgStateId(makeOrgId(orgId));
  const existing = await ctx.getState(stateId);

  if (!existing) {
    throw new Error(`ORG_UPDATE: org ${orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(existing.data);

  // Check ownership
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`ORG_UPDATE: only owner can update org`);
  }

  // Check version
  if (org.version !== BigInt(expectedVersion)) {
    throw new Error(`ORG_UPDATE: version mismatch (expected ${expectedVersion}, got ${org.version})`);
  }

  // Apply updates
  const updated: OrgRegistration = {
    ...org,
    ...updates,
    orgId: org.orgId, // prevent overwrite
    createdAt: org.createdAt, // prevent overwrite
    updatedAt: BigInt(Date.now()),
    version: org.version + 1n,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  // Emit event
  addEventLog(effects, {
    module: 'SYS.ORG_UPDATE',
    key: EVENT_KEY_ORG_UPDATED,
    topics: [
      topicFromString(orgId),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${encodeState({ orgId, changes: Object.keys(updates) }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_UPDATE: Updated org ${orgId}`, { changes: Object.keys(updates) });
}

// ============================================================================
// ORG_ROLE_CREATE Handler
// ============================================================================

export interface RoleCreateArgs {
  orgId: string;
  name: string;
  description?: string;
  permissions: string[];
  inheritsFrom?: string[];
  nonce: bigint;
}

/**
 * SYS.ORG_ROLE_CREATE - Create role in organization
 * Args: { orgId, name, description?, permissions, inheritsFrom?, nonce }
 */
export async function handleORG_ROLE_CREATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { orgId, name, description, permissions, inheritsFrom, nonce } = ir.args as RoleCreateArgs;

  // Validate org exists and caller has authority
  const orgKey = orgStateId(makeOrgId(orgId));
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`ORG_ROLE_CREATE: org ${orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    // TODO: Check for org.role.create permission
    throw new Error(`ORG_ROLE_CREATE: only owner can create roles`);
  }

  // Validate permissions
  for (const perm of permissions) {
    if (!isValidPermission(perm)) {
      throw new Error(`ORG_ROLE_CREATE: invalid permission format: ${perm}`);
    }
  }

  // Generate role ID
  const roleId = generateRoleId(makeOrgId(orgId), name, BigInt(nonce || 0));

  // Check role doesn't exist
  const existingRole = await ctx.getState(roleStateId(roleId));
  if (existingRole) {
    throw new Error(`ORG_ROLE_CREATE: role ${roleId} already exists`);
  }

  // Validate inherited roles exist
  const inheritedRoles: RoleId[] = [];
  if (inheritsFrom) {
    for (const parentId of inheritsFrom) {
      const parentKey = roleStateId(makeRoleId(parentId));
      const parentState = await ctx.getState(parentKey);
      if (!parentState) {
        throw new Error(`ORG_ROLE_CREATE: inherited role ${parentId} not found`);
      }
      inheritedRoles.push(makeRoleId(parentId));
    }
  }

  const now = BigInt(Date.now());

  const role: OrgRole = {
    roleId,
    orgId: makeOrgId(orgId),
    name,
    description,
    permissions: permissions.map(makePermission),
    inheritsFrom: inheritedRoles,
    createdAt: now,
    updatedAt: now,
    version: 0n,
    isActive: true,
  };

  const stateId = roleStateId(roleId);
  const newVersion = crypto.createHash('sha256').update(encodeState(role)).digest('hex');

  effects.writes.push({
    stateId,
    key: DATA_KEY,
    value: encodeState(role),
    newVersion,
  });

  // Emit event
  addEventLog(effects, {
    module: 'SYS.ORG_ROLE_CREATE',
    key: EVENT_KEY_ROLE_CREATED,
    topics: [
      topicFromString(orgId),
      topicFromString(roleId),
    ],
    data: `0x${encodeState({ roleId, name, permissions }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_ROLE_CREATE: Created role ${roleId}`, { name, permissionCount: permissions.length });
}

// ============================================================================
// ORG_ROLE_UPDATE Handler
// ============================================================================

export interface RoleUpdateArgs {
  roleId: string;
  updates: {
    name?: string;
    description?: string;
    permissions?: string[];
    inheritsFrom?: string[];
    isActive?: boolean;
  };
  expectedVersion: bigint;
}

/**
 * SYS.ORG_ROLE_UPDATE - Update role
 * Args: { roleId, updates, expectedVersion }
 */
export async function handleORG_ROLE_UPDATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { roleId, updates, expectedVersion } = ir.args as RoleUpdateArgs;

  const stateKey = roleStateId(makeRoleId(roleId));
  const existing = await ctx.getState(stateKey);

  if (!existing) {
    throw new Error(`ORG_ROLE_UPDATE: role ${roleId} not found`);
  }

  const role = decodeState<OrgRole>(existing.data);

  // Check org ownership
  const orgKey = orgStateId(role.orgId);
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`ORG_ROLE_UPDATE: org ${role.orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`ORG_ROLE_UPDATE: only owner can update roles`);
  }

  // Check version
  if (role.version !== BigInt(expectedVersion)) {
    throw new Error(`ORG_ROLE_UPDATE: version mismatch`);
  }

  // Validate new permissions if provided
  if (updates.permissions) {
    for (const perm of updates.permissions) {
      if (!isValidPermission(perm)) {
        throw new Error(`ORG_ROLE_UPDATE: invalid permission format: ${perm}`);
      }
    }
  }

  // Apply updates
  const updated: OrgRole = {
    ...role,
    ...updates,
    roleId: role.roleId,
    orgId: role.orgId,
    createdAt: role.createdAt,
    updatedAt: BigInt(Date.now()),
    version: role.version + 1n,
    permissions: updates.permissions ? updates.permissions.map(makePermission) : role.permissions,
    inheritsFrom: updates.inheritsFrom ? updates.inheritsFrom.map(makeRoleId) : role.inheritsFrom,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId: stateKey,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.ORG_ROLE_UPDATE',
    key: EVENT_KEY_ROLE_UPDATED,
    topics: [
      topicFromString(role.orgId),
      topicFromString(roleId),
    ],
    data: `0x${encodeState({ roleId, changes: Object.keys(updates) }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_ROLE_UPDATE: Updated role ${roleId}`, { changes: Object.keys(updates) });
}

// ============================================================================
// ORG_UNIT_CREATE Handler
// ============================================================================

export interface UnitCreateArgs {
  orgId: string;
  name: string;
  description?: string;
  parentUnitId?: string;
  nonce: bigint;
}

/**
 * SYS.ORG_UNIT_CREATE - Create organizational unit
 * Args: { orgId, name, description?, parentUnitId?, nonce }
 */
export async function handleORG_UNIT_CREATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { orgId, name, description, parentUnitId, nonce } = ir.args as UnitCreateArgs;

  // Validate org exists
  const orgKey = orgStateId(makeOrgId(orgId));
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`ORG_UNIT_CREATE: org ${orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`ORG_UNIT_CREATE: only owner can create units`);
  }

  // Validate parent unit if provided
  if (parentUnitId) {
    const parentKey = unitStateId(makeUnitId(parentUnitId));
    const parentState = await ctx.getState(parentKey);
    if (!parentState) {
      throw new Error(`ORG_UNIT_CREATE: parent unit ${parentUnitId} not found`);
    }
  }

  // Generate unit ID
  const unitId = generateUnitId(makeOrgId(orgId), name, BigInt(nonce || 0));

  const now = BigInt(Date.now());

  const unit: OrgUnit = {
    unitId,
    orgId: makeOrgId(orgId),
    parentUnitId: parentUnitId ? makeUnitId(parentUnitId) : null,
    name,
    description,
    createdAt: now,
    version: 0n,
    isActive: true,
  };

  const stateId = unitStateId(unitId);
  const newVersion = crypto.createHash('sha256').update(encodeState(unit)).digest('hex');

  effects.writes.push({
    stateId,
    key: DATA_KEY,
    value: encodeState(unit),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.ORG_UNIT_CREATE',
    key: EVENT_KEY_UNIT_CREATED,
    topics: [
      topicFromString(orgId),
      topicFromString(unitId),
    ],
    data: `0x${encodeState({ unitId, name, parentUnitId }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_UNIT_CREATE: Created unit ${unitId}`, { name, parent: parentUnitId });
}

// ============================================================================
// ORG_UNIT_UPDATE Handler
// ============================================================================

export interface UnitUpdateArgs {
  unitId: string;
  updates: {
    name?: string;
    description?: string;
    parentUnitId?: string | null;
    isActive?: boolean;
  };
  expectedVersion: bigint;
}

/**
 * SYS.ORG_UNIT_UPDATE - Update organizational unit
 * Args: { unitId, updates, expectedVersion }
 */
export async function handleORG_UNIT_UPDATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { unitId, updates, expectedVersion } = ir.args as UnitUpdateArgs;

  const stateKey = unitStateId(makeUnitId(unitId));
  const existing = await ctx.getState(stateKey);

  if (!existing) {
    throw new Error(`ORG_UNIT_UPDATE: unit ${unitId} not found`);
  }

  const unit = decodeState<OrgUnit>(existing.data);

  // Check org ownership
  const orgKey = orgStateId(unit.orgId);
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`ORG_UNIT_UPDATE: org ${unit.orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`ORG_UNIT_UPDATE: only owner can update units`);
  }

  // Check version
  if (unit.version !== BigInt(expectedVersion)) {
    throw new Error(`ORG_UNIT_UPDATE: version mismatch`);
  }

  // Apply updates
  const updated: OrgUnit = {
    ...unit,
    ...updates,
    unitId: unit.unitId,
    orgId: unit.orgId,
    createdAt: unit.createdAt,
    version: unit.version + 1n,
    parentUnitId: updates.parentUnitId !== undefined
      ? (updates.parentUnitId ? makeUnitId(updates.parentUnitId) : null)
      : unit.parentUnitId,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId: stateKey,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.ORG_UNIT_UPDATE',
    key: EVENT_KEY_UNIT_UPDATED,
    topics: [
      topicFromString(unit.orgId),
      topicFromString(unitId),
    ],
    data: `0x${encodeState({ unitId, changes: Object.keys(updates) }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_UNIT_UPDATE: Updated unit ${unitId}`, { changes: Object.keys(updates) });
}

// ============================================================================
// ORG_MEMBER_ADD Handler
// ============================================================================

export interface MemberAddArgs {
  orgId: string;
  address: string;
  roleAssignments: Array<{
    roleId: string;
    scopeUnitId?: string;
    expiresAt?: bigint;
  }>;
}

/**
 * SYS.ORG_MEMBER_ADD - Add member to organization
 * Args: { orgId, address, roleAssignments }
 */
export async function handleORG_MEMBER_ADD(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { orgId, address, roleAssignments } = ir.args as MemberAddArgs;

  // Validate org exists
  const orgKey = orgStateId(makeOrgId(orgId));
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`ORG_MEMBER_ADD: org ${orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`ORG_MEMBER_ADD: only owner can add members`);
  }

  // Check member doesn't already exist
  const memberKey = memberStateId(makeOrgId(orgId), address);
  const existingMember = await ctx.getState(memberKey);
  if (existingMember) {
    throw new Error(`ORG_MEMBER_ADD: member ${address} already exists in org`);
  }

  // Validate role assignments
  const validatedAssignments: RoleAssignment[] = [];
  for (const assignment of roleAssignments) {
    const roleKey = roleStateId(makeRoleId(assignment.roleId));
    const roleState = await ctx.getState(roleKey);
    if (!roleState) {
      throw new Error(`ORG_MEMBER_ADD: role ${assignment.roleId} not found`);
    }

    validatedAssignments.push({
      roleId: makeRoleId(assignment.roleId),
      scopeUnitId: assignment.scopeUnitId ? makeUnitId(assignment.scopeUnitId) : null,
      assignedAt: BigInt(Date.now()),
      assignedBy: ctx.txFrom,
      expiresAt: assignment.expiresAt ? BigInt(assignment.expiresAt) : undefined,
    });
  }

  const now = BigInt(Date.now());

  const member: OrgMember = {
    address,
    orgId: makeOrgId(orgId),
    roleAssignments: validatedAssignments,
    joinedAt: now,
    updatedAt: now,
    version: 0n,
    isActive: true,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(member)).digest('hex');

  effects.writes.push({
    stateId: memberKey,
    key: DATA_KEY,
    value: encodeState(member),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.ORG_MEMBER_ADD',
    key: EVENT_KEY_MEMBER_ADDED,
    topics: [
      topicFromString(orgId),
      topicFromAddress(address),
    ],
    data: `0x${encodeState({ orgId, address, roleCount: roleAssignments.length }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_MEMBER_ADD: Added member ${address}`, { orgId, roles: roleAssignments.length });
}

// ============================================================================
// ORG_MEMBER_UPDATE Handler
// ============================================================================

export interface MemberUpdateArgs {
  orgId: string;
  address: string;
  addRoles?: Array<{
    roleId: string;
    scopeUnitId?: string;
    expiresAt?: bigint;
  }>;
  removeRoles?: string[];
  expectedVersion: bigint;
}

/**
 * SYS.ORG_MEMBER_UPDATE - Update member roles
 * Args: { orgId, address, addRoles?, removeRoles?, expectedVersion }
 */
export async function handleORG_MEMBER_UPDATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { orgId, address, addRoles, removeRoles, expectedVersion } = ir.args as MemberUpdateArgs;

  // Validate org exists
  const orgKey = orgStateId(makeOrgId(orgId));
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`ORG_MEMBER_UPDATE: org ${orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`ORG_MEMBER_UPDATE: only owner can update members`);
  }

  // Get existing member
  const memberKey = memberStateId(makeOrgId(orgId), address);
  const existing = await ctx.getState(memberKey);
  if (!existing) {
    throw new Error(`ORG_MEMBER_UPDATE: member ${address} not found in org`);
  }

  const member = decodeState<OrgMember>(existing.data);

  // Check version
  if (member.version !== BigInt(expectedVersion)) {
    throw new Error(`ORG_MEMBER_UPDATE: version mismatch`);
  }

  // Remove roles
  let updatedAssignments = [...member.roleAssignments];
  if (removeRoles) {
    const removeSet = new Set(removeRoles);
    updatedAssignments = updatedAssignments.filter((a) => !removeSet.has(a.roleId));
  }

  // Add roles
  if (addRoles) {
    for (const assignment of addRoles) {
      const roleKey = roleStateId(makeRoleId(assignment.roleId));
      const roleState = await ctx.getState(roleKey);
      if (!roleState) {
        throw new Error(`ORG_MEMBER_UPDATE: role ${assignment.roleId} not found`);
      }

      updatedAssignments.push({
        roleId: makeRoleId(assignment.roleId),
        scopeUnitId: assignment.scopeUnitId ? makeUnitId(assignment.scopeUnitId) : null,
        assignedAt: BigInt(Date.now()),
        assignedBy: ctx.txFrom,
        expiresAt: assignment.expiresAt ? BigInt(assignment.expiresAt) : undefined,
      });
    }
  }

  const updated: OrgMember = {
    ...member,
    roleAssignments: updatedAssignments,
    updatedAt: BigInt(Date.now()),
    version: member.version + 1n,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId: memberKey,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.ORG_MEMBER_UPDATE',
    key: EVENT_KEY_MEMBER_UPDATED,
    topics: [
      topicFromString(orgId),
      topicFromAddress(address),
    ],
    data: `0x${encodeState({ orgId, address, added: addRoles?.length || 0, removed: removeRoles?.length || 0 }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_MEMBER_UPDATE: Updated member ${address}`, {
    added: addRoles?.length || 0,
    removed: removeRoles?.length || 0,
  });
}

// ============================================================================
// ORG_MEMBER_REMOVE Handler
// ============================================================================

export interface MemberRemoveArgs {
  orgId: string;
  address: string;
}

/**
 * SYS.ORG_MEMBER_REMOVE - Remove member from organization
 * Args: { orgId, address }
 */
export async function handleORG_MEMBER_REMOVE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { orgId, address } = ir.args as MemberRemoveArgs;

  // Validate org exists
  const orgKey = orgStateId(makeOrgId(orgId));
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`ORG_MEMBER_REMOVE: org ${orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`ORG_MEMBER_REMOVE: only owner can remove members`);
  }

  // Get existing member
  const memberKey = memberStateId(makeOrgId(orgId), address);
  const existing = await ctx.getState(memberKey);
  if (!existing) {
    throw new Error(`ORG_MEMBER_REMOVE: member ${address} not found in org`);
  }

  // Delete member (set to null)
  effects.writes.push({
    stateId: memberKey,
    key: DATA_KEY,
    value: null,
    newVersion: crypto.randomBytes(32).toString('hex'),
  });

  addEventLog(effects, {
    module: 'SYS.ORG_MEMBER_REMOVE',
    key: EVENT_KEY_MEMBER_REMOVED,
    topics: [
      topicFromString(orgId),
      topicFromAddress(address),
    ],
    data: `0x${encodeState({ orgId, address }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `ORG_MEMBER_REMOVE: Removed member ${address}`, { orgId });
}

// ============================================================================
// ORG_CHECK_PERM Handler
// ============================================================================

export interface CheckPermArgs {
  orgId: string;
  address: string;
  permission: string;
  unitId?: string;
}

/**
 * SYS.ORG_CHECK_PERM - Check if address has permission
 * Args: { orgId, address, permission, unitId? }
 *
 * This is a read-only check that throws if permission denied.
 * Use as a gate in transactions.
 */
export async function handleORG_CHECK_PERM(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { orgId, address, permission, unitId } = ir.args as CheckPermArgs;

  // Get org
  const orgKey = orgStateId(makeOrgId(orgId));
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`ORG_CHECK_PERM: org ${orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);

  // Owner has all permissions
  if (org.ownerAddress === address) {
    addLog(effects, 'info', `ORG_CHECK_PERM: Granted (owner)`, { address, permission });
    return;
  }

  // Get member
  const memberKey = memberStateId(makeOrgId(orgId), address);
  const memberState = await ctx.getState(memberKey);
  if (!memberState) {
    throw new Error(`ORG_CHECK_PERM: permission denied - not a member`);
  }

  const member = decodeState<OrgMember>(memberState.data);
  if (!member.isActive) {
    throw new Error(`ORG_CHECK_PERM: permission denied - membership inactive`);
  }

  const now = BigInt(Date.now());
  const permStr = makePermission(permission);

  // Check each role assignment
  for (const assignment of member.roleAssignments) {
    // Skip expired
    if (assignment.expiresAt && assignment.expiresAt < now) {
      continue;
    }

    // Check scope
    if (unitId && assignment.scopeUnitId && assignment.scopeUnitId !== makeUnitId(unitId)) {
      // Would need to check unit hierarchy here
      continue;
    }

    // Get role
    const roleKey = roleStateId(assignment.roleId);
    const roleState = await ctx.getState(roleKey);
    if (!roleState) continue;

    const role = decodeState<OrgRole>(roleState.data);
    if (!role.isActive) continue;

    // Check direct permissions
    if (role.permissions.includes(permStr)) {
      addLog(effects, 'info', `ORG_CHECK_PERM: Granted (role: ${role.name})`, { address, permission });
      return;
    }

    // TODO: Check inherited permissions (would need recursive lookup)
  }

  throw new Error(`ORG_CHECK_PERM: permission denied - ${permission} not granted`);
}
