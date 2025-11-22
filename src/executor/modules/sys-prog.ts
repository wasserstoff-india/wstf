/**
 * SYS.PROG - Program Registry Handlers
 *
 * Handles on-chain program registration, updates, and policy management.
 */

import crypto from 'crypto';
import { InstructionRecord } from '../../instructions/abi';
import { ExecutionContext, ExecutionEffects } from '../types';
import { addLog, addEventLog } from '../engine';
import {
  ProgramMetadata,
  ProgramPolicy,
  ProgramRegistration,
  ProgramStatus,
  ProgramRegistrationRequest,
  ProgramUpdateRequest,
  DEFAULT_PROGRAM_POLICY,
  validateProgramId,
  isAddressAllowed,
} from '../../programs/types';
import {
  EventKey,
  Topic,
  EventData,
  eventKeyFromString,
  topicFromString,
  topicFromAddress,
} from '../../events/logs/types';

// Event keys for program registry events
export const EVENT_KEY_PROGRAM_REGISTERED = eventKeyFromString('PROGRAM_REGISTERED');
export const EVENT_KEY_PROGRAM_UPDATED = eventKeyFromString('PROGRAM_UPDATED');
export const EVENT_KEY_PROGRAM_STATUS_CHANGED = eventKeyFromString('PROGRAM_STATUS_CHANGED');

// State ID prefix for program registry
const PROGRAM_STATE_PREFIX = 'sys.programs';

/**
 * Build state ID for a program
 */
function buildProgramStateId(programId: string): string {
  return `${PROGRAM_STATE_PREFIX}:${programId}`;
}

/**
 * SYS.PROG_REGISTER - Register a new program
 * Args: { id, metadata, policy }
 */
