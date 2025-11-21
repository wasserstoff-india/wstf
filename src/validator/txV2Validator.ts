import crypto from 'crypto';
import { TxV2, TX_V2_VERSION, preimageTxV2, integrityHashTxV2, computeReadsHash, computeLocksHash } from '../tx/v2';
import { decodeAddress, publicKeyMatchesAddress } from '../crypto/address';
import { verifyPreimage } from '../crypto/sign';
import { computeInstructionsHash } from '../instructions/abi';
import { executeProgram } from '../executor/engine';
import { ExecutionContext, ExecutionEffects, StateData } from '../executor/types';

export interface TxV2ValidationContext {
  getAccountState(address: string): Promise<{ nonce: bigint; publicKey?: string; sigAlgId?: number } | undefined>;
  getState(stateId: string): Promise<StateData | undefined>;
  currentBlockHeight?: bigint;
}

export async function validateTxV2(
  tx: TxV2,
  ctx: TxV2ValidationContext
): Promise<{ ok: true; effects: ExecutionEffects } | { ok: false; code: string; message: string }> {
  // Step 1: Basic validation
  if (tx.version !== TX_V2_VERSION) {
    return fail('BAD_VERSION', `Expected ${TX_V2_VERSION}, got ${tx.version}`);
  }

  // Decode address
  try {
    decodeAddress(tx.from);
  } catch (e) {
    return fail('BAD_ADDRESS', String(e));
  }

  // Step 2: Get account state
  const acc = await ctx.getAccountState(tx.from);
  if (!acc) {
    return fail('UNKNOWN_ACCOUNT');
  }

  if (tx.nonce !== acc.nonce + 1n) {
    return fail('BAD_NONCE', `Expected ${acc.nonce + 1n}, got ${tx.nonce}`);
  }

  // Step 3: Verify instructions hash
  const programBytes = Buffer.from(tx.programHex, 'hex');
  const expectedInstrHash = computeInstructionsHash(programBytes).toString('hex');
  if (tx.instructionsHash !== expectedInstrHash) {
    return fail('BAD_INSTRUCTIONS_HASH');
  }

  // Step 4: Verify reads hash
  const expectedReadsHash = computeReadsHash(tx.reads);
  if (tx.readsHash !== expectedReadsHash) {
    return fail('BAD_READS_HASH');
  }

  // Step 5: Verify locks hash
  const expectedLocksHash = computeLocksHash(tx.locks);
  if (tx.locksHash !== expectedLocksHash) {
    return fail('BAD_LOCKS_HASH');
  }

  // Step 6: Verify integrity hash
  const preimage = preimageTxV2(
    tx.from,
    tx.nonce,
    tx.instructionsHash,
    tx.readsHash,
    tx.locksHash
  );
  const expectedIntegrity = integrityHashTxV2(preimage).toString('hex');
  if (tx.integrityHash !== expectedIntegrity) {
    return fail('BAD_INTEGRITY_HASH');
  }

  // Step 7: Verify signature
  const pubDERb64 = acc.publicKey ?? tx.publicKey;
  if (!pubDERb64) {
    return fail('NO_PUBKEY');
  }

  const pub = crypto.createPublicKey({
    key: Buffer.from(pubDERb64, 'base64'),
    format: 'der',
    type: 'spki'
  });

  if (!publicKeyMatchesAddress(pub, tx.from)) {
    return fail('ADDR_PUBKEY_MISMATCH');
  }

  const sig = Buffer.from(tx.signature, 'hex');
  const sigAlgId = acc.sigAlgId ?? decodeAddress(tx.from).sigAlg;
  const sigValid = verifyPreimage(sigAlgId as any, pub, preimage, sig);
  if (!sigValid) {
    return fail('BAD_SIGNATURE');
  }

  // Step 8: Execute program
  const execCtx: ExecutionContext = {
    txFrom: tx.from,
    program: programBytes,
    reads: tx.reads,
    locks: tx.locks,
    getState: ctx.getState,
    currentBlockHeight: ctx.currentBlockHeight
  };

  const effects = await executeProgram(execCtx);

  if (!effects.success) {
    return fail('EXECUTION_FAILED', effects.error || 'Unknown execution error');
  }

  return { ok: true, effects };
}

function fail(code: string, message: string = code): { ok: false; code: string; message: string } {
  return { ok: false as const, code, message };
}
