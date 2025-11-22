/**
 * Approvals Types - Multi-signature and approval flow types
 *
 * Supports:
 * - Multi-level signoff flows (e.g., 2-of-3, sequential approvals)
 * - Time-bound approvals with expiry
 * - Rejection and cancellation
 * - Audit trail with signatures
 */

import { OrgId, RoleId, UnitId, PermissionStr } from './orgTypes';

// ============================================================================
// Branded Types
// ============================================================================

/** Approval request identifier */
export type ApprovalId = string & { readonly __brand: 'ApprovalId' };

/** Approval policy identifier */
export type PolicyId = string & { readonly __brand: 'PolicyId' };

// ============================================================================
// Approval Policy Types
// ============================================================================

/** Types of approval policies */
export type PolicyType =
  | 'threshold' // M-of-N signatures required
  | 'sequential' // Signatures required in order
  | 'any' // Any single authorized signer
  | 'all' // All signers must approve
  | 'tiered'; // Multiple levels with different thresholds

/** Base approval policy */
export interface ApprovalPolicy {
  /** Unique policy identifier */
  policyId: PolicyId;

  /** Parent org (policies are org-scoped) */
  orgId: OrgId;

  /** Human-readable name */
  name: string;

  /** Policy type */
  type: PolicyType;

  /** Description */
  description?: string;

  /** When policy was created */
  createdAt: bigint;

  /** Last update */
  updatedAt: bigint;

  /** Version for concurrency */
  version: bigint;

  /** Whether policy is active */
  isActive: boolean;
}

/** Threshold policy: M-of-N signatures */
export interface ThresholdPolicy extends ApprovalPolicy {
  type: 'threshold';

  /** Minimum signatures required */
  threshold: number;

  /** Addresses or roles that can sign */
  signers: SignerSpec[];
}

/** Sequential policy: signatures in order */
export interface SequentialPolicy extends ApprovalPolicy {
  type: 'sequential';

  /** Ordered list of signers */
  signers: SignerSpec[];

  /** Whether to allow skipping (with timeout) */
  allowSkip: boolean;

  /** Timeout per step in milliseconds */
  stepTimeout?: bigint;
}

/** Any policy: single signature from list */
export interface AnyPolicy extends ApprovalPolicy {
  type: 'any';

  /** Addresses or roles that can sign */
  signers: SignerSpec[];
}

/** All policy: all must sign */
export interface AllPolicy extends ApprovalPolicy {
  type: 'all';

  /** Addresses or roles that must sign */
  signers: SignerSpec[];
}

/** Tiered policy: multiple levels */
export interface TieredPolicy extends ApprovalPolicy {
  type: 'tiered';

  /** Tiers in order, each must be satisfied */
  tiers: TierSpec[];
}

/** Tier specification for tiered policies */
export interface TierSpec {
  /** Tier name */
  name: string;

  /** Threshold for this tier */
  threshold: number;

  /** Signers for this tier */
  signers: SignerSpec[];

  /** Optional timeout for this tier */
  timeout?: bigint;
}

/** Signer specification - either address or role */
export interface SignerSpec {
  /** Type of signer */
  type: 'address' | 'role';

  /** Address (if type is 'address') */
  address?: string;

  /** Role ID (if type is 'role') */
  roleId?: RoleId;

  /** Optional unit scope for role-based signers */
  unitScope?: UnitId;

  /** Weight for weighted voting (default 1) */
  weight?: number;
}

/** Union of all policy types */
export type AnyApprovalPolicy = ThresholdPolicy | SequentialPolicy | AnyPolicy | AllPolicy | TieredPolicy;

// ============================================================================
// Approval Request Types
// ============================================================================

/** Status of an approval request */
export type ApprovalStatus =
  | 'pending' // Waiting for signatures
  | 'approved' // All required signatures collected
  | 'rejected' // Explicitly rejected
  | 'expired' // Timed out
  | 'cancelled' // Cancelled by requestor
  | 'executed'; // Approved and executed

