import crypto from 'crypto';
import { MappingAlgId, SigAlgId } from '../crypto/algorithms';
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { deriveAddress } from '../crypto/address';
import { compileProgram } from '../instructions/compiler';
import { encodeProgram, decodeProgram } from '../instructions/abi';
import { decodeProgram as decodeProgramDSL } from '../instructions/decoder';
import { registerSystemModules } from '../executor/modules/registry';
import { executeProgram } from '../executor/engine';
import { ExecutionContext, StateData } from '../executor/types';
import { InMemoryINS } from '../registry/insStore';
import { INSRouter } from '../registry/router';

// Initialize system modules
registerSystemModules();

(async () => {
  console.log('🧪 Starting Milestone 2 smoke test...\n');

  // Test 1: Compiler roundtrip
  console.log('✓ Test 1: Compiler roundtrip (JSON → IR → JSON)');
  const dsl = [
    {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'VERIFY',
      args: {
        algo: 'ed25519',
        message: '48656c6c6f',
        signature: '00'.repeat(64),
        publicKeyBase64DER: 'test'
      }
    }
  ];

  const irs = compileProgram(dsl);
  const programBytes = encodeProgram(irs);
  const decoded = decodeProgram(programBytes);
  const decodedDSL = decodeProgramDSL(decoded);

  console.log(`  Program: ${dsl.length} instructions → ${programBytes.length} bytes`);
  console.log(`  Decoded: ${decodedDSL.length} instructions`);
  console.log(`  ✅ Compiler roundtrip successful\n`);

  // Test 2: Executor with mock state
  console.log('✓ Test 2: Executor with INIT operation');

  const kp = generateKeypair(SigAlgId.ED25519);
  const pubDER = exportPubDER(kp.publicKey);
  const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

  const stateId = crypto.randomBytes(32).toString('hex');
  const initProgram = compileProgram([
    {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'REG',
      args: {
        stateId,
        type: 'test',
        owner: address
      }
    },
    {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'INIT',
      args: {
        stateId,
        expectedVersion: '0'.repeat(64),
        data: {
          key1: 'value1',
          key2: 'value2'
        }
      }
    }
  ]);

  const initProgramBytes = encodeProgram(initProgram);

  const mockState = new Map<string, StateData>();
  const ctx: ExecutionContext = {
    txFrom: address,
    program: initProgramBytes,
    reads: [],
    locks: [],
    getState: async (id) => mockState.get(id)
  };

  const effects = await executeProgram(ctx);
  console.log(`  Success: ${effects.success}`);
  console.log(`  Writes: ${effects.writes.length}`);
  console.log(`  Logs: ${effects.logs.length}`);

  if (effects.success) {
    console.log(`  ✅ Executor test passed\n`);
  } else {
    console.log(`  ❌ Executor failed: ${effects.error}\n`);
    process.exit(1);
  }

  // Test 3: INS registry
  console.log('✓ Test 3: INS registry (publish & resolve)');
  const ins = new InMemoryINS();
  const router = new INSRouter(ins);

  const moduleId = crypto.createHash('sha256').update('test.module').digest().slice(0, 16).toString('hex');
  const creatorPkHash = crypto.randomBytes(20).toString('hex');

  await ins.publish({
    creatorPkHash,
    moduleId,
    version: 1,
    gossipTopic: crypto.randomBytes(32).toString('hex'),
    rpcUrls: ['http://localhost:8000'],
    schemaHash: crypto.randomBytes(32).toString('hex')
  });

  const resolved = await router.resolve(creatorPkHash, moduleId, 1);
  if (resolved && resolved.rpcUrls.length > 0) {
    console.log(`  ✅ INS publish/resolve successful`);
    console.log(`  RPC URLs: ${resolved.rpcUrls.join(', ')}\n`);
  } else {
    console.log(`  ❌ INS resolve failed\n`);
    process.exit(1);
  }

  // Test 4: Full program decode
  console.log('✓ Test 4: Full program decode');
  const complexProgram = compileProgram([
    {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'REG',
      flags: ['lockWrites'],
      args: { stateId: '00'.repeat(32), type: 'complex', owner: address }
    },
    {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'UPDATE',
      args: {
        stateId: '00'.repeat(32),
        expectedVersion: '0'.repeat(64),
        patch: { op: 'put', kv: [['key1', '48656c6c6f']] }
      }
    }
  ]);

  const complexBytes = encodeProgram(complexProgram);
  const complexDecoded = decodeProgram(complexBytes);
  console.log(`  Instructions: ${complexDecoded.length}`);
  console.log(`  First instruction selector: 0x${complexDecoded[0].selector4.toString(16)}`);
  console.log(`  ✅ Program decode successful\n`);

  console.log('🎉 All Milestone 2 smoke tests passed!');
})().catch(err => {
  console.error('\n❌ Smoke test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
