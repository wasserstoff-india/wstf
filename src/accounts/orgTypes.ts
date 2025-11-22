/**
 * Org/RBAC Types - Organization, Roles, and Permission system types
 *
 * Hierarchical structure:
 * - Org (organization) → Units (departments/teams) → Roles → Members
 * - Permissions are strings like "tx.submit", "org.admin", "approval.sign"
 * - Roles can inherit from parent roles
 * - Members are assigned roles with optional scope (unit-level)
 */

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/** Organization identifier (deterministic hash) */
export type OrgId = string & { readonly __brand: 'OrgId' };

/** Role identifier within an org */
export type RoleId = string & { readonly __brand: 'RoleId' };

/** Organizational unit identifier */
export type UnitId = string & { readonly __brand: 'UnitId' };

/** Permission string (e.g., "tx.submit", "org.admin") */
export type PermissionStr = string & { readonly __brand: 'PermissionStr' };

// ============================================================================
// Permission Constants
// ============================================================================

/** Standard permission strings */
export const Permissions = {
  // Transaction permissions
  TX_SUBMIT: 'tx.submit' as PermissionStr,
  TX_BATCH: 'tx.batch' as PermissionStr,
  TX_CANCEL: 'tx.cancel' as PermissionStr,

  // Org management permissions
  ORG_ADMIN: 'org.admin' as PermissionStr,
  ORG_READ: 'org.read' as PermissionStr,
  ORG_MEMBER_ADD: 'org.member.add' as PermissionStr,
  ORG_MEMBER_REMOVE: 'org.member.remove' as PermissionStr,
  ORG_ROLE_CREATE: 'org.role.create' as PermissionStr,
  ORG_ROLE_UPDATE: 'org.role.update' as PermissionStr,
  ORG_UNIT_CREATE: 'org.unit.create' as PermissionStr,
  ORG_UNIT_UPDATE: 'org.unit.update' as PermissionStr,

  // Approval permissions
  APPROVAL_SIGN: 'approval.sign' as PermissionStr,
  APPROVAL_CREATE: 'approval.create' as PermissionStr,
  APPROVAL_CANCEL: 'approval.cancel' as PermissionStr,

  // Asset permissions
  ASSET_TRANSFER: 'asset.transfer' as PermissionStr,
  ASSET_MINT: 'asset.mint' as PermissionStr,
  ASSET_BURN: 'asset.burn' as PermissionStr,

  // Program permissions
  PROG_DEPLOY: 'prog.deploy' as PermissionStr,
  PROG_CALL: 'prog.call' as PermissionStr,
  PROG_UPGRADE: 'prog.upgrade' as PermissionStr,
} as const;

// ============================================================================
// Organization Types
// ============================================================================

/** Organization registration/state */
export interface OrgRegistration {
  /** Unique org identifier */
  orgId: OrgId;

  /** Human-readable name */
  name: string;

  /** Optional description */
  description?: string;

  /** Owner address (can transfer ownership) */
  ownerAddress: string;

  /** Creation timestamp (block height or unix ms) */
  createdAt: bigint;

  /** Last update timestamp */
  updatedAt: bigint;

  /** Version for optimistic concurrency */
  version: bigint;

  /** Custom metadata (JSON-serializable) */
  metadata?: Record<string, unknown>;

  /** Whether org is active */
  isActive: boolean;
}

/** Organizational unit (department, team, etc.) */
export interface OrgUnit {
  /** Unique unit identifier */
  unitId: UnitId;

  /** Parent org */
  orgId: OrgId;

  /** Parent unit (for hierarchy), null if top-level */
  parentUnitId: UnitId | null;

  /** Human-readable name */
  name: string;

  /** Optional description */
  description?: string;

  /** Creation timestamp */
  createdAt: bigint;

  /** Version for optimistic concurrency */
  version: bigint;

  /** Whether unit is active */
  isActive: boolean;
}

/** Role definition within an org */
export interface OrgRole {
  /** Unique role identifier */
  roleId: RoleId;

  /** Parent org */
  orgId: OrgId;

  /** Human-readable name */
  name: string;

  /** Optional description */
  description?: string;

  /** Direct permissions granted to this role */
  permissions: PermissionStr[];

  /** Parent roles to inherit from */
  inheritsFrom: RoleId[];

  /** Creation timestamp */
  createdAt: bigint;

  /** Last update timestamp */
  updatedAt: bigint;

  /** Version for optimistic concurrency */
  version: bigint;

  /** Whether role is active */
  isActive: boolean;
}

/** Member assignment linking address to org */
export interface OrgMember {
  /** Member's wallet address */
  address: string;

  /** Parent org */
  orgId: OrgId;

  /** Role assignments for this member */
  roleAssignments: RoleAssignment[];

  /** When member joined */
  joinedAt: bigint;

  /** Last update timestamp */
  updatedAt: bigint;

  /** Version for optimistic concurrency */
  version: bigint;

  /** Whether membership is active */
  isActive: boolean;
}

/** Assignment of a role to a member, optionally scoped to a unit */
export interface RoleAssignment {
  /** The role being assigned */
  roleId: RoleId;

  /** Optional scope (unit), null means org-wide */
  scopeUnitId: UnitId | null;

