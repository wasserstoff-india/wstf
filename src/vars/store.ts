/**
 * Variable Store - State management for authenticated key/value pairs
 *
 * Provides CRUD operations with namespace-based access control.
 * All operations are deterministic and suitable for consensus.
 */

import {
  VarNamespace,
  VarKey,
  VarVersion,
  VarValueType,
  VarRecord,
  VarMetadata,
  VarPermissions,
  VarWriteOp,
  VarWriteResult,
  VarBatchWrite,
  VarBatchResult,
  VarListFilters,
  VarQueryResult,
  NamespaceACL,
  PermissionGrant,
  ParsedNamespace,
  parseNamespace,
  makeKey,
  NO_PERMISSIONS,
  READ_ONLY,
  READ_WRITE,
  ADMIN_ACCESS,
  isValidKey,
} from './types';
import { OrgStore } from '../accounts/orgStore';
import { OrgId, Permissions as OrgPermissions } from '../accounts/orgTypes';

// ============================================================================
// Store Interface
// ============================================================================

/**
 * Interface for variable store implementations
 */
export interface VarStore {
  // Read operations
  get(namespace: VarNamespace, key: VarKey, caller: string): Promise<VarRecord | undefined>;
  list(namespace: VarNamespace, caller: string, filters?: VarListFilters): Promise<VarQueryResult>;
  exists(namespace: VarNamespace, key: VarKey): Promise<boolean>;

  // Write operations
  set(op: VarWriteOp, caller: string): Promise<VarWriteResult>;
  delete(namespace: VarNamespace, key: VarKey, caller: string, expectedVersion?: VarVersion): Promise<VarWriteResult>;
  batch(batch: VarBatchWrite, caller: string): Promise<VarBatchResult>;

  // Namespace management
  createNamespace(namespace: VarNamespace, owner: string, acl?: Partial<NamespaceACL>): Promise<void>;
  getNamespaceACL(namespace: VarNamespace): Promise<NamespaceACL | undefined>;
  updateNamespaceACL(namespace: VarNamespace, updates: Partial<NamespaceACL>, caller: string): Promise<void>;
  grantPermission(namespace: VarNamespace, grant: PermissionGrant, caller: string): Promise<void>;
  revokePermission(namespace: VarNamespace, grantee: string, caller: string): Promise<void>;

  // Permission checks
  checkPermission(namespace: VarNamespace, key: VarKey, caller: string, permission: keyof VarPermissions): Promise<boolean>;
}

// ============================================================================
// Errors
// ============================================================================

export class VarNotFoundError extends Error {
  constructor(
    public namespace: VarNamespace,
    public key: VarKey
  ) {
    super(`Variable not found: ${namespace}/${key}`);
    this.name = 'VarNotFoundError';
  }
}

export class VarConcurrencyError extends Error {
  constructor(
    public namespace: VarNamespace,
    public key: VarKey,
    public expectedVersion: VarVersion,
    public actualVersion: VarVersion
  ) {
    super(`Concurrency conflict on ${namespace}/${key}: expected v${expectedVersion}, got v${actualVersion}`);
    this.name = 'VarConcurrencyError';
  }
}

export class VarPermissionError extends Error {
  constructor(
    public namespace: VarNamespace,
    public key: VarKey | undefined,
    public caller: string,
    public permission: string
  ) {
    super(`Permission denied: ${caller} lacks ${permission} on ${namespace}${key ? '/' + key : ''}`);
    this.name = 'VarPermissionError';
  }
}

export class NamespaceNotFoundError extends Error {
  constructor(public namespace: VarNamespace) {
    super(`Namespace not found: ${namespace}`);
    this.name = 'NamespaceNotFoundError';
  }
}

export class NamespaceExistsError extends Error {
  constructor(public namespace: VarNamespace) {
    super(`Namespace already exists: ${namespace}`);
    this.name = 'NamespaceExistsError';
  }
}

export class InvalidKeyError extends Error {
  constructor(public key: string) {
    super(`Invalid key format: ${key}`);
    this.name = 'InvalidKeyError';
  }
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

/**
 * In-memory variable store for testing and single-node usage
 */
export class InMemoryVarStore implements VarStore {
  private variables = new Map<string, VarRecord>(); // key: namespace/key
  private namespaces = new Map<VarNamespace, NamespaceACL>();
  private orgStore?: OrgStore;

  constructor(orgStore?: OrgStore) {
    this.orgStore = orgStore;
  }

  private varKey(namespace: VarNamespace, key: VarKey): string {
    return `${namespace}/${key}`;
  }

