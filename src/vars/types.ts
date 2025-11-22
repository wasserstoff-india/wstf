/**
 * Variable Store Types
 *
 * Authenticated key/value store with namespacing and RBAC.
 *
 * Namespaces:
 * - org:{OrgId} - Organization-scoped variables
 * - app:{AppInstanceId} - Application instance variables
 * - account:{Address} - Account-private variables
 * - global - System-wide variables (admin only)
 */

import { OrgId } from '../accounts/orgTypes';

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Variable namespace identifier
 */
export type VarNamespace = string & { readonly __brand: 'VarNamespace' };

/**
 * Variable key within a namespace
 */
export type VarKey = string & { readonly __brand: 'VarKey' };

/**
 * Variable version (for optimistic concurrency)
 */
export type VarVersion = bigint;

// ============================================================================
// Namespace Types
// ============================================================================

/**
 * Namespace type discriminator
 */
export type NamespaceType = 'org' | 'app' | 'account' | 'global';

/**
 * Parsed namespace components
 */
export interface ParsedNamespace {
  type: NamespaceType;
  id: string; // OrgId, AppInstanceId, Address, or 'global'
}

// ============================================================================
// Variable Types
// ============================================================================

/**
 * Variable value types supported
 */
export type VarValueType = 'string' | 'number' | 'bigint' | 'boolean' | 'buffer' | 'json';

/**
 * Variable metadata
 */
export interface VarMetadata {
  /** Variable type for serialization */
  type: VarValueType;
  /** Creation timestamp */
  createdAt: bigint;
  /** Last update timestamp */
  updatedAt: bigint;
  /** Creator address */
  createdBy: string;
  /** Last updater address */
  updatedBy: string;
  /** Optional expiry timestamp */
  expiresAt?: bigint;
  /** Optional description */
  description?: string;
  /** Custom tags */
  tags?: string[];
}

/**
 * Complete variable record
 */
export interface VarRecord {
  namespace: VarNamespace;
  key: VarKey;
  value: Buffer;
  metadata: VarMetadata;
  version: VarVersion;
}

/**
 * Variable with decoded value
 */
export interface DecodedVar<T = unknown> {
  namespace: VarNamespace;
  key: VarKey;
  value: T;
  metadata: VarMetadata;
  version: VarVersion;
}

// ============================================================================
// Access Control
// ============================================================================

/**
 * Variable access permissions
 */
export interface VarPermissions {
  /** Can read the variable */
  read: boolean;
  /** Can write the variable */
  write: boolean;
  /** Can delete the variable */
  delete: boolean;
  /** Can manage permissions */
  admin: boolean;
}

/**
 * Permission grant for a variable or namespace
 */
export interface PermissionGrant {
  /** Grantee address or role */
  grantee: string;
  /** Type: address or role */
  granteeType: 'address' | 'role';
  /** Permissions granted */
  permissions: VarPermissions;
  /** Expiry time (optional) */
  expiresAt?: bigint;
}

/**
 * Access control list for a namespace
 */