/** An approval request */
export interface ApprovalRequest {
  /** Unique approval ID */
  approvalId: ApprovalId;

  /** Parent org */
  orgId: OrgId;

  /** Policy governing this approval */
  policyId: PolicyId;

  /** Current status */
  status: ApprovalStatus;

  /** Requestor address */
  requestor: string;

  /** What is being approved */
  action: ApprovalAction;

  /** Signatures collected */
  signatures: ApprovalSignature[];

  /** Rejection records */
  rejections: ApprovalRejection[];

  /** When request was created */
  createdAt: bigint;

  /** When request expires */
  expiresAt: bigint;

  /** When status last changed */
  updatedAt: bigint;

  /** Version for concurrency */
  version: bigint;

  /** Optional memo/notes */
  memo?: string;

  /** Execution result (if executed) */
  executionResult?: ExecutionResult;
}

/** What action requires approval */
export interface ApprovalAction {
  /** Type of action */
  type: string;

  /** Action-specific data */
  data: Record<string, unknown>;

  /** Hash of the action for verification */
  actionHash: string;
}

/** Common action types */
export const ActionTypes = {
  /** Transfer assets */
  TRANSFER: 'transfer',
  /** Execute transaction */
  EXECUTE_TX: 'execute_tx',
  /** Add member to org */
  ADD_MEMBER: 'add_member',
  /** Remove member from org */
  REMOVE_MEMBER: 'remove_member',
  /** Update role */
  UPDATE_ROLE: 'update_role',
  /** Deploy program */
  DEPLOY_PROGRAM: 'deploy_program',
  /** Upgrade program */
  UPGRADE_PROGRAM: 'upgrade_program',
  /** Update policy */
  UPDATE_POLICY: 'update_policy',
  /** Custom action */
  CUSTOM: 'custom',
} as const;

/** A signature on an approval */
export interface ApprovalSignature {
  /** Signer address */
  address: string;

  /** Signature data (base64) */
  signature: string;

  /** When signed */
  signedAt: bigint;

  /** Optional signer comment */
  comment?: string;

  /** Which tier/step this satisfies (for tiered/sequential) */
  tier?: number;
}

/** A rejection record */
export interface ApprovalRejection {
  /** Rejector address */
  address: string;

  /** When rejected */
  rejectedAt: bigint;

  /** Reason for rejection */
  reason: string;
}

/** Result of executing an approved action */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Transaction hash if applicable */
  txHash?: string;

  /** Error message if failed */
  error?: string;

  /** When executed */
  executedAt: bigint;

  /** Who triggered execution */
  executor: string;
}

// ============================================================================
// Event Types
// ============================================================================

/** Event: policy created */
export interface PolicyCreatedEvent {
  type: 'POLICY_CREATED';
  orgId: OrgId;
  policyId: PolicyId;
  name: string;
  policyType: PolicyType;
  timestamp: bigint;
}

/** Event: policy updated */
export interface PolicyUpdatedEvent {
  type: 'POLICY_UPDATED';
  orgId: OrgId;
  policyId: PolicyId;
  changes: Record<string, unknown>;
  timestamp: bigint;
}

/** Event: approval requested */
export interface ApprovalRequestedEvent {
  type: 'APPROVAL_REQUESTED';
  orgId: OrgId;
  approvalId: ApprovalId;
  policyId: PolicyId;
  requestor: string;
  actionType: string;
  actionHash: string;
  expiresAt: bigint;
  timestamp: bigint;
}

/** Event: approval signed */
export interface ApprovalSignedEvent {
  type: 'APPROVAL_SIGNED';
  orgId: OrgId;
  approvalId: ApprovalId;
  signer: string;
  signatureCount: number;
  timestamp: bigint;
}

/** Event: approval rejected */
export interface ApprovalRejectedEvent {
  type: 'APPROVAL_REJECTED';
  orgId: OrgId;
  approvalId: ApprovalId;
  rejector: string;
  reason: string;
  timestamp: bigint;
}

