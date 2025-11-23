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
/**
 * Variable namespace identifier
 */
export type VarNamespace = string & {
    readonly __brand: 'VarNamespace';
};
/**
 * Variable key within a namespace
 */
export type VarKey = string & {
    readonly __brand: 'VarKey';
};
/**
 * Variable version (for optimistic concurrency)
 */
export type VarVersion = bigint;
/**
 * Namespace type discriminator
 */
export type NamespaceType = 'org' | 'app' | 'account' | 'global';
/**
 * Parsed namespace components
 */
export interface ParsedNamespace {
    type: NamespaceType;
    id: string;
}
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
/**
 * Create a namespace identifier
 */
export declare function makeNamespace(type: NamespaceType, id: string): VarNamespace;
/**
 * Create an org namespace
 */
export declare function orgNamespace(orgId: OrgId | string): VarNamespace;
/**
 * Create an app namespace
 */
export declare function appNamespace(appInstanceId: string): VarNamespace;
/**
 * Create an account namespace
 */
export declare function accountNamespace(address: string): VarNamespace;
/**
 * Get the global namespace
 */
export declare function globalNamespace(): VarNamespace;
/**
 * Create a variable key
 */
export declare function makeKey(key: string): VarKey;
/**
 * Parse a namespace into components
 */
export declare function parseNamespace(namespace: VarNamespace): ParsedNamespace;
/**
 * Encode a value to Buffer
 */
export declare function encodeValue(value: unknown, type: VarValueType): Buffer;
/**
 * Decode a value from Buffer
 */
export declare function decodeValue<T>(buf: Buffer, type: VarValueType): T;
/**
 * Validate namespace format
 */
export declare function isValidNamespace(namespace: string): boolean;
/**
 * Validate key format
 */
export declare function isValidKey(key: string): boolean;
/**
 * No permissions
 */
export declare const NO_PERMISSIONS: VarPermissions;
/**
 * Read-only permissions
 */
export declare const READ_ONLY: VarPermissions;
/**
 * Read-write permissions
 */
export declare const READ_WRITE: VarPermissions;
/**
 * Full permissions (except admin)
 */
export declare const FULL_ACCESS: VarPermissions;
/**
 * Admin permissions
 */
export declare const ADMIN_ACCESS: VarPermissions;
//# sourceMappingURL=types.d.ts.map