  // -------------------------------------------------------------------------
  // Read Operations
  // -------------------------------------------------------------------------

  async get(namespace: VarNamespace, key: VarKey, caller: string): Promise<VarRecord | undefined> {
    const hasPermission = await this.checkPermission(namespace, key, caller, 'read');
    if (!hasPermission) {
      throw new VarPermissionError(namespace, key, caller, 'read');
    }

    const record = this.variables.get(this.varKey(namespace, key));
    if (!record) {
      return undefined;
    }

    // Check expiry
    if (record.metadata.expiresAt && record.metadata.expiresAt <= BigInt(Date.now())) {
      return undefined;
    }

    return this.cloneRecord(record);
  }

  async list(namespace: VarNamespace, caller: string, filters?: VarListFilters): Promise<VarQueryResult> {
    const hasPermission = await this.checkPermission(namespace, undefined as any, caller, 'read');
    if (!hasPermission) {
      throw new VarPermissionError(namespace, undefined, caller, 'read');
    }

    const prefix = `${namespace}/`;
    const now = BigInt(Date.now());
    let records: VarRecord[] = [];

    for (const [k, record] of this.variables) {
      if (!k.startsWith(prefix)) continue;

      // Skip expired
      if (record.metadata.expiresAt && record.metadata.expiresAt <= now) continue;

      // Apply filters
      if (filters?.keyPrefix) {
        const keyPart = k.slice(prefix.length);
        if (!keyPart.startsWith(filters.keyPrefix)) continue;
      }

      if (filters?.tags && filters.tags.length > 0) {
        if (!record.metadata.tags || !filters.tags.every(t => record.metadata.tags!.includes(t))) continue;
      }

      if (filters?.createdAfter !== undefined && record.metadata.createdAt < filters.createdAfter) continue;
      if (filters?.createdBefore !== undefined && record.metadata.createdAt > filters.createdBefore) continue;
      if (filters?.updatedAfter !== undefined && record.metadata.updatedAt < filters.updatedAfter) continue;

      records.push(this.cloneRecord(record));
    }

    // Sort by key
    records.sort((a, b) => a.key.localeCompare(b.key));

    const total = records.length;
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? records.length;

    records = records.slice(offset, offset + limit);

    return {
      records,
      total,
      hasMore: offset + records.length < total,
    };
  }