/** Event: approval completed (approved) */
export interface ApprovalCompletedEvent {
  type: 'APPROVAL_COMPLETED';
  orgId: OrgId;
  approvalId: ApprovalId;
  status: 'approved' | 'rejected' | 'expired' | 'cancelled';
  timestamp: bigint;
}

/** Event: approval executed */
export interface ApprovalExecutedEvent {
  type: 'APPROVAL_EXECUTED';
  orgId: OrgId;
  approvalId: ApprovalId;
  executor: string;
  success: boolean;
  txHash?: string;
  timestamp: bigint;
}

/** Union of all approval events */
export type ApprovalEvent =
  | PolicyCreatedEvent
  | PolicyUpdatedEvent
  | ApprovalRequestedEvent
  | ApprovalSignedEvent
  | ApprovalRejectedEvent
  | ApprovalCompletedEvent
  | ApprovalExecutedEvent;

// ============================================================================
// Helper Functions
// ============================================================================

/** Create an ApprovalId from raw string */
export function makeApprovalId(raw: string): ApprovalId {
  return raw as ApprovalId;
}

/** Create a PolicyId from raw string */
export function makePolicyId(raw: string): PolicyId {
  return raw as PolicyId;
}

/** Check if a policy is satisfied given signatures */
export function isPolicySatisfied(
  policy: AnyApprovalPolicy,
  signatures: ApprovalSignature[],
  signerAddresses: Set<string>
): boolean {
  const validSignatures = signatures.filter((s) => signerAddresses.has(s.address));

  switch (policy.type) {
    case 'threshold':
      return validSignatures.length >= policy.threshold;

    case 'any':
      return validSignatures.length >= 1;

    case 'all':
      return validSignatures.length >= policy.signers.length;

    case 'sequential': {
      // Must have signatures in order
      for (let i = 0; i < policy.signers.length; i++) {
        const sig = validSignatures.find((s) => s.tier === i);
        if (!sig) return false;
      }
      return true;
    }

    case 'tiered': {
      // Each tier must be satisfied
      for (let tierIdx = 0; tierIdx < policy.tiers.length; tierIdx++) {
        const tier = policy.tiers[tierIdx];
        const tierSigs = validSignatures.filter((s) => s.tier === tierIdx);
        if (tierSigs.length < tier.threshold) return false;
      }
      return true;
    }

    default:
      return false;
  }
}

/** Get required signature count for a policy */
export function getRequiredSignatureCount(policy: AnyApprovalPolicy): number {
  switch (policy.type) {
    case 'threshold':
      return policy.threshold;
    case 'any':
      return 1;
    case 'all':
      return policy.signers.length;
    case 'sequential':
      return policy.signers.length;
    case 'tiered':
      return policy.tiers.reduce((sum, t) => sum + t.threshold, 0);
    default:
      return 0;
  }
}

/** Check if an address can sign for a policy */
export function canSign(
  policy: AnyApprovalPolicy,
  address: string,
  memberRoles: Set<RoleId>,
  tier?: number
): boolean {
  let signers: SignerSpec[];

  if (policy.type === 'tiered') {
    if (tier === undefined || tier < 0 || tier >= policy.tiers.length) {
      return false;
    }
    signers = policy.tiers[tier].signers;
  } else {
    signers = policy.signers;
  }

  return signers.some((spec) => {
    if (spec.type === 'address') {
      return spec.address === address;
    } else if (spec.type === 'role' && spec.roleId) {
      return memberRoles.has(spec.roleId);
    }
    return false;
  });
}

/** Calculate action hash for verification */
export function calculateActionHash(action: Omit<ApprovalAction, 'actionHash'>): string {
  // Deterministic hash - recursively sort keys
  const sortObject = (obj: unknown): unknown => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(sortObject);
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortObject((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  };

  const str = JSON.stringify(sortObject(action));
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}
