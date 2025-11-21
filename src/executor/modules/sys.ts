import crypto from 'crypto';
import { InstructionRecord } from '../../instructions/abi';
import { ExecutionContext, ExecutionEffects, StateData, StateWrite } from '../types';
import { checkAuthority, checkVersion } from '../authority';
import { addLog } from '../engine';
import { signPreimage, verifyPreimage } from '../../crypto/sign';
import { SigAlgId } from '../../crypto/algorithms';

/**
 * SYS.REG - Register new state
 * Args: { stateId, type, owner, metadata? }
 */
export async function handleREG(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { stateId, type, owner, metadata } = ir.args;

  // Validate owner is tx sender
  if (owner !== ctx.txFrom) {
    throw new Error(`REG: owner must be tx.from (${ctx.txFrom}), got ${owner}`);
  }

  // Check state doesn't already exist
  const existing = await ctx.getState(stateId);
  if (existing) {
    throw new Error(`REG: state ${stateId} already exists`);
  }

  // Create new state (write will be handled by subsequent INIT)
  addLog(effects, 'info', `REG: Registered state ${stateId}`, { type, owner });
}

/**
 * SYS.INIT - Initialize state data
 * Args: { stateId, expectedVersion, data }
 */
export async function handleINIT(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { stateId, expectedVersion, data } = ir.args;

  // Get current state
  const state = await ctx.getState(stateId);
  const currentVersion = state?.version || '0'.repeat(64);

  // Check version
  const versionCheck = checkVersion(stateId, expectedVersion, currentVersion);
  if (!versionCheck.valid) {
    throw new Error(`INIT: ${versionCheck.reason}`);
  }

  // Check authority
  if (state) {
    const authCheck = checkAuthority(ir, ctx, state);
    if (!authCheck.authorized) {
      throw new Error(`INIT: ${authCheck.reason}`);
    }
  }

  // Compute new version
  const dataHash = crypto.createHash('sha256').update(JSON.stringify(data)).digest();
  const newVersion = dataHash.toString('hex');

  // Write data
  for (const [key, value] of Object.entries(data)) {
    effects.writes.push({
      stateId,
      key,
      value: Buffer.from(value as string, 'utf8'),
      newVersion
    });
  }

  addLog(effects, 'info', `INIT: Initialized state ${stateId}`, { keys: Object.keys(data).length });
}

/**
 * SYS.UPDATE - Deterministic state updates
 * Args: { stateId, expectedVersion, patch }
 */
export async function handleUPDATE(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { stateId, expectedVersion, patch } = ir.args;

  // Get current state
  const state = await ctx.getState(stateId);
  if (!state) {
    throw new Error(`UPDATE: state ${stateId} not found`);
  }

  // Check version
  const versionCheck = checkVersion(stateId, expectedVersion, state.version);
  if (!versionCheck.valid) {
    const mergeStrategy = patch.mergeStrategy || 'fail';
    if (mergeStrategy === 'fail') {
      throw new Error(`UPDATE: ${versionCheck.reason}`);
    }
    // For LWW/CRDT strategies, we'd implement merge logic here
    addLog(effects, 'warning', `UPDATE: Version mismatch, using ${mergeStrategy} strategy`);
  }

  // Check authority
  const authCheck = checkAuthority(ir, ctx, state);
  if (!authCheck.authorized) {
    throw new Error(`UPDATE: ${authCheck.reason}`);
  }

  // Apply patch
  const { op, kv } = patch;
  let writeCount = 0;

  for (const [key, value] of kv) {
    if (op === 'put') {
      effects.writes.push({
        stateId,
        key,
        value: Buffer.from(value, 'hex'),
        newVersion: crypto.randomBytes(32).toString('hex') // Simplified version update
      });
      writeCount++;
    } else if (op === 'del') {
      effects.writes.push({
        stateId,
        key,
        value: null,
        newVersion: crypto.randomBytes(32).toString('hex')
      });
      writeCount++;
    } else if (op === 'merge') {
      // Merge logic would go here
      throw new Error(`UPDATE: merge operation not yet implemented`);
    }
  }

  addLog(effects, 'info', `UPDATE: Updated state ${stateId}`, { op, writes: writeCount });
}

/**
 * SYS.SIGN - Record cross-chain signature
 * Args: { algo, message, signature, keyRef? }
 */
export async function handleSIGN(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { algo, message, signature, keyRef } = ir.args;

  // For now, just record the signature event
  // In a full implementation, we'd verify and store this
  addLog(effects, 'info', `SIGN: Signature recorded`, {
    algo,
    messageHash: crypto.createHash('sha256').update(message).digest().toString('hex').slice(0, 16),
    signatureLen: signature.length,
    keyRef
  });
}

/**
 * SYS.VERIFY - Pure verification gate
 * Args: { algo, message, signature, publicKeyBase64DER?, address? }
 */
export async function handleVERIFY(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { algo, message, signature, publicKeyBase64DER, address } = ir.args;

  if (!publicKeyBase64DER) {
    throw new Error('VERIFY: publicKeyBase64DER required');
  }

  // Parse algorithm
  let sigAlg: SigAlgId;
  if (algo === 'ed25519') {
    sigAlg = SigAlgId.ED25519;
  } else if (algo === 'secp256k1') {
    sigAlg = SigAlgId.SECP256K1;
  } else {
    throw new Error(`VERIFY: unsupported algorithm ${algo}`);
  }

  // Create public key object
  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.from(publicKeyBase64DER, 'base64'),
    format: 'der',
    type: 'spki'
  });

  // Verify signature
  const messageBuffer = Buffer.from(message, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  const valid = verifyPreimage(sigAlg, pubKeyObj, messageBuffer, signatureBuffer);

  if (!valid) {
    throw new Error('VERIFY: signature verification failed');
  }

  addLog(effects, 'info', `VERIFY: Signature verified`, { algo, address });
}

/**
 * SYS.RENT - Schedule storage payments (stub)
 * Args: { stateId, perBlock, duration, payFrom? }
 */
export async function handleRENT(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { stateId, perBlock, duration, payFrom } = ir.args;

  // Stub: just log the rent intent
  // Full implementation would:
  // 1. Validate payment source
  // 2. Lock funds
  // 3. Schedule rent collection
  addLog(effects, 'info', `RENT: Rent scheduled (stub)`, {
    stateId,
    perBlock,
    duration,
    payFrom: payFrom || ctx.txFrom
  });
}

/**
 * SYS.XVAL - External validation (stub with attestation path)
 * Args: { chain, kind, proof, checkpointRef?, attestors?, minQuorum? }
 */
export async function handleXVAL(
  ir: InstructionRecord,
  ctx: ExecutionContext,
  effects: ExecutionEffects
): Promise<void> {
  const { chain, kind, proof, checkpointRef, attestors, minQuorum } = ir.args;

  // Stub: simple attestation check
  // Full implementation would:
  // 1. Verify light client proofs
  // 2. Check XP-weighted attestations
  // 3. Validate against checkpoints

  if (attestors && minQuorum) {
    const attestorCount = attestors.length;
    if (attestorCount < minQuorum) {
      throw new Error(`XVAL: insufficient attestors (${attestorCount} < ${minQuorum})`);
    }
  }

  addLog(effects, 'info', `XVAL: External validation accepted (stub)`, {
    chain,
    kind,
    proofLen: proof?.length || 0,
    attestors: attestors?.length || 0
  });
}
