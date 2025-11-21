import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeypair, exportPubDER } from '../../src/crypto/keys';
import { SigAlgId, MappingAlgId } from '../../src/crypto/algorithms';
import { deriveAddress } from '../../src/crypto/address';
import { compileProgram } from '../../src/instructions/compiler';
import { encodeProgram } from '../../src/instructions/abi';
import { registerSystemModules } from '../../src/executor/modules/registry';
import { executeProgram } from '../../src/executor/engine';
import { ExecutionContext, StateData } from '../../src/executor/types';
import crypto from 'crypto';

describe('Determinism: Two-Node Differential', () => {
  beforeEach(() => {
    // Ensure system modules are registered
    registerSystemModules();
  });

  it('Two nodes produce identical effects for same program', async () => {
    // Create test account
    const kp = generateKeypair(SigAlgId.ED25519);
    const pubDER = exportPubDER(kp.publicKey);
    const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    // Create a program
    const stateId = crypto.randomBytes(32).toString('hex');
    const program = compileProgram([
      {
        creator: 'sys',
        moduleId: 'SYS',
        method: 'REG',
        args: { stateId, type: 'test', owner: address }
      },
      {
        creator: 'sys',
        moduleId: 'SYS',
        method: 'INIT',
        args: {
          stateId,
          expectedVersion: '0'.repeat(64),
          data: { key1: 'value1', key2: 'value2' }
        }
      }
    ]);

    const programBytes = encodeProgram(program);

    // Node A
    const stateStoreA = new Map<string, StateData>();
    const ctxA: ExecutionContext = {
      txFrom: address,
      program: programBytes,
      reads: [],
      locks: [],
      getState: async (id) => stateStoreA.get(id)
    };

    // Node B
    const stateStoreB = new Map<string, StateData>();
    const ctxB: ExecutionContext = {
      txFrom: address,
      program: programBytes,
      reads: [],
      locks: [],
      getState: async (id) => stateStoreB.get(id)
    };

    // Execute on both nodes
    const effectsA = await executeProgram(ctxA);
    const effectsB = await executeProgram(ctxB);

    // Both should succeed
    expect(effectsA.success).toBe(true);
    expect(effectsB.success).toBe(true);

    // Effects should be identical
    expect(effectsA.writes.length).toBe(effectsB.writes.length);
    expect(effectsA.logs.length).toBe(effectsB.logs.length);

    // Check each write is identical
    for (let i = 0; i < effectsA.writes.length; i++) {
      expect(effectsA.writes[i].stateId).toBe(effectsB.writes[i].stateId);
      expect(effectsA.writes[i].key).toBe(effectsB.writes[i].key);
      if (effectsA.writes[i].value && effectsB.writes[i].value) {
        expect(effectsA.writes[i].value!.equals(effectsB.writes[i].value!)).toBe(true);
      }
    }

    // Check logs have same messages
    for (let i = 0; i < effectsA.logs.length; i++) {
      expect(effectsA.logs[i].level).toBe(effectsB.logs[i].level);
      expect(effectsA.logs[i].message).toBe(effectsB.logs[i].message);
    }
  });

  it('10 identical executions produce same result', async () => {
    const kp = generateKeypair(SigAlgId.ED25519);
    const pubDER = exportPubDER(kp.publicKey);
    const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    const stateId = '1111111111111111111111111111111111111111111111111111111111111111';
    const program = compileProgram([
      {
        creator: 'sys',
        moduleId: 'SYS',
        method: 'REG',
        args: { stateId, type: 'deterministic', owner: address }
      }
    ]);

    const programBytes = encodeProgram(program);

    // Run 10 times
    const allEffects = [];
    for (let i = 0; i < 10; i++) {
      const stateStore = new Map<string, StateData>();
      const ctx: ExecutionContext = {
        txFrom: address,
        program: programBytes,
        reads: [],
        locks: [],
        getState: async (id) => stateStore.get(id)
      };

      const effects = await executeProgram(ctx);
      allEffects.push(effects);
    }

    // All should have same success status
    const firstSuccess = allEffects[0].success;
    for (const effects of allEffects) {
      expect(effects.success).toBe(firstSuccess);
      expect(effects.writes.length).toBe(allEffects[0].writes.length);
      expect(effects.logs.length).toBe(allEffects[0].logs.length);
    }
  });
});
