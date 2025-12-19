import Fastify from 'fastify';
import { validateBasicTx } from './basicValidator';
import { validateTxV2 } from './txV2Validator';
import { InMemoryAccounts } from '../accounts/store';
import { StateData } from '../executor/types';
import { globalDns } from '../rpc/dns-resolver';

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
    const tx = req.body?.tx;
    const result = await validateBasicTx(tx, ctx);

    if (result.ok && tx.methodId !== undefined && tx.to !== undefined) {
      // Perform relay if and only if valid and targets a username/dns
      const dns = globalDns.resolve(tx.to);
      if (dns) {
        try {
          // Relay the transaction to the target RPC
          // In a real system, this would be authenticated and async
          await fetch(dns.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tx })
          });
          console.log(`[validator] relayed tx to ${tx.to} at ${dns.endpoint}`);
        } catch (e) {
          console.error(`[validator] failed to relay to ${tx.to}:`, e);
          // We still return ok:true for validation, but log the relay failure
        }
      }
    }

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
