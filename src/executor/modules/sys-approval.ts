/**
 * SYS.APPROVAL_* Instructions - Multi-signature approval flows
 *
 * Handlers for creating and managing approval policies and requests.
 * All operations are deterministic and emit events for audit trail.
 */

import crypto from 'crypto';
import { InstructionRecord } from '../../instructions/abi';
import { ExecutionContext, ExecutionEffects } from '../types';
import { addLog, addEventLog } from '../engine';
import { OrgId, OrgRegistration, makeOrgId } from '../../accounts/orgTypes';
import {
  ApprovalId,
  PolicyId,
  ApprovalStatus,
  ApprovalRequest,
  ApprovalSignature,
  ApprovalRejection,
  ApprovalAction,
  AnyApprovalPolicy,
  ThresholdPolicy,
  SequentialPolicy,
  AnyPolicy,
  AllPolicy,
  TieredPolicy,
  SignerSpec,
  ExecutionResult,
  PolicyType,
  makeApprovalId,
  makePolicyId,
  isPolicySatisfied,
  calculateActionHash,
} from '../../accounts/approvalsTypes';
import { topicFromString, topicFromAddress, EventKey, Topic, EventData } from '../../events/logs/types';

// ============================================================================
// Event Keys for Approval Operations
// ============================================================================

export const EVENT_KEY_POLICY_CREATED = '0x504f4c4943595f435245415445440000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_POLICY_UPDATED = '0x504f4c4943595f555044415445440000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_APPROVAL_REQUESTED = '0x415050524f56414c5f524551554553544544000000000000000000000000' as EventKey;
export const EVENT_KEY_APPROVAL_SIGNED = '0x415050524f56414c5f5349474e45440000000000000000000000000000000000' as EventKey;
export const EVENT_KEY_APPROVAL_REJECTED = '0x415050524f56414c5f52454a45435445440000000000000000000000000000' as EventKey;
export const EVENT_KEY_APPROVAL_CANCELLED = '0x415050524f56414c5f43414e43454c4c454400000000000000000000000000' as EventKey;
export const EVENT_KEY_APPROVAL_EXECUTED = '0x415050524f56414c5f455845435554454400000000000000000000000000' as EventKey;

// ============================================================================
// Helper Functions
// ============================================================================

/** Get state ID for org */
function orgStateId(orgId: OrgId): string {
  return `org:${orgId}`;
}

/** Get state ID for policy */
function policyStateId(policyId: PolicyId): string {
  return `policy:${policyId}`;
}

/** Get state ID for approval */
function approvalStateId(approvalId: ApprovalId): string {
  return `approval:${approvalId}`;
}

/** Data key used within StateData.data Map */
const DATA_KEY = 'data';

/** Generate deterministic policy ID */
function generatePolicyId(orgId: OrgId, name: string, nonce: bigint): PolicyId {
  const hash = crypto.createHash('sha256')
    .update(`policy:${orgId}:${name}:${nonce}`)
    .digest('hex')
    .slice(0, 16);
  return makePolicyId(`pol_${hash}`);
}

/** Generate deterministic approval ID */
function generateApprovalId(orgId: OrgId, requestor: string, actionHash: string, nonce: bigint): ApprovalId {
  const hash = crypto.createHash('sha256')
    .update(`approval:${orgId}:${requestor}:${actionHash}:${nonce}`)
    .digest('hex')
    .slice(0, 16);
  return makeApprovalId(`appr_${hash}`);
}

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

/** Check if address can sign for policy */
function canSignForPolicy(
  policy: AnyApprovalPolicy,
  address: string,
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
    }
    // Role-based signers would need member/role lookup
    return false;
  });
}

