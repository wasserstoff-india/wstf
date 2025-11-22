/**
 * Approvals Store - State management for approval policies and requests
 *
 * Provides CRUD operations with optimistic concurrency control.
 * All operations are deterministic and suitable for consensus.
 */

import { OrgId, RoleId } from './orgTypes';
import {
  ApprovalId,
  PolicyId,
  ApprovalStatus,
  ApprovalRequest,
  ApprovalSignature,
  ApprovalRejection,
  ApprovalAction,
  AnyApprovalPolicy,
  ExecutionResult,
  makeApprovalId,
  makePolicyId,
  isPolicySatisfied,
} from './approvalsTypes';

// ============================================================================
// Store Interface
// ============================================================================

/** Interface for approval store implementations */
export interface ApprovalsStore {
  // Policy operations
  createPolicy(policy: AnyApprovalPolicy): Promise<void>;
  getPolicy(policyId: PolicyId): Promise<AnyApprovalPolicy | undefined>;
  updatePolicy(policyId: PolicyId, updates: Partial<AnyApprovalPolicy>, expectedVersion: bigint): Promise<void>;
  listPolicies(orgId: OrgId): Promise<AnyApprovalPolicy[]>;
  deletePolicy(policyId: PolicyId): Promise<void>;

  // Approval request operations
  createApproval(request: ApprovalRequest): Promise<void>;
  getApproval(approvalId: ApprovalId): Promise<ApprovalRequest | undefined>;
  updateApproval(approvalId: ApprovalId, updates: Partial<ApprovalRequest>, expectedVersion: bigint): Promise<void>;
  listApprovals(orgId: OrgId, filters?: ApprovalFilters): Promise<ApprovalRequest[]>;

  // Signature operations
  addSignature(approvalId: ApprovalId, signature: ApprovalSignature): Promise<ApprovalRequest>;
  addRejection(approvalId: ApprovalId, rejection: ApprovalRejection): Promise<ApprovalRequest>;

  // Status operations
  updateStatus(approvalId: ApprovalId, status: ApprovalStatus, executionResult?: ExecutionResult): Promise<void>;
  expirePending(cutoffTime: bigint): Promise<ApprovalId[]>;
}

/** Filters for listing approvals */
export interface ApprovalFilters {
  status?: ApprovalStatus | ApprovalStatus[];
  policyId?: PolicyId;
  requestor?: string;
  signer?: string;
  actionType?: string;
  createdAfter?: bigint;
  createdBefore?: bigint;
  expiresAfter?: bigint;
  expiresBefore?: bigint;
}

// ============================================================================
// Errors
// ============================================================================

/** Concurrency error */
export class ApprovalConcurrencyError extends Error {
  constructor(
    public entityType: string,
    public entityId: string,
    public expectedVersion: bigint,
    public actualVersion: bigint
  ) {
    super(`Concurrency conflict on ${entityType} ${entityId}: expected v${expectedVersion}, got v${actualVersion}`);
    this.name = 'ApprovalConcurrencyError';
  }
}

/** Not found error */
export class ApprovalNotFoundError extends Error {
  constructor(
    public entityType: string,
    public entityId: string
  ) {
    super(`${entityType} not found: ${entityId}`);
    this.name = 'ApprovalNotFoundError';
  }
}

/** Invalid state error */
export class InvalidApprovalStateError extends Error {
  constructor(
    public approvalId: ApprovalId,
    public currentStatus: ApprovalStatus,
    public attemptedAction: string
  ) {
    super(`Cannot ${attemptedAction} on approval ${approvalId} with status ${currentStatus}`);
    this.name = 'InvalidApprovalStateError';
  }
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

/** In-memory approvals store for testing and single-node usage */
export class InMemoryApprovalsStore implements ApprovalsStore {
  private policies = new Map<PolicyId, AnyApprovalPolicy>();
  private approvals = new Map<ApprovalId, ApprovalRequest>();

  // -------------------------------------------------------------------------
  // Policy Operations
  // -------------------------------------------------------------------------

  async createPolicy(policy: AnyApprovalPolicy): Promise<void> {
    if (this.policies.has(policy.policyId)) {
      throw new Error(`Policy already exists: ${policy.policyId}`);
    }
    this.policies.set(policy.policyId, this.clonePolicy(policy));
  }

