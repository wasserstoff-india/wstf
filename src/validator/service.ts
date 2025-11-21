import Fastify from 'fastify';
import { validateBasicTx } from './basicValidator';
import { validateTxV2 } from './txV2Validator';
import { InMemoryAccounts } from '../accounts/store';
import { StateData } from '../executor/types';

// Simple in-memory state store for M2
const stateStore = new Map<string, StateData>();

export async function startValidatorService(port = 7002, accounts: InMemoryAccounts) {
  const app = Fastify();
  const ctx = {
    getAccountState: async (addr: string) => {
      const a = await accounts.get(addr);
      if (!a) return undefined;
      return {
        nonce: a.nonce,
        publicKey: a.publicKeyBase64,
        sigAlgId: a.sigAlgId
      };
    }
  };

  const v2Ctx = {
    ...ctx,
    getState: async (stateId: string) => {
      return stateStore.get(stateId);
    }
  };

  app.post('/validate/basic', async (req: any) => {
    const result = await validateBasicTx(req.body?.tx, ctx);
    return result;
  });

  app.post('/validate/tx2', async (req: any) => {
    const result = await validateTxV2(req.body?.tx, v2Ctx);
    return result;
  });

  // Capabilities endpoint
  app.get('/capabilities', async () => {
    return {
      service: 'validator',
      version: '1.0.0',
      modules: ['tx:v1', 'tx:v2', 'sys:REG', 'sys:INIT', 'sys:UPDATE', 'sys:SIGN', 'sys:VERIFY', 'sys:RENT', 'sys:XVAL'],
      endpoints: [
        { method: 'POST', path: '/validate/basic', description: 'Validate BasicTx (v1)' },
        { method: 'POST', path: '/validate/tx2', description: 'Validate ProgramTx (v2)' }
      ],
      policies: {
        maxProgramBytes: 262144,
        maxInstructionsPerTx: 128
      }
    };
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[validator] listening on ${port}`);
  return { app, stateStore };
}
