import Fastify from 'fastify';
import { preimageBasic, integrityHash, emptyPayloadHash } from '../tx/hash';
import { InMemoryAccounts } from '../accounts/store';
import { InMemoryUserIndex } from '../accounts/usernames';
import { decodeProgram } from '../instructions/abi';
import { decodeProgram as decodeProgramDSL } from '../instructions/decoder';
import { InMemoryINS } from '../registry/insStore';

export async function startExplorerService(
  port = 7003,
  accounts: InMemoryAccounts,
  users: InMemoryUserIndex,
  ins?: InMemoryINS
) {
  const app = Fastify();

  app.get('/account/:addr', async (req: any) => {
    const a = await accounts.get(req.params.addr);
    if (!a) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    const username = await users.getUsername(req.params.addr);
    return { ok: true, ...a, username, nonce: Number(a.nonce) };
  });

  app.post('/decode/tx/basic', async (req: any) => {
    try {
      const tx = req.body?.tx;
      const pre = preimageBasic(tx.from, BigInt(tx.nonce), tx.payloadHash);
      const ih = integrityHash(pre).toString('hex');
      const empty = emptyPayloadHash().toString('hex');
      return {
        preimageHex: pre.toString('hex'),
        integrityHashHex: ih,
        isPayloadEmptyHash: tx.payloadHash === empty,
        from: tx.from,
        nonce: tx.nonce
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  app.get('/username/:username', async (req: any) => {
    const address = await users.getAddress(req.params.username);
    if (!address) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    return { ok: true, address };
  });

  app.get('/address/:addr/username', async (req: any) => {
    const username = await users.getUsername(req.params.addr);
    if (!username) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    return { ok: true, username };
  });

  // M2: Decode IR program
  app.post('/decode/ir', async (req: any) => {
    try {
      const { programHex } = req.body || {};
      if (!programHex) {
        return { ok: false, error: 'programHex required' };
      }

      const programBytes = Buffer.from(programHex, 'hex');
      const irs = decodeProgram(programBytes);
      const dsls = decodeProgramDSL(irs);

      return {
        ok: true,
        instructions: dsls,
        count: dsls.length
      };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // M2: INS lookup
  app.get('/ins/:creator/:moduleId', async (req: any) => {
    if (!ins) {
      return { ok: false, error: 'INS not available' };
    }

    try {
      const { creator, moduleId } = req.params;
      const entry = await ins.resolve(creator, moduleId);
      if (!entry) {
        return { ok: false, code: 'NOT_FOUND' };
      }
      return { ok: true, entry };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // Capabilities endpoint
  app.get('/capabilities', async () => {
    return {
      service: 'explorer',
      version: '1.0.0',
      modules: ['account-viewer', 'tx-decoder', 'username-lookup', 'ins-lookup', 'ir-decoder'],
      endpoints: [
        { method: 'GET', path: '/account/:addr', description: 'Get account info with username' },
        { method: 'POST', path: '/decode/tx/basic', description: 'Decode BasicTx and compute hashes' },
        { method: 'GET', path: '/username/:username', description: 'Lookup address by username' },
        { method: 'GET', path: '/address/:addr/username', description: 'Lookup username by address' },
        { method: 'POST', path: '/decode/ir', description: 'Decode binary IR to JSON DSL' },
        { method: 'GET', path: '/ins/:creator/:moduleId', description: 'Lookup INS entry' }
      ]
    };
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[explorer] listening on ${port}`);
  return app;
}
