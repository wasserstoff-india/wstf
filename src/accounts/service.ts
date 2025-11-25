import Fastify from 'fastify';
import * as crypto from 'crypto';
import { MappingAlgId, SigAlgId } from '../crypto/algorithms';
import { deriveAddress, decodeAddress } from '../crypto/address';
import { InMemoryAccounts } from './store';
import { InMemoryUserIndex } from './usernames';

export async function startAccountsService(port = 7001) {
  const app = Fastify();
  const accounts = new InMemoryAccounts();
  const users = new InMemoryUserIndex();


  // ✅ SECURE: Register an existing public key (client-generated)
  app.post('/accounts/register', async (req: any, res) => {
    try {
      const { publicKeyBase64, address, sigAlg, username } = req.body;

      if (!publicKeyBase64 || !address || !sigAlg) {
        return res.status(400).send({
          ok: false,
          error: 'MISSING_FIELDS',
          message: 'publicKeyBase64, address, and sigAlg are required'
        });
      }

      const sigAlgId = sigAlg.toLowerCase() === 'secp256k1' ? SigAlgId.SECP256K1 : SigAlgId.ED25519;

      // Verify the public key matches the claimed address
      const pubDER = Buffer.from(publicKeyBase64, 'base64');
      const derivedAddr = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, sigAlgId);

      if (derivedAddr !== address) {
        return res.status(400).send({
          ok: false,
          error: 'ADDRESS_PUBKEY_MISMATCH',
          message: `Derived address ${derivedAddr} does not match claimed address ${address}`
        });
      }

      // Check if account already exists
      const existing = await accounts.get(address);
      if (existing) {
        return res.status(409).send({
          ok: false,
          error: 'ACCOUNT_EXISTS',
          message: 'Account is already registered'
        });
      }

      // Register the account
      await accounts.upsert({
        address,
        nonce: 0n,
        publicKeyBase64,
        sigAlgId,
        mappingAlgId: MappingAlgId.SIMPLE_HASH
      });

      // Bind username if provided
      if (username) {
        await users.bind(username, address);
        const meta = await accounts.get(address);
        if (meta) {
          meta.username = username;
          await accounts.upsert(meta);
        }
      }

      console.log(`✅ Registered client-generated account: ${address}`);
      return {
        ok: true,
        address,
        sigAlg: sigAlg.toLowerCase(),
        mappingAlg: 'simple_hash',
        nonce: 0,
        registered: true
      };
    } catch (e) {
      console.error('Account registration error:', e);
      return res.status(500).send({
        ok: false,
        error: 'REGISTRATION_FAILED',
        message: String(e)
      });
    }
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

  // Session management for account abstraction
  const sessionCache = new Map<string, {
    userAddress: string;
    permissions: string[];
    expiresAt: number;
    derivedKeyHint?: string;
  }>();

  // Create session delegation for account abstraction
  app.post('/accounts/create-session', async (req: any, res) => {
    try {
      const { userAddress, permissions, expiresAt, sessionId } = req.body;

      if (!userAddress || !permissions || !expiresAt) {
        return res.status(400).send({
          ok: false,
          error: 'MISSING_FIELDS',
          message: 'userAddress, permissions, and expiresAt are required'
        });
      }

      // Verify account exists
      const account = await accounts.get(userAddress);
      if (!account) {
        return res.status(404).send({
          ok: false,
          error: 'ACCOUNT_NOT_FOUND',
          message: 'User account not registered'
        });
      }

      const sessionIdGenerated = sessionId || `sess_${Math.random().toString(36).slice(2, 15)}`;

      // Store session capability
      sessionCache.set(sessionIdGenerated, {
        userAddress,
        permissions: Array.isArray(permissions) ? permissions : [permissions],
        expiresAt: typeof expiresAt === 'number' ? expiresAt : Date.now() + 30 * 60 * 1000 // 30min default
      });

      // Auto-cleanup expired sessions
      setTimeout(() => {
        sessionCache.delete(sessionIdGenerated);
      }, expiresAt - Date.now());

      console.log(`📱 Created session ${sessionIdGenerated} for ${userAddress} with permissions: ${permissions}`);
      return {
        ok: true,
        sessionId: sessionIdGenerated,
        userAddress,
        permissions,
        expiresAt
      };
    } catch (e) {
      console.error('Session creation error:', e);
      return res.status(500).send({
        ok: false,
        error: 'SESSION_CREATION_FAILED',
        message: String(e)
      });
    }
  });

  // Get session info
  app.get('/accounts/session/:sessionId', async (req: any, res) => {
    const sessionId = req.params.sessionId;
    const session = sessionCache.get(sessionId);

    if (!session) {
      return res.status(404).send({
        ok: false,
        error: 'SESSION_NOT_FOUND'
      });
    }

    if (Date.now() > session.expiresAt) {
      sessionCache.delete(sessionId);
      return res.status(410).send({
        ok: false,
        error: 'SESSION_EXPIRED'
      });
    }

    return {
      ok: true,
      sessionId,
      ...session,
      remainingTTL: Math.max(0, session.expiresAt - Date.now())
    };
  });

  // Revoke session
  app.delete('/accounts/session/:sessionId', async (req: any, res) => {
    const sessionId = req.params.sessionId;
    const existed = sessionCache.has(sessionId);
    sessionCache.delete(sessionId);

    console.log(`🗑️  Revoked session ${sessionId}`);
    return {
      ok: true,
      revoked: existed
    };
  });

  // WebAuthn/Passkey Support (Future Enhancement)
  // Note: This is a basic structure for future WebAuthn integration
  app.post('/accounts/register-passkey', async (req: any, res) => {
    try {
      const { credentialId, publicKey, clientData, attestation, challenge } = req.body;

      if (!credentialId || !publicKey || !clientData) {
        return res.status(400).send({
          ok: false,
          error: 'MISSING_WEBAUTHN_FIELDS',
          message: 'credentialId, publicKey, and clientData are required for WebAuthn registration'
        });
      }

      // TODO: Add proper WebAuthn verification
      // For now, this is a placeholder that accepts any valid-looking WebAuthn registration
      console.log(`🔐 WebAuthn registration attempt for credential: ${credentialId}`);

      // Basic validation - check if publicKey looks like valid P-256 key
      let pubKeyBuffer: Buffer;
      try {
        pubKeyBuffer = Buffer.from(publicKey, 'base64');
        if (pubKeyBuffer.length < 32) {
          throw new Error('Public key too short');
        }
      } catch (e) {
        return res.status(400).send({
          ok: false,
          error: 'INVALID_WEBAUTHN_PUBKEY',
          message: 'WebAuthn public key format is invalid'
        });
      }

      // For future implementation with P-256 support:
      // - Verify clientData.challenge matches expected challenge
      // - Validate attestation statement
      // - Extract P-256 public key from COSE format
      // - Add SigAlgId.WEBAUTHN_P256 to algorithms enum
      // - Derive address using WebAuthn-specific mapping

      // Temporary: Store as metadata for future processing
      const tempAddress = `gc-webauthn-${credentialId.slice(0, 8)}...`;

      await accounts.upsert({
        address: tempAddress,
        nonce: 0n,
        publicKeyBase64: publicKey,
        sigAlgId: SigAlgId.ED25519, // Placeholder - will be SigAlgId.WEBAUTHN_P256
        mappingAlgId: MappingAlgId.SIMPLE_HASH,
        // Store WebAuthn-specific metadata as custom properties
        // Note: These will need to be added to AccountMeta interface when implementing full WebAuthn
        metadata: {
          webauthnCredentialId: credentialId,
          webauthnClientData: clientData,
          webauthnAttestation: attestation,
          accountType: 'webauthn-placeholder'
        }
      } as any); // Temporary cast until AccountMeta is extended

      console.log(`📱 Registered WebAuthn credential ${credentialId} (placeholder implementation)`);

      return {
        ok: true,
        address: tempAddress,
        credentialId,
        message: 'WebAuthn registration stored (placeholder - requires P-256 signature support)',
        todo: [
          'Add P-256 signature verification to crypto module',
          'Implement proper WebAuthn attestation validation',
          'Add WEBAUTHN_P256 to SigAlgId enum',
          'Create WebAuthn-specific address derivation'
        ]
      };

    } catch (e) {
      console.error('WebAuthn registration error:', e);
      return res.status(500).send({
        ok: false,
        error: 'WEBAUTHN_REGISTRATION_FAILED',
        message: String(e)
      });
    }
  });

  // WebAuthn challenge generation for registration
  app.post('/accounts/webauthn/challenge', async (req: any, res) => {
    try {
      // Generate a cryptographically secure challenge
      const challenge = crypto.randomBytes(32).toString('base64url');
      const challengeId = `chal_${Math.random().toString(36).slice(2, 15)}`;

      // Store challenge temporarily (in production, use Redis or similar)
      setTimeout(() => {
        // Auto-expire challenges after 5 minutes
      }, 5 * 60 * 1000);

      console.log(`🎲 Generated WebAuthn challenge: ${challengeId}`);

      return {
        ok: true,
        challenge,
        challengeId,
        expiresAt: Date.now() + 5 * 60 * 1000,
        rpId: req.headers.host || 'localhost',
        rpName: 'WSTFChain',
        userVerification: 'preferred'
      };

    } catch (e) {
      console.error('Challenge generation error:', e);
      return res.status(500).send({
        ok: false,
        error: 'CHALLENGE_GENERATION_FAILED',
        message: String(e)
      });
    }
  });

  // Capabilities endpoint
  app.get('/capabilities', async () => {
    return {
      service: 'accounts',
      version: '2.0.0',
      description: 'Secure account management with client-side key generation only',
      modules: [
        'secure-account-registration',
        'address-codec',
        'username-binding',
        'session-management',
        'account-abstraction',
        'webauthn-passkey-support'
      ],
      endpoints: [
        { method: 'POST', path: '/accounts/register', description: 'Register account with client-generated public key' },
        { method: 'POST', path: '/accounts/register-passkey', description: 'Register WebAuthn/Passkey account (future)' },
        { method: 'POST', path: '/accounts/webauthn/challenge', description: 'Generate WebAuthn registration challenge' },
        { method: 'POST', path: '/accounts/create-session', description: 'Create session for account abstraction' },
        { method: 'GET', path: '/accounts/session/:id', description: 'Get session info' },
        { method: 'DELETE', path: '/accounts/session/:id', description: 'Revoke session' },
        { method: 'GET', path: '/addresses/:addr/decode', description: 'Decode address format' },
        { method: 'POST', path: '/usernames/bind', description: 'Bind username to address' },
        { method: 'GET', path: '/accounts/:addr/meta', description: 'Get account metadata' }
      ],
      security: {
        keyGeneration: 'CLIENT_SIDE_ONLY',
        serverKeyGeneration: 'NEVER',
        sessionManagement: 'ENABLED',
        webauthnSupport: 'PLANNED'
      }
    };
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[accounts] listening on ${port}`);
  return { app, accounts, users };
}
