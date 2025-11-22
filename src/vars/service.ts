/**
 * Variable Service - HTTP service integration for authenticated variable store
 *
 * Provides service handlers for the variable store with auth gate integration.
 */

import {
  VarNamespace,
  VarKey,
  VarValueType,
  VarRecord,
  VarWriteOp,
  VarListFilters,
  VarPermissions,
  PermissionGrant,
  NamespaceACL,
  makeKey,
  encodeValue,
  decodeValue,
  DecodedVar,
} from './types';
import { VarStore, VarPermissionError, VarNotFoundError } from './store';
import { CallerContext, GatePolicy, TrustTier } from '../service/connector/gate';

// ============================================================================
// Service Types
// ============================================================================

/**
 * Variable service request context
 */
export interface VarServiceContext {
  /** Caller context from auth gate */
  caller: CallerContext;
  /** Resolved namespace (from request or caller context) */
  namespace: VarNamespace;
}

/**
 * Get variable request
 */
export interface GetVarRequest {
  namespace: VarNamespace;
  key: string;
}

/**
 * Get variable response
 */
export interface GetVarResponse<T = unknown> {
  found: boolean;
  variable?: DecodedVar<T>;
}

/**
 * Set variable request
 */
export interface SetVarRequest<T = unknown> {
  namespace: VarNamespace;
  key: string;
  value: T;
  type: VarValueType;
  expectedVersion?: bigint;
  description?: string;
  tags?: string[];
  expiresAt?: bigint;
}

/**
 * Set variable response
 */
export interface SetVarResponse {
  success: boolean;
  newVersion?: bigint;
  error?: string;
}

/**
 * List variables request
 */
export interface ListVarsRequest {
  namespace: VarNamespace;
  keyPrefix?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * List variables response
 */
export interface ListVarsResponse {
  variables: DecodedVar[];
  total: number;
  hasMore: boolean;
}

/**
 * Delete variable request
 */
export interface DeleteVarRequest {
  namespace: VarNamespace;
  key: string;
  expectedVersion?: bigint;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Variable service for HTTP integration
 */
export class VarService {
  constructor(private store: VarStore) {}

  /**
   * Get a variable
   */
  async get<T = unknown>(ctx: CallerContext, req: GetVarRequest): Promise<GetVarResponse<T>> {
    const key = makeKey(req.key);
    const record = await this.store.get(req.namespace, key, ctx.addr);

    if (!record) {
      return { found: false };
    }

    const value = decodeValue<T>(record.value, record.metadata.type);
    return {
      found: true,
      variable: {
        namespace: record.namespace,
        key: record.key,
        value,
        metadata: record.metadata,
        version: record.version,
      },
    };
  }

  /**
   * Set a variable
   */
  async set<T = unknown>(ctx: CallerContext, req: SetVarRequest<T>): Promise<SetVarResponse> {
    const key = makeKey(req.key);
    const value = encodeValue(req.value, req.type);

    const op: VarWriteOp = {
      namespace: req.namespace,
      key,
      value,
      type: req.type,
      expectedVersion: req.expectedVersion,
      metadata: {
        description: req.description,
        tags: req.tags,
        expiresAt: req.expiresAt,
      },
    };

    const result = await this.store.set(op, ctx.addr);
    return result;
  }

  /**
   * List variables
   */
  async list(ctx: CallerContext, req: ListVarsRequest): Promise<ListVarsResponse> {
    const filters: VarListFilters = {
      keyPrefix: req.keyPrefix,
      tags: req.tags,
      limit: req.limit,
      offset: req.offset,
    };

    const result = await this.store.list(req.namespace, ctx.addr, filters);

    const variables: DecodedVar[] = result.records.map(record => ({
      namespace: record.namespace,
      key: record.key,
      value: decodeValue(record.value, record.metadata.type),
      metadata: record.metadata,
      version: record.version,
    }));

    return {
      variables,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  /**
   * Delete a variable
   */
  async delete(ctx: CallerContext, req: DeleteVarRequest): Promise<SetVarResponse> {
    const key = makeKey(req.key);
    const result = await this.store.delete(req.namespace, key, ctx.addr, req.expectedVersion);
    return result;
  }

  /**
   * Check if variable exists
   */
  async exists(req: { namespace: VarNamespace; key: string }): Promise<boolean> {
    const key = makeKey(req.key);
    return this.store.exists(req.namespace, key);
  }

  /**
   * Create namespace
   */
  async createNamespace(
    ctx: CallerContext,
    namespace: VarNamespace,
    options?: { defaultPermissions?: VarPermissions; publicReadable?: boolean }
  ): Promise<void> {
    const acl: Partial<NamespaceACL> = {
      owner: ctx.addr,
      defaultPermissions: options?.defaultPermissions,
      publicReadable: options?.publicReadable,
    };

    await this.store.createNamespace(namespace, ctx.addr, acl);
  }

  /**
   * Grant permission on namespace
   */
  async grantPermission(
    ctx: CallerContext,
    namespace: VarNamespace,
    grantee: string,
    permissions: VarPermissions
  ): Promise<void> {
    const grant: PermissionGrant = {
      grantee,
      granteeType: 'address',
      permissions,
    };

    await this.store.grantPermission(namespace, grant, ctx.addr);
  }

  /**
   * Revoke permission on namespace
   */
  async revokePermission(ctx: CallerContext, namespace: VarNamespace, grantee: string): Promise<void> {
    await this.store.revokePermission(namespace, grantee, ctx.addr);
  }
}

// ============================================================================
// Gate Policy Helpers
// ============================================================================

/**
 * Default gate policy for read operations
 */
export const VAR_READ_POLICY: GatePolicy = {
  minTrustTier: TrustTier.AUTHENTICATED,
  requiredScopes: ['vars:read'],
};

/**
 * Default gate policy for write operations
 */
export const VAR_WRITE_POLICY: GatePolicy = {
  minTrustTier: TrustTier.AUTHENTICATED,
  requiredScopes: ['vars:write'],
};

/**
 * Default gate policy for admin operations
 */
export const VAR_ADMIN_POLICY: GatePolicy = {
  minTrustTier: TrustTier.VERIFIED,
  requiredScopes: ['vars:admin'],
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a variable service
 */
export function createVarService(store: VarStore): VarService {
  return new VarService(store);
}