  /** When assignment was made */
  assignedAt: bigint;

  /** Who assigned this role (address) */
  assignedBy: string;

  /** Optional expiry timestamp */
  expiresAt?: bigint;
}

// ============================================================================
// Permission Check Types
// ============================================================================

/** Context for permission checks */
export interface PermissionContext {
  /** Address being checked */
  address: string;

  /** Org context */
  orgId: OrgId;

  /** Optional unit scope */
  unitId?: UnitId;

  /** Permission being checked */
  permission: PermissionStr;
}

/** Result of permission check */
export interface PermissionCheckResult {
  /** Whether permission is granted */
  granted: boolean;

  /** How permission was granted (direct, inherited, owner) */
  grantedVia?: 'direct' | 'inherited' | 'owner';

  /** Which role granted the permission */
  grantingRoleId?: RoleId;

  /** Reason if denied */
  deniedReason?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Create an OrgId from raw string */
export function makeOrgId(raw: string): OrgId {
  return raw as OrgId;
}

/** Create a RoleId from raw string */
export function makeRoleId(raw: string): RoleId {
  return raw as RoleId;
}

/** Create a UnitId from raw string */
export function makeUnitId(raw: string): UnitId {
  return raw as UnitId;
}

/** Create a PermissionStr from raw string */
export function makePermission(raw: string): PermissionStr {
  return raw as PermissionStr;
}

/** Check if a permission string is valid format */
export function isValidPermission(perm: string): boolean {
  // Format: category.action or category.subcategory.action
  return /^[a-z]+(\.[a-z]+){1,2}$/.test(perm);
}

/** Get all permissions from a role including inherited ones */
export function resolveRolePermissions(
  role: OrgRole,
  roleMap: Map<RoleId, OrgRole>,
  visited: Set<RoleId> = new Set()
): Set<PermissionStr> {
  // Prevent circular inheritance
  if (visited.has(role.roleId)) {
    return new Set();
  }
  visited.add(role.roleId);

  // Start with direct permissions
  const permissions = new Set<PermissionStr>(role.permissions);

  // Add inherited permissions
  for (const parentRoleId of role.inheritsFrom) {
    const parentRole = roleMap.get(parentRoleId);
    if (parentRole && parentRole.isActive) {
      const inherited = resolveRolePermissions(parentRole, roleMap, visited);
      for (const perm of inherited) {
        permissions.add(perm);
      }
    }
  }

  return permissions;
}

// ============================================================================
// Event Types for Org Operations
// ============================================================================

/** Event emitted when org is created */
export interface OrgCreatedEvent {
  type: 'ORG_CREATED';
  orgId: OrgId;
  name: string;
  ownerAddress: string;
  timestamp: bigint;
}

/** Event emitted when org is updated */
export interface OrgUpdatedEvent {
  type: 'ORG_UPDATED';
  orgId: OrgId;
  changes: Partial<Pick<OrgRegistration, 'name' | 'description' | 'ownerAddress' | 'isActive' | 'metadata'>>;
  timestamp: bigint;
}

/** Event emitted when role is created */
export interface RoleCreatedEvent {
  type: 'ROLE_CREATED';
  orgId: OrgId;
  roleId: RoleId;
  name: string;
  permissions: PermissionStr[];
  timestamp: bigint;
}

/** Event emitted when role is updated */
export interface RoleUpdatedEvent {
  type: 'ROLE_UPDATED';
  orgId: OrgId;
  roleId: RoleId;
  changes: Partial<Pick<OrgRole, 'name' | 'description' | 'permissions' | 'inheritsFrom' | 'isActive'>>;
  timestamp: bigint;
}

/** Event emitted when member is added */
export interface MemberAddedEvent {
  type: 'MEMBER_ADDED';
  orgId: OrgId;
  address: string;
  roleAssignments: RoleAssignment[];
  timestamp: bigint;
}

/** Event emitted when member is updated */
export interface MemberUpdatedEvent {
  type: 'MEMBER_UPDATED';
  orgId: OrgId;
  address: string;
  addedRoles?: RoleAssignment[];
  removedRoles?: RoleId[];
  timestamp: bigint;
}

/** Event emitted when member is removed */
export interface MemberRemovedEvent {
  type: 'MEMBER_REMOVED';
  orgId: OrgId;
  address: string;
  timestamp: bigint;
}

/** Event emitted when unit is created */
export interface UnitCreatedEvent {
  type: 'UNIT_CREATED';
  orgId: OrgId;
  unitId: UnitId;
  name: string;
  parentUnitId: UnitId | null;
  timestamp: bigint;
}

/** Event emitted when unit is updated */
export interface UnitUpdatedEvent {
  type: 'UNIT_UPDATED';
  orgId: OrgId;
  unitId: UnitId;
  changes: Partial<Pick<OrgUnit, 'name' | 'description' | 'parentUnitId' | 'isActive'>>;
  timestamp: bigint;
}

/** Union of all org events */
export type OrgEvent =
  | OrgCreatedEvent
  | OrgUpdatedEvent
  | RoleCreatedEvent
  | RoleUpdatedEvent
  | MemberAddedEvent
  | MemberUpdatedEvent
  | MemberRemovedEvent
  | UnitCreatedEvent
  | UnitUpdatedEvent;
