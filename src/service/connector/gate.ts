/**
 * Auth Gate - HTTP Handler Wrapper with Authentication & RBAC
 *
 * Wraps any HTTP handler to:
 * 1. Extract and validate WSTFAuth tokens
 * 2. Resolve caller org memberships and roles
 * 3. Check permissions via orgStore
 * 4. Check approvals if needed via approvalsStore
 * 5. Produce a strict CallerContext for the handler
 */

import crypto from 'crypto';
import {
  AuthorizationResult,
  ConnectorOptions,
  RequestContext,
  extractRequestContext,
  authorizeRequest,
} from './connector';
import { OrgStore } from '../../accounts/orgStore';
import { ApprovalsStore } from '../../accounts/approvalsStore';
import { OrgId, PermissionStr, RoleId } from '../../accounts/orgTypes';
import { ApprovalId, ApprovalStatus } from '../../accounts/approvalsTypes';

// ============================================================================
// Types
// ============================================================================

/**
 * Caller's organization membership info
 */
export interface OrgMembership {
  orgId: string;
  roles: string[];
  permissions: string[];
}

/**
 * Strict caller context produced after authentication
 */
export interface CallerContext {
  /** Caller's gc1... address */
  addr: string;
  /** Trust tier (0=anon, 1=authenticated, 2=verified, 3=trusted) */
  trustTier: number;
  /** Organization memberships with roles */
  orgs: OrgMembership[];
  /** Scopes from token (if any) */
  scopes: string[];
  /** Raw WSTFAuth payload (for custom claims) */
  rawPayload?: Record<string, unknown>;
}

/**
 * Gate policy configuration
 */
export interface GatePolicy {
  /** Minimum trust tier required (default 1 = authenticated) */
  minTrustTier?: number;
  /** Required scopes in token */
  requiredScopes?: string[];
  /** Required org permission (any org) */
  requiredPermission?: PermissionStr;
  /** Required org-specific permission */
  requiredOrgPermission?: {
    orgId: OrgId;
    permission: PermissionStr;
  };
  /** Required approval (for sensitive operations) */
  requireApproval?: {
    policyId: string;
    /** Extract approval ID from request (header or body) */
    getApprovalId: (headers: Record<string, string | undefined>, body?: unknown) => string | undefined;
  };
  /** Custom authorization check */
  customCheck?: (ctx: CallerContext, headers: Record<string, string | undefined>, body?: unknown) => Promise<AuthCheckResult>;
}

/**
 * Auth check result
 */
export interface AuthCheckResult {
  authorized: boolean;
  error?: string;
  code?: string;
}

/**
 * Generic HTTP request shape
 */
