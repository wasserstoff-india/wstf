import Fastify from 'fastify';
import { MappingAlgId, SigAlgId } from '../crypto/algorithms';
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { deriveAddress, decodeAddress } from '../crypto/address';
import { InMemoryAccounts } from './store';
import { InMemoryUserIndex } from './usernames';

export async function startAccountsService(port = 7001) {
  const app = Fastify();
  const accounts = new InMemoryAccounts();
  const users = new InMemoryUserIndex();

  app.post('/accounts', async (req: any, res) => {
    const sigAlg = (req.body?.sigAlg ?? 'ed25519').toLowerCase();
    const sigAlgId = sigAlg === 'secp256k1' ? SigAlgId.SECP256K1 : SigAlgId.ED25519;
    const kp = generateKeypair(sigAlgId);
    const pubDER = exportPubDER(kp.publicKey);
    const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, sigAlgId);

    await accounts.upsert({
      address,
      nonce: 0n,
      publicKeyBase64: pubDER.toString('base64'),
      sigAlgId,
      mappingAlgId: MappingAlgId.SIMPLE_HASH
    });

    if (req.body?.username) {
      await users.bind(req.body.username, address);
    }

    return {
      address,
      publicKeyBase64: pubDER.toString('base64'),
      sigAlg,
      mappingAlg: 'simple_hash',
      nonce: 0
    };
  });

  app.get('/addresses/:addr/decode', async (req: any) => {
    try {
      const d = decodeAddress(req.params.addr);
      return {
        mappingAlgId: d.mappingAlg,
        sigAlgId: d.sigAlg,
        pkHashHex: d.pkHash.toString('hex')
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  app.post('/usernames/bind', async (req: any, res) => {
    try {
      const { username, address } = req.body || {};
      await users.bind(username, address);
      const meta = await accounts.get(address);
      if (meta) {
        meta.username = username;
        await accounts.upsert(meta);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  app.get('/accounts/:addr/meta', async (req: any) => {
    const a = await accounts.get(req.params.addr);
    if (!a) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    return { ok: true, ...a, nonce: Number(a.nonce) };
  });

  // Capabilities endpoint
  app.get('/capabilities', async () => {
    return {
      service: 'accounts',
      version: '1.0.0',
      modules: ['account-creation', 'address-codec', 'username-binding'],
      endpoints: [
        { method: 'POST', path: '/accounts', description: 'Create new account with keypair' },
        { method: 'GET', path: '/addresses/:addr/decode', description: 'Decode address format' },
        { method: 'POST', path: '/usernames/bind', description: 'Bind username to address' },
        { method: 'GET', path: '/accounts/:addr/meta', description: 'Get account metadata' }
      ]
    };
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[accounts] listening on ${port}`);
  return { app, accounts, users };
}