export interface NamespaceACL {
  namespace: VarNamespace;
  /** Owner address */
  owner: string;
  /** Default permissions for namespace members */
  defaultPermissions: VarPermissions;
  /** Explicit grants */
  grants: PermissionGrant[];
  /** Whether the namespace is public readable */
  publicReadable: boolean;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Variable list filters
 */
export interface VarListFilters {
  /** Prefix match on key */
  keyPrefix?: string;
  /** Tag filter */
  tags?: string[];
  /** Created after timestamp */
  createdAfter?: bigint;
  /** Created before timestamp */
  createdBefore?: bigint;
  /** Updated after timestamp */
  updatedAfter?: bigint;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Variable query result
 */
export interface VarQueryResult {
  records: VarRecord[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Operation Types
// ============================================================================

/**
 * Write operation
 */
export interface VarWriteOp {
  namespace: VarNamespace;
  key: VarKey;
  value: Buffer;
  type: VarValueType;
  /** Expected version for OCC (undefined = create new) */
  expectedVersion?: VarVersion;
  /** Optional metadata updates */
  metadata?: Partial<Pick<VarMetadata, 'description' | 'tags' | 'expiresAt'>>;
}

/**
 * Batch write operation
 */
export interface VarBatchWrite {
  operations: VarWriteOp[];
  /** All or nothing */
  atomic: boolean;
}

/**
 * Write result
 */
export interface VarWriteResult {
  success: boolean;
  newVersion?: VarVersion;
  error?: string;
}

/**
 * Batch write result
 */
export interface VarBatchResult {
  success: boolean;
  results: VarWriteResult[];
  error?: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a namespace identifier
 */
export function makeNamespace(type: NamespaceType, id: string): VarNamespace {
  if (type === 'global') {
    return 'global' as VarNamespace;
  }
  return `${type}:${id}` as VarNamespace;
}

/**
 * Create an org namespace
 */
export function orgNamespace(orgId: OrgId | string): VarNamespace {
  return makeNamespace('org', orgId as string);
}

/**
 * Create an app namespace
 */
export function appNamespace(appInstanceId: string): VarNamespace {
  return makeNamespace('app', appInstanceId);
}

/**
 * Create an account namespace
 */
export function accountNamespace(address: string): VarNamespace {
  return makeNamespace('account', address);
}

/**
 * Get the global namespace
 */
export function globalNamespace(): VarNamespace {
  return 'global' as VarNamespace;
}

/**
 * Create a variable key
 */
export function makeKey(key: string): VarKey {
  return key as VarKey;
}

/**
 * Parse a namespace into components
 */
export function parseNamespace(namespace: VarNamespace): ParsedNamespace {
  if (namespace === 'global') {
    return { type: 'global', id: 'global' };
  }

  const colonIndex = namespace.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`Invalid namespace format: ${namespace}`);
  }

  const type = namespace.slice(0, colonIndex) as NamespaceType;
  const id = namespace.slice(colonIndex + 1);

  if (!['org', 'app', 'account'].includes(type)) {
    throw new Error(`Invalid namespace type: ${type}`);
  }

  return { type, id };
}

// ============================================================================
// Value Encoding/Decoding
// ============================================================================

/**
 * Encode a value to Buffer
 */
export function encodeValue(value: unknown, type: VarValueType): Buffer {
  switch (type) {
    case 'string':
      return Buffer.from(String(value), 'utf8');
    case 'number':
      const num = Number(value);
      const numBuf = Buffer.alloc(8);
      numBuf.writeDoubleLE(num);
      return numBuf;
    case 'bigint':
      return Buffer.from(BigInt(value as bigint).toString());
    case 'boolean':
      return Buffer.from(value ? [1] : [0]);
    case 'buffer':
      if (Buffer.isBuffer(value)) {
        return value;
      }
      throw new Error('Expected Buffer for buffer type');
    case 'json':
      return Buffer.from(JSON.stringify(value), 'utf8');
    default:
      throw new Error(`Unknown value type: ${type}`);
  }
}

/**
 * Decode a value from Buffer
 */
export function decodeValue<T>(buf: Buffer, type: VarValueType): T {
  switch (type) {
    case 'string':
      return buf.toString('utf8') as T;
    case 'number':
      return buf.readDoubleLE() as T;
    case 'bigint':
      return BigInt(buf.toString()) as T;
    case 'boolean':
      return (buf[0] === 1) as T;
    case 'buffer':
      return buf as T;
    case 'json':
      return JSON.parse(buf.toString('utf8')) as T;
    default:
      throw new Error(`Unknown value type: ${type}`);
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate namespace format
 */
export function isValidNamespace(namespace: string): boolean {
  if (namespace === 'global') {
    return true;
  }

  const colonIndex = namespace.indexOf(':');
  if (colonIndex === -1) {
    return false;
  }

  const type = namespace.slice(0, colonIndex);
  const id = namespace.slice(colonIndex + 1);

  return ['org', 'app', 'account'].includes(type) && id.length > 0;
}

/**
 * Validate key format
 */
export function isValidKey(key: string): boolean {
  // Keys must be non-empty and not contain certain characters
  if (!key || key.length === 0 || key.length > 256) {
    return false;
  }
  // Allow alphanumeric, dots, underscores, dashes, colons, slashes
  return /^[a-zA-Z0-9._\-:/]+$/.test(key);
}

// ============================================================================
// Default Permissions
// ============================================================================

/**
 * No permissions
 */
export const NO_PERMISSIONS: VarPermissions = {
  read: false,
  write: false,
  delete: false,
  admin: false,
};

/**
 * Read-only permissions
 */
export const READ_ONLY: VarPermissions = {
  read: true,
  write: false,
  delete: false,
  admin: false,
};

/**
 * Read-write permissions
 */
export const READ_WRITE: VarPermissions = {
  read: true,
  write: true,
  delete: false,
  admin: false,
};

/**
 * Full permissions (except admin)
 */
export const FULL_ACCESS: VarPermissions = {
  read: true,
  write: true,
  delete: true,
  admin: false,
};

/**
 * Admin permissions
 */
export const ADMIN_ACCESS: VarPermissions = {
  read: true,
  write: true,
  delete: true,
  admin: true,
};