  async exists(namespace: VarNamespace, key: VarKey): Promise<boolean> {
    const record = this.variables.get(this.varKey(namespace, key));
    if (!record) return false;

    // Check expiry
    if (record.metadata.expiresAt && record.metadata.expiresAt <= BigInt(Date.now())) {
      return false;
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // Write Operations
  // -------------------------------------------------------------------------

  async set(op: VarWriteOp, caller: string): Promise<VarWriteResult> {
    // Validate key
    if (!isValidKey(op.key)) {
      return { success: false, error: `Invalid key format: ${op.key}` };
    }

    // Check permission
    const hasPermission = await this.checkPermission(op.namespace, op.key, caller, 'write');
    if (!hasPermission) {
      return { success: false, error: `Permission denied: ${caller} lacks write on ${op.namespace}/${op.key}` };
    }

    const fullKey = this.varKey(op.namespace, op.key);
    const existing = this.variables.get(fullKey);
    const now = BigInt(Date.now());

    // OCC check
    if (op.expectedVersion !== undefined) {
      if (!existing) {
        return { success: false, error: `Variable does not exist: ${op.namespace}/${op.key}` };
      }
      if (existing.version !== op.expectedVersion) {
        return { success: false, error: `Version mismatch: expected ${op.expectedVersion}, got ${existing.version}` };
      }
    } else if (existing) {
      // Create new but already exists - that's ok, we'll update
    }

    const newVersion = existing ? existing.version + 1n : 0n;

    const metadata: VarMetadata = existing ? {
      ...existing.metadata,
      type: op.type,
      updatedAt: now,
      updatedBy: caller,
      ...(op.metadata?.description !== undefined && { description: op.metadata.description }),
      ...(op.metadata?.tags !== undefined && { tags: op.metadata.tags }),
      ...(op.metadata?.expiresAt !== undefined && { expiresAt: op.metadata.expiresAt }),
    } : {
      type: op.type,
      createdAt: now,
      updatedAt: now,
      createdBy: caller,
      updatedBy: caller,
      ...(op.metadata?.description !== undefined && { description: op.metadata.description }),
      ...(op.metadata?.tags !== undefined && { tags: op.metadata.tags }),
      ...(op.metadata?.expiresAt !== undefined && { expiresAt: op.metadata.expiresAt }),
    };

    const record: VarRecord = {
      namespace: op.namespace,
      key: op.key,
      value: op.value,
      metadata,
      version: newVersion,
    };

    this.variables.set(fullKey, record);

    return { success: true, newVersion };
  }

  async delete(namespace: VarNamespace, key: VarKey, caller: string, expectedVersion?: VarVersion): Promise<VarWriteResult> {
    const hasPermission = await this.checkPermission(namespace, key, caller, 'delete');
    if (!hasPermission) {
      return { success: false, error: `Permission denied: ${caller} lacks delete on ${namespace}/${key}` };
    }

    const fullKey = this.varKey(namespace, key);
    const existing = this.variables.get(fullKey);

    if (!existing) {
      return { success: false, error: `Variable does not exist: ${namespace}/${key}` };
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      return { success: false, error: `Version mismatch: expected ${expectedVersion}, got ${existing.version}` };
    }

    this.variables.delete(fullKey);

    return { success: true };
  }

  async batch(batch: VarBatchWrite, caller: string): Promise<VarBatchResult> {
    if (!batch.atomic) {
      // Non-atomic: execute all, collect results
      const results: VarWriteResult[] = [];
      for (const op of batch.operations) {
        results.push(await this.set(op, caller));
      }
      return { success: results.every(r => r.success), results };
    }

    // Atomic: validate all first, then execute
    const validations: VarWriteResult[] = [];

    for (const op of batch.operations) {
      if (!isValidKey(op.key)) {
        validations.push({ success: false, error: `Invalid key format: ${op.key}` });
        continue;
      }

      const hasPermission = await this.checkPermission(op.namespace, op.key, caller, 'write');
      if (!hasPermission) {
        validations.push({ success: false, error: `Permission denied: ${caller} lacks write on ${op.namespace}/${op.key}` });
        continue;
      }

      if (op.expectedVersion !== undefined) {
        const existing = this.variables.get(this.varKey(op.namespace, op.key));
        if (!existing || existing.version !== op.expectedVersion) {
          validations.push({ success: false, error: `Version mismatch on ${op.namespace}/${op.key}` });
          continue;
        }
      }

      validations.push({ success: true });
    }

    // If any validation failed, abort
    const failed = validations.find(v => !v.success);
    if (failed) {
      return { success: false, results: validations, error: 'Atomic batch failed validation' };
    }

    // Execute all
    const results: VarWriteResult[] = [];
    for (const op of batch.operations) {
      results.push(await this.set(op, caller));
    }

    return { success: true, results };
  }

  // -------------------------------------------------------------------------
  // Namespace Management
  // -------------------------------------------------------------------------

  async createNamespace(namespace: VarNamespace, owner: string, acl?: Partial<NamespaceACL>): Promise<void> {
    if (this.namespaces.has(namespace)) {
      throw new NamespaceExistsError(namespace);
    }

    const defaultACL: NamespaceACL = {
      namespace,
      owner,
      defaultPermissions: { read: false, write: false, delete: false, admin: false },
      grants: [],
      publicReadable: false,
    };

    this.namespaces.set(namespace, {
      ...defaultACL,
      ...acl,
      namespace, // can't override
      owner: acl?.owner ?? owner, // allow override
    });
  }

  async getNamespaceACL(namespace: VarNamespace): Promise<NamespaceACL | undefined> {
    const acl = this.namespaces.get(namespace);
    return acl ? { ...acl, grants: acl.grants.map(g => ({ ...g })) } : undefined;
  }

  async updateNamespaceACL(namespace: VarNamespace, updates: Partial<NamespaceACL>, caller: string): Promise<void> {
    const acl = this.namespaces.get(namespace);
    if (!acl) {
      throw new NamespaceNotFoundError(namespace);
    }

    // Check admin permission
    const hasAdmin = await this.checkPermission(namespace, undefined as any, caller, 'admin');
    if (!hasAdmin) {
      throw new VarPermissionError(namespace, undefined, caller, 'admin');
    }

    this.namespaces.set(namespace, {
      ...acl,
      ...updates,
      namespace, // can't change
    });
  }

  async grantPermission(namespace: VarNamespace, grant: PermissionGrant, caller: string): Promise<void> {
    const acl = this.namespaces.get(namespace);
    if (!acl) {
      throw new NamespaceNotFoundError(namespace);
    }

    const hasAdmin = await this.checkPermission(namespace, undefined as any, caller, 'admin');
    if (!hasAdmin) {
      throw new VarPermissionError(namespace, undefined, caller, 'admin');
    }

    // Remove existing grant for same grantee
    const newGrants = acl.grants.filter(g => g.grantee !== grant.grantee);
    newGrants.push({ ...grant });

    acl.grants = newGrants;
  }

  async revokePermission(namespace: VarNamespace, grantee: string, caller: string): Promise<void> {
    const acl = this.namespaces.get(namespace);
    if (!acl) {
      throw new NamespaceNotFoundError(namespace);
    }

    const hasAdmin = await this.checkPermission(namespace, undefined as any, caller, 'admin');
    if (!hasAdmin) {
      throw new VarPermissionError(namespace, undefined, caller, 'admin');
    }

    acl.grants = acl.grants.filter(g => g.grantee !== grantee);
  }

  // -------------------------------------------------------------------------
  // Permission Checks
  // -------------------------------------------------------------------------

  async checkPermission(
    namespace: VarNamespace,
    _key: VarKey | undefined,
    caller: string,
    permission: keyof VarPermissions
  ): Promise<boolean> {
    // Parse namespace to determine type
    let parsed: ParsedNamespace;
    try {
      parsed = parseNamespace(namespace);
    } catch {
      return false;
    }

    // Account namespace: only the account owner has access
    if (parsed.type === 'account') {
      return parsed.id === caller;
    }

    // Global namespace: check if caller is a system admin (simplified)
    if (parsed.type === 'global') {
      // In production, check against system admin list
      // For now, no one has access to global except through explicit grants
      const acl = this.namespaces.get(namespace);
      if (!acl) return false;
      return acl.owner === caller || this.checkGrant(acl, caller, permission);
    }

    // Check namespace ACL
    const acl = this.namespaces.get(namespace);

    // Namespace doesn't exist - check if org namespace and caller is org owner
    if (!acl) {
      if (parsed.type === 'org' && this.orgStore) {
        // Auto-create namespace for org owner
        const org = await this.orgStore.getOrg(parsed.id as OrgId);
        if (org && org.ownerAddress === caller) {
          return true; // Owner has all permissions
        }
      }
      return false;
    }

    // Owner has all permissions
    if (acl.owner === caller) {
      return true;
    }

    // Check explicit grants
    if (this.checkGrant(acl, caller, permission)) {
      return true;
    }

    // Check public readable for read permission
    if (permission === 'read' && acl.publicReadable) {
      return true;
    }

    // Check default permissions
    if (acl.defaultPermissions[permission]) {
      return true;
    }

    // For org namespaces, check org permissions
    if (parsed.type === 'org' && this.orgStore) {
      return this.checkOrgPermission(parsed.id as OrgId, caller, permission);
    }

    return false;
  }

  private checkGrant(acl: NamespaceACL, caller: string, permission: keyof VarPermissions): boolean {
    const now = BigInt(Date.now());

    for (const grant of acl.grants) {
      // Check expiry
      if (grant.expiresAt && grant.expiresAt <= now) {
        continue;
      }

      // Check grantee match
      if (grant.granteeType === 'address' && grant.grantee === caller) {
        if (grant.permissions[permission]) {
          return true;
        }
      }
      // Role-based grants would need org store lookup
    }

    return false;
  }

  private async checkOrgPermission(orgId: OrgId, caller: string, permission: keyof VarPermissions): Promise<boolean> {
    if (!this.orgStore) {
      return false;
    }

    // Map var permission to org permission
    let orgPerm: string;
    switch (permission) {
      case 'read':
        orgPerm = OrgPermissions.ORG_READ;
        break;
      case 'write':
      case 'delete':
        // Use ORG_MEMBER_ADD as proxy for write permission
        // (or we could add ORG_WRITE to the permissions set)
        orgPerm = OrgPermissions.ORG_MEMBER_ADD;
        break;
      case 'admin':
        orgPerm = OrgPermissions.ORG_ADMIN;
        break;
      default:
        return false;
    }

    const result = await this.orgStore.checkPermission({
      orgId,
      address: caller,
      permission: orgPerm as any,
    });

    return result.granted;
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private cloneRecord(record: VarRecord): VarRecord {
    return {
      ...record,
      value: Buffer.from(record.value),
      metadata: { ...record.metadata, tags: record.metadata.tags ? [...record.metadata.tags] : undefined },
    };
  }

  /** Clear all data (for testing) */
  clear(): void {
    this.variables.clear();
    this.namespaces.clear();
  }

  /** Get stats for debugging */
  stats(): { variables: number; namespaces: number } {
    return {
      variables: this.variables.size,
      namespaces: this.namespaces.size,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new in-memory variable store
 */
export function createVarStore(orgStore?: OrgStore): VarStore {
  return new InMemoryVarStore(orgStore);
}