/** Get signer addresses from policy */
function getPolicySignerAddresses(policy: AnyApprovalPolicy): Set<string> {
  const addresses = new Set<string>();

  const extractAddresses = (signers: SignerSpec[]) => {
    for (const signer of signers) {
      if (signer.type === 'address' && signer.address) {
        addresses.add(signer.address);
      }
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

// ============================================================================
// APPROVAL_POLICY_CREATE Handler
// ============================================================================

export interface PolicyCreateArgs {
  orgId: string;
  name: string;
  description?: string;
  type: PolicyType;
  threshold?: number;
  signers?: SignerSpec[];
  tiers?: Array<{
    name: string;
    threshold: number;
    signers: SignerSpec[];
    timeout?: bigint;
  }>;
  allowSkip?: boolean;
  stepTimeout?: bigint;
  nonce: bigint;
}

/**
 * SYS.APPROVAL_POLICY_CREATE - Create approval policy
 * Args: { orgId, name, description?, type, threshold?, signers?, tiers?, nonce }
 */
export async function handleAPPROVAL_POLICY_CREATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const args = ir.args as PolicyCreateArgs;
  const { orgId, name, description, type, threshold, signers, tiers, allowSkip, stepTimeout, nonce } = args;

  // Validate org exists
  const orgKey = orgStateId(makeOrgId(orgId));
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`APPROVAL_POLICY_CREATE: org ${orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`APPROVAL_POLICY_CREATE: only owner can create policies`);
  }

  // Generate policy ID
  const policyId = generatePolicyId(makeOrgId(orgId), name, BigInt(nonce || 0));

  // Check policy doesn't exist
  const existingPolicy = await ctx.getState(policyStateId(policyId));
  if (existingPolicy) {
    throw new Error(`APPROVAL_POLICY_CREATE: policy ${policyId} already exists`);
  }

  const now = BigInt(Date.now());

  // Build policy based on type
  let policy: AnyApprovalPolicy;
  const basePolicy = {
    policyId,
    orgId: makeOrgId(orgId),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    version: 0n,
    isActive: true,
  };

  switch (type) {
    case 'threshold':
      if (threshold === undefined || !signers) {
        throw new Error(`APPROVAL_POLICY_CREATE: threshold policy requires threshold and signers`);
      }
      if (threshold < 1 || threshold > signers.length) {
        throw new Error(`APPROVAL_POLICY_CREATE: invalid threshold (must be 1-${signers.length})`);
      }
      policy = {
        ...basePolicy,
        type: 'threshold',
        threshold,
        signers,
      } as ThresholdPolicy;
      break;

    case 'any':
      if (!signers) {
        throw new Error(`APPROVAL_POLICY_CREATE: any policy requires signers`);
      }
      policy = {
        ...basePolicy,
        type: 'any',
        signers,
      } as AnyPolicy;
      break;

    case 'all':
      if (!signers) {
        throw new Error(`APPROVAL_POLICY_CREATE: all policy requires signers`);
      }
      policy = {
        ...basePolicy,
        type: 'all',
        signers,
      } as AllPolicy;
      break;

    case 'sequential':
      if (!signers) {
        throw new Error(`APPROVAL_POLICY_CREATE: sequential policy requires signers`);
      }
      policy = {
        ...basePolicy,
        type: 'sequential',
        signers,
        allowSkip: allowSkip || false,
        stepTimeout,
      } as SequentialPolicy;
      break;

    case 'tiered':
      if (!tiers || tiers.length === 0) {
        throw new Error(`APPROVAL_POLICY_CREATE: tiered policy requires tiers`);
      }
      policy = {
        ...basePolicy,
        type: 'tiered',
        tiers: tiers.map((t) => ({
          name: t.name,
          threshold: t.threshold,
          signers: t.signers,
          timeout: t.timeout,
        })),
      } as TieredPolicy;
      break;

    default:
      throw new Error(`APPROVAL_POLICY_CREATE: unknown policy type: ${type}`);
  }

  const stateId = policyStateId(policyId);
  const newVersion = crypto.createHash('sha256').update(encodeState(policy)).digest('hex');

  effects.writes.push({
    stateId,
    key: DATA_KEY,
    value: encodeState(policy),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.APPROVAL_POLICY_CREATE',
    key: EVENT_KEY_POLICY_CREATED,
    topics: [
      topicFromString(orgId),
      topicFromString(policyId),
    ],
    data: `0x${encodeState({ policyId, name, type }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `APPROVAL_POLICY_CREATE: Created policy ${policyId}`, { name, type });
}

// ============================================================================
// APPROVAL_POLICY_UPDATE Handler
// ============================================================================

export interface PolicyUpdateArgs {
  policyId: string;
  updates: {
    name?: string;
    description?: string;
    isActive?: boolean;
    threshold?: number;
    signers?: SignerSpec[];
  };
  expectedVersion: bigint;
}

/**
 * SYS.APPROVAL_POLICY_UPDATE - Update approval policy
 * Args: { policyId, updates, expectedVersion }
 */
export async function handleAPPROVAL_POLICY_UPDATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { policyId, updates, expectedVersion } = ir.args as PolicyUpdateArgs;

  const stateKey = policyStateId(makePolicyId(policyId));
  const existing = await ctx.getState(stateKey);

  if (!existing) {
    throw new Error(`APPROVAL_POLICY_UPDATE: policy ${policyId} not found`);
  }

  const policy = decodeState<AnyApprovalPolicy>(existing.data);

  // Check org ownership
  const orgKey = orgStateId(policy.orgId);
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`APPROVAL_POLICY_UPDATE: org ${policy.orgId} not found`);
  }

  const org = decodeState<OrgRegistration>(orgState.data);
  if (org.ownerAddress !== ctx.txFrom) {
    throw new Error(`APPROVAL_POLICY_UPDATE: only owner can update policies`);
  }

  // Check version
  if (policy.version !== BigInt(expectedVersion)) {
    throw new Error(`APPROVAL_POLICY_UPDATE: version mismatch`);
  }

  // Apply updates (preserve type-specific fields)
  const updated = {
    ...policy,
    ...updates,
    policyId: policy.policyId,
    orgId: policy.orgId,
    type: policy.type,
    createdAt: policy.createdAt,
    updatedAt: BigInt(Date.now()),
    version: policy.version + 1n,
  } as AnyApprovalPolicy;

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId: stateKey,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.APPROVAL_POLICY_UPDATE',
    key: EVENT_KEY_POLICY_UPDATED,
    topics: [
      topicFromString(policy.orgId),
      topicFromString(policyId),
    ],
    data: `0x${encodeState({ policyId, changes: Object.keys(updates) }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `APPROVAL_POLICY_UPDATE: Updated policy ${policyId}`, { changes: Object.keys(updates) });
}

// ============================================================================
// APPROVAL_REQUEST Handler
// ============================================================================

export interface ApprovalRequestArgs {
  orgId: string;
  policyId: string;
  action: {
    type: string;
    data: Record<string, unknown>;
  };
  memo?: string;
  expiresAt?: bigint;
  nonce: bigint;
}

/**
 * SYS.APPROVAL_REQUEST - Create approval request
 * Args: { orgId, policyId, action, memo?, expiresAt?, nonce }
 */
export async function handleAPPROVAL_REQUEST(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { orgId, policyId, action, memo, expiresAt, nonce } = ir.args as ApprovalRequestArgs;

  // Validate org exists
  const orgKey = orgStateId(makeOrgId(orgId));
  const orgState = await ctx.getState(orgKey);
  if (!orgState) {
    throw new Error(`APPROVAL_REQUEST: org ${orgId} not found`);
  }

  // Validate policy exists
  const policyKey = policyStateId(makePolicyId(policyId));
  const policyState = await ctx.getState(policyKey);
  if (!policyState) {
    throw new Error(`APPROVAL_REQUEST: policy ${policyId} not found`);
  }

  const policy = decodeState<AnyApprovalPolicy>(policyState.data);
  if (!policy.isActive) {
    throw new Error(`APPROVAL_REQUEST: policy ${policyId} is inactive`);
  }

  // Calculate action hash
  const actionHash = calculateActionHash(action);

  // Generate approval ID
  const approvalId = generateApprovalId(makeOrgId(orgId), ctx.txFrom, actionHash, BigInt(nonce || 0));

  // Check approval doesn't exist
  const existingApproval = await ctx.getState(approvalStateId(approvalId));
  if (existingApproval) {
    throw new Error(`APPROVAL_REQUEST: approval ${approvalId} already exists`);
  }

  const now = BigInt(Date.now());
  const defaultExpiry = now + BigInt(7 * 24 * 60 * 60 * 1000); // 7 days

  const approval: ApprovalRequest = {
    approvalId,
    orgId: makeOrgId(orgId),
    policyId: makePolicyId(policyId),
    status: 'pending',
    requestor: ctx.txFrom,
    action: {
      ...action,
      actionHash,
    },
    signatures: [],
    rejections: [],
    createdAt: now,
    expiresAt: expiresAt ? BigInt(expiresAt) : defaultExpiry,
    updatedAt: now,
    version: 0n,
    memo,
  };

  const stateId = approvalStateId(approvalId);
  const newVersion = crypto.createHash('sha256').update(encodeState(approval)).digest('hex');

  effects.writes.push({
    stateId,
    key: DATA_KEY,
    value: encodeState(approval),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.APPROVAL_REQUEST',
    key: EVENT_KEY_APPROVAL_REQUESTED,
    topics: [
      topicFromString(orgId),
      topicFromString(approvalId),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${encodeState({ approvalId, policyId, actionType: action.type, actionHash }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `APPROVAL_REQUEST: Created approval ${approvalId}`, {
    policyId,
    actionType: action.type,
  });
}

// ============================================================================
// APPROVAL_SIGN Handler
// ============================================================================

export interface ApprovalSignArgs {
  approvalId: string;
  signature: string;
  comment?: string;
  tier?: number;
}

/**
 * SYS.APPROVAL_SIGN - Sign approval request
 * Args: { approvalId, signature, comment?, tier? }
 */
export async function handleAPPROVAL_SIGN(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { approvalId, signature, comment, tier } = ir.args as ApprovalSignArgs;

  const stateKey = approvalStateId(makeApprovalId(approvalId));
  const existing = await ctx.getState(stateKey);

  if (!existing) {
    throw new Error(`APPROVAL_SIGN: approval ${approvalId} not found`);
  }

  const approval = decodeState<ApprovalRequest>(existing.data);

  // Check status
  if (approval.status !== 'pending') {
    throw new Error(`APPROVAL_SIGN: approval ${approvalId} is not pending (status: ${approval.status})`);
  }

  // Check expiry
  const now = BigInt(Date.now());
  if (approval.expiresAt <= now) {
    throw new Error(`APPROVAL_SIGN: approval ${approvalId} has expired`);
  }

  // Check not already signed by this address
  if (approval.signatures.some((s) => s.address === ctx.txFrom)) {
    throw new Error(`APPROVAL_SIGN: ${ctx.txFrom} has already signed this approval`);
  }

  // Get policy and check signer eligibility
  const policyKey = policyStateId(approval.policyId);
  const policyState = await ctx.getState(policyKey);
  if (!policyState) {
    throw new Error(`APPROVAL_SIGN: policy ${approval.policyId} not found`);
  }

  const policy = decodeState<AnyApprovalPolicy>(policyState.data);
  if (!canSignForPolicy(policy, ctx.txFrom, tier)) {
    throw new Error(`APPROVAL_SIGN: ${ctx.txFrom} is not an eligible signer`);
  }

  // Add signature
  const newSignature: ApprovalSignature = {
    address: ctx.txFrom,
    signature,
    signedAt: now,
    comment,
    tier,
  };

  const newSignatures = [...approval.signatures, newSignature];

  // Check if policy is now satisfied
  const signerAddresses = getPolicySignerAddresses(policy);
  let newStatus: ApprovalStatus = 'pending';
  if (isPolicySatisfied(policy, newSignatures, signerAddresses)) {
    newStatus = 'approved';
  }

  const updated: ApprovalRequest = {
    ...approval,
    signatures: newSignatures,
    status: newStatus,
    updatedAt: now,
    version: approval.version + 1n,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId: stateKey,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.APPROVAL_SIGN',
    key: EVENT_KEY_APPROVAL_SIGNED,
    topics: [
      topicFromString(approval.orgId),
      topicFromString(approvalId),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${encodeState({ approvalId, signer: ctx.txFrom, signatureCount: newSignatures.length, status: newStatus }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `APPROVAL_SIGN: Signed approval ${approvalId}`, {
    signer: ctx.txFrom,
    total: newSignatures.length,
    status: newStatus,
  });
}

// ============================================================================
// APPROVAL_REJECT Handler
// ============================================================================

export interface ApprovalRejectArgs {
  approvalId: string;
  reason: string;
}

/**
 * SYS.APPROVAL_REJECT - Reject approval request
 * Args: { approvalId, reason }
 */
export async function handleAPPROVAL_REJECT(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { approvalId, reason } = ir.args as ApprovalRejectArgs;

  const stateKey = approvalStateId(makeApprovalId(approvalId));
  const existing = await ctx.getState(stateKey);

  if (!existing) {
    throw new Error(`APPROVAL_REJECT: approval ${approvalId} not found`);
  }

  const approval = decodeState<ApprovalRequest>(existing.data);

  // Check status
  if (approval.status !== 'pending') {
    throw new Error(`APPROVAL_REJECT: approval ${approvalId} is not pending`);
  }

  // Get policy and check rejector eligibility
  const policyKey = policyStateId(approval.policyId);
  const policyState = await ctx.getState(policyKey);
  if (!policyState) {
    throw new Error(`APPROVAL_REJECT: policy ${approval.policyId} not found`);
  }

  const policy = decodeState<AnyApprovalPolicy>(policyState.data);
  if (!canSignForPolicy(policy, ctx.txFrom)) {
    throw new Error(`APPROVAL_REJECT: ${ctx.txFrom} is not an eligible rejector`);
  }

  const now = BigInt(Date.now());

  const rejection: ApprovalRejection = {
    address: ctx.txFrom,
    rejectedAt: now,
    reason,
  };

  const updated: ApprovalRequest = {
    ...approval,
    rejections: [...approval.rejections, rejection],
    status: 'rejected',
    updatedAt: now,
    version: approval.version + 1n,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId: stateKey,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.APPROVAL_REJECT',
    key: EVENT_KEY_APPROVAL_REJECTED,
    topics: [
      topicFromString(approval.orgId),
      topicFromString(approvalId),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${encodeState({ approvalId, rejector: ctx.txFrom, reason }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `APPROVAL_REJECT: Rejected approval ${approvalId}`, {
    rejector: ctx.txFrom,
    reason,
  });
}

// ============================================================================
// APPROVAL_CANCEL Handler
// ============================================================================

export interface ApprovalCancelArgs {
  approvalId: string;
}

/**
 * SYS.APPROVAL_CANCEL - Cancel approval request (by requestor)
 * Args: { approvalId }
 */
export async function handleAPPROVAL_CANCEL(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { approvalId } = ir.args as ApprovalCancelArgs;

  const stateKey = approvalStateId(makeApprovalId(approvalId));
  const existing = await ctx.getState(stateKey);

  if (!existing) {
    throw new Error(`APPROVAL_CANCEL: approval ${approvalId} not found`);
  }

  const approval = decodeState<ApprovalRequest>(existing.data);

  // Check status
  if (approval.status !== 'pending') {
    throw new Error(`APPROVAL_CANCEL: approval ${approvalId} is not pending`);
  }

  // Only requestor can cancel
  if (approval.requestor !== ctx.txFrom) {
    // Also allow org owner to cancel
    const orgKey = orgStateId(approval.orgId);
    const orgState = await ctx.getState(orgKey);
    if (orgState) {
      const org = decodeState<OrgRegistration>(orgState.data);
      if (org.ownerAddress !== ctx.txFrom) {
        throw new Error(`APPROVAL_CANCEL: only requestor or org owner can cancel`);
      }
    } else {
      throw new Error(`APPROVAL_CANCEL: only requestor can cancel`);
    }
  }

  const now = BigInt(Date.now());

  const updated: ApprovalRequest = {
    ...approval,
    status: 'cancelled',
    updatedAt: now,
    version: approval.version + 1n,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId: stateKey,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.APPROVAL_CANCEL',
    key: EVENT_KEY_APPROVAL_CANCELLED,
    topics: [
      topicFromString(approval.orgId),
      topicFromString(approvalId),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${encodeState({ approvalId, cancelledBy: ctx.txFrom }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `APPROVAL_CANCEL: Cancelled approval ${approvalId}`, {
    cancelledBy: ctx.txFrom,
  });
}

// ============================================================================
// APPROVAL_EXECUTE Handler
// ============================================================================

export interface ApprovalExecuteArgs {
  approvalId: string;
}

/**
 * SYS.APPROVAL_EXECUTE - Execute approved action
 * Args: { approvalId }
 *
 * This marks the approval as executed. The actual execution
 * of the action should be handled by subsequent instructions
 * or off-chain processes.
 */
export async function handleAPPROVAL_EXECUTE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { approvalId } = ir.args as ApprovalExecuteArgs;

  const stateKey = approvalStateId(makeApprovalId(approvalId));
  const existing = await ctx.getState(stateKey);

  if (!existing) {
    throw new Error(`APPROVAL_EXECUTE: approval ${approvalId} not found`);
  }

  const approval = decodeState<ApprovalRequest>(existing.data);

  // Check status
  if (approval.status !== 'approved') {
    throw new Error(`APPROVAL_EXECUTE: approval ${approvalId} is not approved (status: ${approval.status})`);
  }

  const now = BigInt(Date.now());

  const executionResult: ExecutionResult = {
    success: true,
    executedAt: now,
    executor: ctx.txFrom,
  };

  const updated: ApprovalRequest = {
    ...approval,
    status: 'executed',
    executionResult,
    updatedAt: now,
    version: approval.version + 1n,
  };

  const newVersion = crypto.createHash('sha256').update(encodeState(updated)).digest('hex');

  effects.writes.push({
    stateId: stateKey,
    key: DATA_KEY,
    value: encodeState(updated),
    newVersion,
  });

  addEventLog(effects, {
    module: 'SYS.APPROVAL_EXECUTE',
    key: EVENT_KEY_APPROVAL_EXECUTED,
    topics: [
      topicFromString(approval.orgId),
      topicFromString(approvalId),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${encodeState({ approvalId, executor: ctx.txFrom, actionType: approval.action.type }).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `APPROVAL_EXECUTE: Executed approval ${approvalId}`, {
    executor: ctx.txFrom,
    actionType: approval.action.type,
  });
}