export interface HttpRequest {
  headers: Record<string, string | undefined>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * Generic HTTP response shape
 */
export interface HttpResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * Gated handler function signature
 */
export type GatedHandler<TReq extends HttpRequest = HttpRequest, TResp = unknown> = (
  ctx: CallerContext,
  req: TReq
) => Promise<TResp>;

/**
 * Gate result - either success with context or error
 */
export type GateResult =
  | { success: true; context: CallerContext }
  | { success: false; error: string; code: string; status: number };

// ============================================================================
// Trust Tiers
// ============================================================================

export const TrustTier = {
  /** Anonymous / unauthenticated */
  ANONYMOUS: 0,
  /** Authenticated via WSTFAuth */
  AUTHENTICATED: 1,
  /** Verified identity (KYC/KYB) */
  VERIFIED: 2,
  /** Trusted / privileged account */
  TRUSTED: 3,
} as const;

export type TrustTierLevel = typeof TrustTier[keyof typeof TrustTier];

// ============================================================================
// Gate Configuration
// ============================================================================

/**
 * Auth gate configuration
 */
export interface AuthGateConfig {
  /** Connector options for token validation */
  connectorOptions: ConnectorOptions;
  /** Org store for membership/permission lookups */
  orgStore: OrgStore;
  /** Approvals store for approval verification */
  approvalsStore?: ApprovalsStore;
  /** Trust tier resolver (default: address-based) */
  resolveTrustTier?: (address: string) => Promise<TrustTierLevel>;
  /** Scope extractor from token payload */
  extractScopes?: (payload: Record<string, unknown>) => string[];
}

// ============================================================================
// Auth Gate Implementation
// ============================================================================

/**
 * Create an auth gate with the given configuration
 */
export function createAuthGate(config: AuthGateConfig) {
  const {
    connectorOptions,
    orgStore,
    approvalsStore,
    resolveTrustTier = defaultTrustTierResolver,
    extractScopes = defaultScopeExtractor,
  } = config;

  /**
   * Authenticate and authorize a request
   */
  async function gate(
    headers: Record<string, string | undefined>,
    policy: GatePolicy = {},
    body?: unknown
  ): Promise<GateResult> {
    // Extract request context from headers
    const requestContext = extractRequestContext(headers);

    // Authorize the request (validate token)
    const authResult = await authorizeRequest(requestContext, connectorOptions);

    if (!authResult.authorized || !authResult.caller) {
      return {
        success: false,
        error: authResult.error ?? 'Unauthorized',
        code: authResult.code ?? 'UNAUTHORIZED',
        status: 401,
      };
    }

    // Build caller context
    const callerContext = await buildCallerContext(
      authResult,
      resolveTrustTier,
      extractScopes,
      orgStore
    );

    // Check minimum trust tier
    const minTier = policy.minTrustTier ?? TrustTier.AUTHENTICATED;
    if (callerContext.trustTier < minTier) {
      return {
        success: false,
        error: `Insufficient trust tier: required ${minTier}, got ${callerContext.trustTier}`,
        code: 'INSUFFICIENT_TRUST_TIER',
        status: 403,
      };
    }

    // Check required scopes
    if (policy.requiredScopes && policy.requiredScopes.length > 0) {
      const missingScopes = policy.requiredScopes.filter(
        (scope) => !callerContext.scopes.includes(scope)
      );
      if (missingScopes.length > 0) {
        return {
          success: false,
          error: `Missing required scopes: ${missingScopes.join(', ')}`,
          code: 'MISSING_SCOPES',
          status: 403,
        };
      }
    }

    // Check required permission (any org)
    if (policy.requiredPermission) {
      const hasPermission = callerContext.orgs.some(
        (org) => org.permissions.includes(policy.requiredPermission!)
      );
      if (!hasPermission) {
        return {
          success: false,
          error: `Missing required permission: ${policy.requiredPermission}`,
          code: 'MISSING_PERMISSION',
          status: 403,
        };
      }
    }

    // Check org-specific permission
    if (policy.requiredOrgPermission) {
      const { orgId, permission } = policy.requiredOrgPermission;
      const permResult = await orgStore.checkPermission({
        orgId,
        address: callerContext.addr,
        permission,
      });
      if (!permResult.granted) {
        return {
          success: false,
          error: `Missing permission ${permission} in org ${orgId}: ${permResult.deniedReason}`,
          code: 'ORG_PERMISSION_DENIED',
          status: 403,
        };
      }
    }

    // Check approval requirement
    if (policy.requireApproval && approvalsStore) {
      const approvalId = policy.requireApproval.getApprovalId(headers, body);
      if (!approvalId) {
        return {
          success: false,
          error: 'Approval required but not provided',
          code: 'APPROVAL_REQUIRED',
          status: 403,
        };
      }

      const approval = await approvalsStore.getApproval(approvalId as ApprovalId);
      if (!approval) {
        return {
          success: false,
          error: `Approval not found: ${approvalId}`,
          code: 'APPROVAL_NOT_FOUND',
          status: 404,
        };
      }

      if (approval.status !== 'approved') {
        return {
          success: false,
          error: `Approval not approved: status is ${approval.status}`,
          code: 'APPROVAL_NOT_APPROVED',
          status: 403,
        };
      }

      // Verify approval hasn't expired
      const now = BigInt(Date.now());
      if (approval.expiresAt <= now) {
        return {
          success: false,
          error: 'Approval has expired',
          code: 'APPROVAL_EXPIRED',
          status: 403,
        };
      }
    }

    // Run custom check if provided
    if (policy.customCheck) {
      const customResult = await policy.customCheck(callerContext, headers, body);
      if (!customResult.authorized) {
        return {
          success: false,
          error: customResult.error ?? 'Custom authorization check failed',
          code: customResult.code ?? 'CUSTOM_CHECK_FAILED',
          status: 403,
        };
      }
    }

    return { success: true, context: callerContext };
  }

  /**
   * Wrap a handler with auth gate
   */
  function authGate<TReq extends HttpRequest = HttpRequest, TResp = unknown>(
    handler: GatedHandler<TReq, TResp>,
    policy: GatePolicy = {}
  ): (req: TReq) => Promise<HttpResponse> {
    return async (req: TReq): Promise<HttpResponse> => {
      const result = await gate(req.headers, policy, req.body);

      if (!result.success) {
        return {
          status: result.status,
          body: {
            success: false,
            error: result.error,
            code: result.code,
          },
        };
      }

      try {
        const response = await handler(result.context, req);
        return {
          status: 200,
          body: { success: true, data: response },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        const code = (error as { code?: string }).code ?? 'INTERNAL_ERROR';
        return {
          status: 500,
          body: { success: false, error: message, code },
        };
      }
    };
  }

  return {
    gate,
    authGate,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build caller context from authorization result
 */
async function buildCallerContext(
  authResult: AuthorizationResult,
  resolveTrustTier: (address: string) => Promise<TrustTierLevel>,
  extractScopes: (payload: Record<string, unknown>) => string[],
  orgStore: OrgStore
): Promise<CallerContext> {
  const addr = authResult.caller!;
  const payload = authResult.payload as Record<string, unknown> | undefined;

  // Resolve trust tier
  const trustTier = await resolveTrustTier(addr);

  // Extract scopes from token
  const scopes = payload ? extractScopes(payload) : [];

  // Get org memberships
  const orgs = await getOrgMemberships(addr, orgStore);

  return {
    addr,
    trustTier,
    orgs,
    scopes,
    rawPayload: payload,
  };
}

/**
 * Get all org memberships for an address
 */
async function getOrgMemberships(address: string, orgStore: OrgStore): Promise<OrgMembership[]> {
  const memberships: OrgMembership[] = [];

  // List all orgs (in production, you'd have an index by member)
  const allOrgs = await orgStore.listOrgs();

  for (const org of allOrgs) {
    // Check if owner
    if (org.ownerAddress === address) {
      // Owner has all permissions
      const roles = await orgStore.listRoles(org.orgId);
      const allPermissions = new Set<string>();
      for (const role of roles) {
        for (const perm of role.permissions) {
          allPermissions.add(perm);
        }
      }
      memberships.push({
        orgId: org.orgId,
        roles: ['owner'],
        permissions: Array.from(allPermissions),
      });
      continue;
    }

    // Check membership
    const member = await orgStore.getMember(org.orgId, address);
    if (member && member.isActive) {
      const permissions = await orgStore.getMemberPermissions(org.orgId, address);
      memberships.push({
        orgId: org.orgId,
        roles: member.roleAssignments.map((a) => a.roleId),
        permissions: Array.from(permissions),
      });
    }
  }

  return memberships;
}

/**
 * Default trust tier resolver (everyone starts at AUTHENTICATED)
 */
async function defaultTrustTierResolver(_address: string): Promise<TrustTierLevel> {
  // In production, check against a registry of verified/trusted accounts
  return TrustTier.AUTHENTICATED;
}

/**
 * Default scope extractor from token payload
 */
function defaultScopeExtractor(payload: Record<string, unknown>): string[] {
  const scope = payload['scope'];
  if (typeof scope === 'string') {
    return scope.split(' ').filter(Boolean);
  }
  if (Array.isArray(scope)) {
    return scope.filter((s) => typeof s === 'string');
  }
  return [];
}

// ============================================================================
// Convenience Policy Builders
// ============================================================================

/**
 * Create a policy requiring a specific permission
 */
export function requirePermission(permission: PermissionStr): GatePolicy {
  return { requiredPermission: permission };
}

/**
 * Create a policy requiring org-specific permission
 */
export function requireOrgPermission(orgId: OrgId, permission: PermissionStr): GatePolicy {
  return { requiredOrgPermission: { orgId, permission } };
}

/**
 * Create a policy requiring specific scopes
 */
export function requireScopes(...scopes: string[]): GatePolicy {
  return { requiredScopes: scopes };
}

/**
 * Create a policy requiring minimum trust tier
 */
export function requireTrustTier(tier: TrustTierLevel): GatePolicy {
  return { minTrustTier: tier };
}

/**
 * Create a policy requiring approval
 */
export function requireApproval(
  policyId: string,
  headerName: string = 'x-wstf-approval-id'
): GatePolicy {
  return {
    requireApproval: {
      policyId,
      getApprovalId: (headers) => headers[headerName.toLowerCase()] || headers[headerName],
    },
  };
}

/**
 * Combine multiple policies (all must pass)
 */
export function combinePolicies(...policies: GatePolicy[]): GatePolicy {
  const combined: GatePolicy = {};

  for (const policy of policies) {
    if (policy.minTrustTier !== undefined) {
      combined.minTrustTier = Math.max(combined.minTrustTier ?? 0, policy.minTrustTier);
    }
    if (policy.requiredScopes) {
      combined.requiredScopes = [
        ...(combined.requiredScopes ?? []),
        ...policy.requiredScopes,
      ];
    }
    if (policy.requiredPermission) {
      // Last one wins (for simplicity)
      combined.requiredPermission = policy.requiredPermission;
    }
    if (policy.requiredOrgPermission) {
      combined.requiredOrgPermission = policy.requiredOrgPermission;
    }
    if (policy.requireApproval) {
      combined.requireApproval = policy.requireApproval;
    }
    if (policy.customCheck) {
      const existingCheck = combined.customCheck;
      if (existingCheck) {
        // Chain custom checks
        combined.customCheck = async (ctx, headers, body) => {
          const result1 = await existingCheck(ctx, headers, body);
          if (!result1.authorized) return result1;
          return policy.customCheck!(ctx, headers, body);
        };
      } else {
        combined.customCheck = policy.customCheck;
      }
    }
  }

  return combined;
}

// ============================================================================
// Route Protection Utilities
// ============================================================================

/**
 * Method-path binding for route protection
 */
export interface RouteBinding {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  policy: GatePolicy;
}

/**
 * Create a route map for protected endpoints
 */
export function createRouteMap(bindings: RouteBinding[]): Map<string, GatePolicy> {
  const map = new Map<string, GatePolicy>();
  for (const binding of bindings) {
    const key = `${binding.method}:${binding.path}`;
    map.set(key, binding.policy);
  }
  return map;
}

/**
 * Get policy for a route
 */
export function getRoutePolicy(
  routeMap: Map<string, GatePolicy>,
  method: string,
  path: string
): GatePolicy | undefined {
  return routeMap.get(`${method}:${path}`);
}

// ============================================================================
// Middleware-style helpers
// ============================================================================

/**
 * Create a Fastify-style preHandler
 */
export function createFastifyPreHandler(
  gate: ReturnType<typeof createAuthGate>,
  getPolicy: (req: { method: string; url: string }) => GatePolicy
) {
  return async (request: {
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    body?: unknown;
  }): Promise<{ context?: CallerContext; error?: { status: number; body: unknown } }> => {
    const policy = getPolicy({ method: request.method, url: request.url });
    const result = await gate.gate(request.headers, policy, request.body);

    if (!result.success) {
      return {
        error: {
          status: result.status,
          body: {
            success: false,
            error: result.error,
            code: result.code,
          },
        },
      };
    }

    return { context: result.context };
  };
}