  async getPolicy(policyId: PolicyId): Promise<AnyApprovalPolicy | undefined> {
    const policy = this.policies.get(policyId);
    return policy ? this.clonePolicy(policy) : undefined;
  }

  async updatePolicy(
    policyId: PolicyId,
    updates: Partial<AnyApprovalPolicy>,
    expectedVersion: bigint
  ): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new ApprovalNotFoundError('Policy', policyId);
    }
    if (policy.version !== expectedVersion) {
      throw new ApprovalConcurrencyError('Policy', policyId, expectedVersion, policy.version);
    }

    const updated = {
      ...policy,
      ...updates,
      policyId, // prevent overwrite
      orgId: policy.orgId, // prevent overwrite
      type: policy.type, // prevent type change
      version: policy.version + 1n,
      updatedAt: BigInt(Date.now()),
    } as AnyApprovalPolicy;

    this.policies.set(policyId, updated);
  }

  async listPolicies(orgId: OrgId): Promise<AnyApprovalPolicy[]> {
    return Array.from(this.policies.values())
      .filter((p) => p.orgId === orgId)
      .map((p) => this.clonePolicy(p));
  }

  async deletePolicy(policyId: PolicyId): Promise<void> {
    if (!this.policies.has(policyId)) {
      throw new ApprovalNotFoundError('Policy', policyId);
    }
    // Check if any pending approvals use this policy
    for (const approval of this.approvals.values()) {
      if (approval.policyId === policyId && approval.status === 'pending') {
        throw new Error(`Cannot delete policy ${policyId}: has pending approvals`);
      }
    }
    this.policies.delete(policyId);
  }

  // -------------------------------------------------------------------------
  // Approval Request Operations
  // -------------------------------------------------------------------------

  async createApproval(request: ApprovalRequest): Promise<void> {
    if (this.approvals.has(request.approvalId)) {
      throw new Error(`Approval already exists: ${request.approvalId}`);
    }
    // Verify policy exists
    if (!this.policies.has(request.policyId)) {
      throw new ApprovalNotFoundError('Policy', request.policyId);
    }
    this.approvals.set(request.approvalId, this.cloneApproval(request));
  }

  async getApproval(approvalId: ApprovalId): Promise<ApprovalRequest | undefined> {
    const approval = this.approvals.get(approvalId);
    return approval ? this.cloneApproval(approval) : undefined;
  }

  async updateApproval(
    approvalId: ApprovalId,
    updates: Partial<ApprovalRequest>,
    expectedVersion: bigint
  ): Promise<void> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new ApprovalNotFoundError('Approval', approvalId);
    }
    if (approval.version !== expectedVersion) {
      throw new ApprovalConcurrencyError('Approval', approvalId, expectedVersion, approval.version);
    }

    this.approvals.set(approvalId, {
      ...approval,
      ...updates,
      approvalId, // prevent overwrite
      orgId: approval.orgId, // prevent overwrite
      policyId: approval.policyId, // prevent overwrite
      requestor: approval.requestor, // prevent overwrite
      createdAt: approval.createdAt, // prevent overwrite
      version: approval.version + 1n,
      updatedAt: BigInt(Date.now()),
      signatures: updates.signatures
        ? updates.signatures.map((s) => ({ ...s }))
        : approval.signatures.map((s) => ({ ...s })),
      rejections: updates.rejections
        ? updates.rejections.map((r) => ({ ...r }))
        : approval.rejections.map((r) => ({ ...r })),
    });
  }

  async listApprovals(orgId: OrgId, filters?: ApprovalFilters): Promise<ApprovalRequest[]> {
    let results = Array.from(this.approvals.values()).filter((a) => a.orgId === orgId);

    if (filters) {
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        results = results.filter((a) => statuses.includes(a.status));
      }
      if (filters.policyId) {
        results = results.filter((a) => a.policyId === filters.policyId);
      }
      if (filters.requestor) {
        results = results.filter((a) => a.requestor === filters.requestor);
      }
      if (filters.signer) {
        results = results.filter((a) => a.signatures.some((s) => s.address === filters.signer));
      }
      if (filters.actionType) {
        results = results.filter((a) => a.action.type === filters.actionType);
      }
      if (filters.createdAfter !== undefined) {
        results = results.filter((a) => a.createdAt >= filters.createdAfter!);
      }
      if (filters.createdBefore !== undefined) {
        results = results.filter((a) => a.createdAt <= filters.createdBefore!);
      }
      if (filters.expiresAfter !== undefined) {
        results = results.filter((a) => a.expiresAt >= filters.expiresAfter!);
      }
      if (filters.expiresBefore !== undefined) {
        results = results.filter((a) => a.expiresAt <= filters.expiresBefore!);
      }
    }

    return results.map((a) => this.cloneApproval(a));
  }

  // -------------------------------------------------------------------------
  // Signature Operations
  // -------------------------------------------------------------------------

  async addSignature(approvalId: ApprovalId, signature: ApprovalSignature): Promise<ApprovalRequest> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new ApprovalNotFoundError('Approval', approvalId);
    }
    if (approval.status !== 'pending') {
      throw new InvalidApprovalStateError(approvalId, approval.status, 'add signature');
    }

    // Check for duplicate signature
    if (approval.signatures.some((s) => s.address === signature.address)) {
      throw new Error(`Address ${signature.address} has already signed approval ${approvalId}`);
    }

    // Add signature
    const newSignatures = [...approval.signatures, { ...signature }];

    // Check if policy is now satisfied
    const policy = this.policies.get(approval.policyId);
    let newStatus: ApprovalStatus = 'pending';
    if (policy) {
      // Get all signer addresses from policy
      const signerAddresses = this.getPolicySignerAddresses(policy);
      if (isPolicySatisfied(policy, newSignatures, signerAddresses)) {
        newStatus = 'approved';
      }
    }

    const updated: ApprovalRequest = {
      ...approval,
      signatures: newSignatures,
      status: newStatus,
      version: approval.version + 1n,
      updatedAt: BigInt(Date.now()),
    };

    this.approvals.set(approvalId, updated);
    return this.cloneApproval(updated);
  }

  async addRejection(approvalId: ApprovalId, rejection: ApprovalRejection): Promise<ApprovalRequest> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new ApprovalNotFoundError('Approval', approvalId);
    }
    if (approval.status !== 'pending') {
      throw new InvalidApprovalStateError(approvalId, approval.status, 'add rejection');
    }

    const updated: ApprovalRequest = {
      ...approval,
      rejections: [...approval.rejections, { ...rejection }],
      status: 'rejected',
      version: approval.version + 1n,
      updatedAt: BigInt(Date.now()),
    };

    this.approvals.set(approvalId, updated);
    return this.cloneApproval(updated);
  }

  // -------------------------------------------------------------------------
  // Status Operations
  // -------------------------------------------------------------------------

  async updateStatus(
    approvalId: ApprovalId,
    status: ApprovalStatus,
    executionResult?: ExecutionResult
  ): Promise<void> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new ApprovalNotFoundError('Approval', approvalId);
    }

    // Validate status transitions
    const validTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
      pending: ['approved', 'rejected', 'expired', 'cancelled'],
      approved: ['executed'],
      rejected: [],
      expired: [],
      cancelled: [],
      executed: [],
    };

    if (!validTransitions[approval.status].includes(status)) {
      throw new InvalidApprovalStateError(approvalId, approval.status, `transition to ${status}`);
    }

    this.approvals.set(approvalId, {
      ...approval,
      status,
      executionResult: executionResult ? { ...executionResult } : approval.executionResult,
      version: approval.version + 1n,
      updatedAt: BigInt(Date.now()),
    });
  }

  async expirePending(cutoffTime: bigint): Promise<ApprovalId[]> {
    const expired: ApprovalId[] = [];

    for (const [id, approval] of this.approvals) {
      if (approval.status === 'pending' && approval.expiresAt <= cutoffTime) {
        this.approvals.set(id, {
          ...approval,
          status: 'expired',
          version: approval.version + 1n,
          updatedAt: cutoffTime,
        });
        expired.push(id);
      }
    }

    return expired;
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  private clonePolicy(policy: AnyApprovalPolicy): AnyApprovalPolicy {
    return JSON.parse(JSON.stringify(policy, (_key, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    ), (_key, value) => {
      if (typeof value === 'string' && value.endsWith('n')) {
        const num = value.slice(0, -1);
        if (/^\d+$/.test(num)) {
          return BigInt(num);
        }
      }
      return value;
    });
  }

  private cloneApproval(approval: ApprovalRequest): ApprovalRequest {
    return JSON.parse(JSON.stringify(approval, (_key, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    ), (_key, value) => {
      if (typeof value === 'string' && value.endsWith('n')) {
        const num = value.slice(0, -1);
        if (/^\d+$/.test(num)) {
          return BigInt(num);
        }
      }
      return value;
    });
  }

  private getPolicySignerAddresses(policy: AnyApprovalPolicy): Set<string> {
    const addresses = new Set<string>();

    const extractAddresses = (signers: { type: string; address?: string }[]) => {
      for (const signer of signers) {
        if (signer.type === 'address' && signer.address) {
          addresses.add(signer.address);
        }
        // Role-based signers need external resolution
      }
    };

    if (policy.type === 'tiered') {
      for (const tier of policy.tiers) {
        extractAddresses(tier.signers);
      }
    } else {
      extractAddresses(policy.signers);
    }

    return addresses;
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /** Clear all data (for testing) */
  clear(): void {
    this.policies.clear();
    this.approvals.clear();
  }

  /** Get stats for debugging */
  stats(): { policies: number; approvals: number; pendingApprovals: number } {
    let pending = 0;
    for (const a of this.approvals.values()) {
      if (a.status === 'pending') pending++;
    }
    return {
      policies: this.policies.size,
      approvals: this.approvals.size,
      pendingApprovals: pending,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/** Create a new in-memory approvals store */
export function createApprovalsStore(): ApprovalsStore {
  return new InMemoryApprovalsStore();
}

/** Generate a deterministic approval ID */
export function generateApprovalId(
  orgId: OrgId,
  requestor: string,
  actionHash: string,
  nonce: bigint
): ApprovalId {
  const input = `approval:${orgId}:${requestor}:${actionHash}:${nonce}`;
  const hash = simpleHash(input);
  return makeApprovalId(`appr_${hash}`);
}

/** Generate a deterministic policy ID */
export function generatePolicyId(orgId: OrgId, name: string, nonce: bigint): PolicyId {
  const input = `policy:${orgId}:${name}:${nonce}`;
  const hash = simpleHash(input);
  return makePolicyId(`pol_${hash}`);
}

/** Simple deterministic hash */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// Approval Request Builder
// ============================================================================

/** Builder for creating approval requests */
export class ApprovalRequestBuilder {
  private request: Partial<ApprovalRequest> = {};

  constructor(orgId: OrgId, policyId: PolicyId, requestor: string) {
    this.request.orgId = orgId;
    this.request.policyId = policyId;
    this.request.requestor = requestor;
    this.request.status = 'pending';
    this.request.signatures = [];
    this.request.rejections = [];
    this.request.createdAt = BigInt(Date.now());
    this.request.updatedAt = this.request.createdAt;
    this.request.version = 0n;
  }

  action(action: ApprovalAction): this {
    this.request.action = action;
    return this;
  }

  expiresAt(time: bigint): this {
    this.request.expiresAt = time;
    return this;
  }

  expiresIn(durationMs: bigint): this {
    this.request.expiresAt = BigInt(Date.now()) + durationMs;
    return this;
  }

  memo(memo: string): this {
    this.request.memo = memo;
    return this;
  }

  build(nonce: bigint): ApprovalRequest {
    if (!this.request.action) {
      throw new Error('Action is required');
    }
    if (!this.request.expiresAt) {
      // Default: 7 days
      this.request.expiresAt = BigInt(Date.now()) + BigInt(7 * 24 * 60 * 60 * 1000);
    }

    const approvalId = generateApprovalId(
      this.request.orgId!,
      this.request.requestor!,
      this.request.action.actionHash,
      nonce
    );

    return {
      ...this.request,
      approvalId,
    } as ApprovalRequest;
  }
}