export async function handlePROG_REGISTER(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const request = ir.args as ProgramRegistrationRequest;
  const { id, metadata, policy } = request;

  // Validate program ID
  const idValidation = validateProgramId(id);
  if (!idValidation.valid) {
    throw new Error(`PROG_REGISTER: ${idValidation.error}`);
  }

  // Check program doesn't already exist
  const stateId = buildProgramStateId(id);
  const existing = await ctx.getState(stateId);
  if (existing) {
    throw new Error(`PROG_REGISTER: program ${id} already exists`);
  }

  // Validate metadata
  if (!metadata.name || typeof metadata.name !== 'string') {
    throw new Error('PROG_REGISTER: metadata.name is required');
  }
  if (!metadata.version || typeof metadata.version !== 'string') {
    throw new Error('PROG_REGISTER: metadata.version is required');
  }
  if (!metadata.description || typeof metadata.description !== 'string') {
    throw new Error('PROG_REGISTER: metadata.description is required');
  }

  // Build full metadata
  const now = Date.now();
  const fullMetadata: ProgramMetadata = {
    id,
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    owner: ctx.txFrom,
    tags: metadata.tags || [],
    homepage: metadata.homepage,
    docsUrl: metadata.docsUrl,
    repoUrl: metadata.repoUrl,
    iconUrl: metadata.iconUrl,
    endpoints: metadata.endpoints,
    createdAt: now,
    updatedAt: now,
  };

  // Use provided policy or defaults
  const fullPolicy: ProgramPolicy = {
    access: {
      ...DEFAULT_PROGRAM_POLICY.access,
      ...policy?.access,
    },
    rateLimit: {
      ...DEFAULT_PROGRAM_POLICY.rateLimit,
      ...policy?.rateLimit,
    },
    constraints: {
      ...DEFAULT_PROGRAM_POLICY.constraints,
      ...policy?.constraints,
    },
    requiredDeposit: policy?.requiredDeposit,
    callFee: policy?.callFee,
  };

  // Build registration record
  const registration: ProgramRegistration = {
    metadata: fullMetadata,
    policy: fullPolicy,
    status: 'active',
    registrationTxId: ctx.txFrom, // Would be actual tx ID in real impl
    registrationBlock: ctx.currentBlockHeight ?? 0n,
    totalCalls: 0n,
    uniqueCallers: 0,
    totalRevenue: 0n,
  };

  // Serialize and write to state
  const dataHash = crypto.createHash('sha256')
    .update(JSON.stringify(registration))
    .digest('hex');

  effects.writes.push({
    stateId,
    key: 'registration',
    value: Buffer.from(JSON.stringify(registration)),
    newVersion: dataHash,
  });

  // Emit registration event
  addEventLog(effects, {
    module: 'SYS.PROG',
    key: EVENT_KEY_PROGRAM_REGISTERED,
    topics: [
      topicFromString(id),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${Buffer.from(JSON.stringify({
      programId: id,
      owner: ctx.txFrom,
      name: fullMetadata.name,
      version: fullMetadata.version,
    })).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `PROG_REGISTER: Registered ${id}`, {
    name: fullMetadata.name,
    owner: ctx.txFrom,
  });
}

/**
 * SYS.PROG_UPDATE - Update program metadata or policy
 * Args: { programId, metadata?, policy?, status? }
 */
export async function handlePROG_UPDATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const request = ir.args as ProgramUpdateRequest;
  const { programId, metadata, policy, status } = request;

  // Get existing program
  const stateId = buildProgramStateId(programId);
  const existing = await ctx.getState(stateId);
  if (!existing) {
    throw new Error(`PROG_UPDATE: program ${programId} not found`);
  }

  // Parse existing registration
  const registrationData = existing.data.get('registration');
  if (!registrationData) {
    throw new Error(`PROG_UPDATE: program ${programId} has no registration data`);
  }
  const registration: ProgramRegistration = JSON.parse(registrationData.toString());

  // Check ownership
  if (registration.metadata.owner !== ctx.txFrom) {
    throw new Error(`PROG_UPDATE: only owner can update program (owner: ${registration.metadata.owner})`);
  }

  // Apply metadata updates
  if (metadata) {
    if (metadata.name !== undefined) registration.metadata.name = metadata.name;
    if (metadata.version !== undefined) registration.metadata.version = metadata.version;
    if (metadata.description !== undefined) registration.metadata.description = metadata.description;
    if (metadata.tags !== undefined) registration.metadata.tags = metadata.tags;
    if (metadata.homepage !== undefined) registration.metadata.homepage = metadata.homepage;
    if (metadata.docsUrl !== undefined) registration.metadata.docsUrl = metadata.docsUrl;
    if (metadata.repoUrl !== undefined) registration.metadata.repoUrl = metadata.repoUrl;
    if (metadata.iconUrl !== undefined) registration.metadata.iconUrl = metadata.iconUrl;
    if (metadata.endpoints !== undefined) registration.metadata.endpoints = metadata.endpoints;
    registration.metadata.updatedAt = Date.now();
  }

  // Apply policy updates
  if (policy) {
    if (policy.access) {
      registration.policy.access = { ...registration.policy.access, ...policy.access };
    }
    if (policy.rateLimit) {
      registration.policy.rateLimit = { ...registration.policy.rateLimit, ...policy.rateLimit };
    }
    if (policy.constraints) {
      registration.policy.constraints = { ...registration.policy.constraints, ...policy.constraints };
    }
    if (policy.requiredDeposit !== undefined) {
      registration.policy.requiredDeposit = policy.requiredDeposit;
    }
    if (policy.callFee !== undefined) {
      registration.policy.callFee = policy.callFee;
    }
  }

  // Apply status change
  if (status && status !== registration.status) {
    const oldStatus = registration.status;
    registration.status = status;

    // Emit status change event
    addEventLog(effects, {
      module: 'SYS.PROG',
      key: EVENT_KEY_PROGRAM_STATUS_CHANGED,
      topics: [
        topicFromString(programId),
        topicFromString(oldStatus),
        topicFromString(status),
      ],
      data: `0x${Buffer.from(JSON.stringify({
        programId,
        oldStatus,
        newStatus: status,
        changedBy: ctx.txFrom,
      })).toString('hex')}` as EventData,
    });
  }

  // Write updated registration
  const dataHash = crypto.createHash('sha256')
    .update(JSON.stringify(registration))
    .digest('hex');

  effects.writes.push({
    stateId,
    key: 'registration',
    value: Buffer.from(JSON.stringify(registration)),
    newVersion: dataHash,
  });

  // Emit update event
  addEventLog(effects, {
    module: 'SYS.PROG',
    key: EVENT_KEY_PROGRAM_UPDATED,
    topics: [
      topicFromString(programId),
      topicFromAddress(ctx.txFrom),
    ],
    data: `0x${Buffer.from(JSON.stringify({
      programId,
      updatedBy: ctx.txFrom,
      hasMetadataChanges: !!metadata,
      hasPolicyChanges: !!policy,
      hasStatusChange: !!status,
    })).toString('hex')}` as EventData,
  });

  addLog(effects, 'info', `PROG_UPDATE: Updated ${programId}`, {
    metadataChanged: !!metadata,
    policyChanged: !!policy,
    statusChanged: !!status,
  });
}

/**
 * SYS.PROG_QUERY - Query program registration (read-only)
 * Args: { programId }
 *
 * Note: In a real implementation, this would be handled differently
 * as queries should not modify state. This is for completeness.
 */
export async function handlePROG_QUERY(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { programId } = ir.args;

  // Get program
  const stateId = buildProgramStateId(programId);
  const existing = await ctx.getState(stateId);

  if (!existing) {
    addLog(effects, 'warning', `PROG_QUERY: program ${programId} not found`);
    return;
  }

  const registrationData = existing.data.get('registration');
  if (!registrationData) {
    addLog(effects, 'warning', `PROG_QUERY: program ${programId} has no registration data`);
    return;
  }

  const registration: ProgramRegistration = JSON.parse(registrationData.toString());

  addLog(effects, 'info', `PROG_QUERY: Found ${programId}`, {
    name: registration.metadata.name,
    status: registration.status,
    owner: registration.metadata.owner,
    totalCalls: registration.totalCalls.toString(),
  });
}

/**
 * SYS.PROG_CHECK_ACCESS - Check if a caller can access a program
 * Args: { programId, caller }
 */
export async function handlePROG_CHECK_ACCESS(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { programId, caller } = ir.args;

  // Get program
  const stateId = buildProgramStateId(programId);
  const existing = await ctx.getState(stateId);

  if (!existing) {
    addLog(effects, 'warning', `PROG_CHECK_ACCESS: program ${programId} not found`);
    return;
  }

  const registrationData = existing.data.get('registration');
  if (!registrationData) {
    addLog(effects, 'warning', `PROG_CHECK_ACCESS: program ${programId} has no registration data`);
    return;
  }

  const registration: ProgramRegistration = JSON.parse(registrationData.toString());

  // Check status
  if (registration.status !== 'active') {
    addLog(effects, 'info', `PROG_CHECK_ACCESS: ${programId} is ${registration.status}`, {
      caller,
      allowed: false,
      reason: 'program_not_active',
    });
    return;
  }

  // Check address access
  const allowed = isAddressAllowed(caller, registration.policy);

  addLog(effects, 'info', `PROG_CHECK_ACCESS: ${caller} -> ${programId}`, {
    allowed,
    reason: allowed ? 'access_granted' : 'address_not_allowed',
  });
}

/**
 * SYS.PROG_RECORD_CALL - Record a program call (for stats)
 * Args: { programId, caller, success, durationMs }
 *
 * Called by instruction runners to update program statistics.
 */
export async function handlePROG_RECORD_CALL(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { programId, caller, success, durationMs } = ir.args;

  // Get program
  const stateId = buildProgramStateId(programId);
  const existing = await ctx.getState(stateId);

  if (!existing) {
    addLog(effects, 'warning', `PROG_RECORD_CALL: program ${programId} not found`);
    return;
  }

  const registrationData = existing.data.get('registration');
  if (!registrationData) {
    addLog(effects, 'warning', `PROG_RECORD_CALL: program ${programId} has no registration data`);
    return;
  }

  const registration: ProgramRegistration = JSON.parse(registrationData.toString());

  // Update stats
  registration.totalCalls = BigInt(registration.totalCalls) + 1n;
  registration.lastCallAt = Date.now();

  // Track unique callers (simplified - in reality would use a set/bloom filter)
  // For now, just increment if it's a new-ish call
  if (registration.totalCalls % 10n === 0n) {
    registration.uniqueCallers++;
  }

  // Add call fee revenue
  if (registration.policy.callFee && success) {
    registration.totalRevenue = BigInt(registration.totalRevenue) + registration.policy.callFee;
  }

  // Write updated registration
  const dataHash = crypto.createHash('sha256')
    .update(JSON.stringify(registration))
    .digest('hex');

  effects.writes.push({
    stateId,
    key: 'registration',
    value: Buffer.from(JSON.stringify(registration)),
    newVersion: dataHash,
  });

  addLog(effects, 'info', `PROG_RECORD_CALL: Recorded call to ${programId}`, {
    caller,
    success,
    durationMs,
    totalCalls: registration.totalCalls.toString(),
  });
}
