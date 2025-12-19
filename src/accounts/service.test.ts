/**
 * Secure Accounts Service Tests
 *
 * Tests the new secure account registration architecture without server-side key generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { startAccountsService } from './service';
import { generatePaperWallet, createSigner } from '../sdk/core/signer';
import { SigAlg } from '../sdk/core/types';

describe('Secure Accounts Service', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    const port = 7000 + Math.floor(Math.random() * 1000);
    const { app: serviceApp } = await startAccountsService(port);
    app = serviceApp;
    serverUrl = `http://localhost:${port}`;
    closeServer = () => serviceApp.close();
  });

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  describe('POST /accounts/register - Secure Registration', () => {
    it('should register account with client-generated Ed25519 key', async () => {
      // Generate key client-side
      const signer = createSigner(SigAlg.ED25519);
      const publicKeyBase64 = Buffer.from(signer.getPublicKeyDER()).toString('base64');

      const response = await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: signer.address,
          publicKeyBase64,
          sigAlg: 'ed25519',
          username: 'testuser'
        })
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.address).toBe(signer.address);
      expect(result.sigAlg).toBe('ed25519');
      expect(result.registered).toBe(true);
    });

    it('should register account with client-generated secp256k1 key', async () => {
      const signer = createSigner(SigAlg.SECP256K1);
      const publicKeyBase64 = Buffer.from(signer.getPublicKeyDER()).toString('base64');

      const response = await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: signer.address,
          publicKeyBase64,
          sigAlg: 'secp256k1'
        })
      });

      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.sigAlg).toBe('secp256k1');
    });

    it('should reject registration with missing fields', async () => {
      const response = await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: 'gc123...',
          // missing publicKeyBase64 and sigAlg
        })
      });

      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('MISSING_FIELDS');
    });

    it('should reject registration with mismatched address and public key', async () => {
      const signer1 = createSigner(SigAlg.ED25519);
      const signer2 = createSigner(SigAlg.ED25519);

      // Use signer1's address but signer2's public key
      const response = await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: signer1.address,
          publicKeyBase64: Buffer.from(signer2.getPublicKeyDER()).toString('base64'),
          sigAlg: 'ed25519'
        })
      });

      const result = await response.json() as any;

      expect(response.status).toBe(400);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('ADDRESS_PUBKEY_MISMATCH');
    });

    it('should reject duplicate registration', async () => {
      const signer = createSigner(SigAlg.ED25519);
      const publicKeyBase64 = Buffer.from(signer.getPublicKeyDER()).toString('base64');

      const payload = {
        address: signer.address,
        publicKeyBase64,
        sigAlg: 'ed25519'
      };

      // Register once
      await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Try to register again
      const response = await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json() as any;

      expect(response.status).toBe(409);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('ACCOUNT_EXISTS');
    });
  });

  describe('Session Management', () => {
    let testSigner: ReturnType<typeof createSigner>;

    beforeEach(async () => {
      // Register a test account
      testSigner = createSigner(SigAlg.ED25519);
      const publicKeyBase64 = Buffer.from(testSigner.getPublicKeyDER()).toString('base64');

      await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: testSigner.address,
          publicKeyBase64,
          sigAlg: 'ed25519'
        })
      });
    });

    it('should create session for account abstraction', async () => {
      const response = await fetch(`${serverUrl}/accounts/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: testSigner.address,
          permissions: ['MKT_BUY', 'VAR_SET:trading.*'],
          expiresAt: Date.now() + 30 * 60 * 1000 // 30 minutes
        })
      });

      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.userAddress).toBe(testSigner.address);
      expect(result.permissions).toEqual(['MKT_BUY', 'VAR_SET:trading.*']);
    });

    it('should get session info', async () => {
      // Create session
      const createResponse = await fetch(`${serverUrl}/accounts/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: testSigner.address,
          permissions: ['READ'],
          expiresAt: Date.now() + 30 * 60 * 1000
        })
      });
      const sessionData = await createResponse.json();

      // Get session info
      const response = await fetch(`${serverUrl}/accounts/session/${sessionData.sessionId}`);
      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.sessionId).toBe(sessionData.sessionId);
      expect(result.userAddress).toBe(testSigner.address);
      expect(result.remainingTTL).toBeGreaterThan(0);
    });

    it('should revoke session', async () => {
      // Create session
      const createResponse = await fetch(`${serverUrl}/accounts/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: testSigner.address,
          permissions: ['READ'],
          expiresAt: Date.now() + 30 * 60 * 1000
        })
      });
      const sessionData = await createResponse.json();

      // Revoke session
      const response = await fetch(`${serverUrl}/accounts/session/${sessionData.sessionId}`, {
        method: 'DELETE'
      });
      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.revoked).toBe(true);

      // Verify session is gone
      const getResponse = await fetch(`${serverUrl}/accounts/session/${sessionData.sessionId}`);
      expect(getResponse.status).toBe(404);
    });

    it('should reject session creation for non-existent account', async () => {
      const response = await fetch(`${serverUrl}/accounts/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: 'gc-nonexistent',
          permissions: ['READ'],
          expiresAt: Date.now() + 30 * 60 * 1000
        })
      });

      const result = await response.json() as any;

      expect(response.status).toBe(404);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('ACCOUNT_NOT_FOUND');
    });
  });

  describe('WebAuthn/Passkey Support (Placeholder)', () => {
    it('should generate WebAuthn registration challenge', async () => {
      const response = await fetch(`${serverUrl}/accounts/webauthn/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.challenge).toBeDefined();
      expect(result.challengeId).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.rpName).toBe('WSTFChain');
    });

    it('should accept WebAuthn registration (placeholder)', async () => {
      const mockWebAuthnData = {
        credentialId: 'mock_credential_id',
        publicKey: 'YmFzZTY0X21vY2tfY29udGVudF9hdF9sZWFzdF8zMl9ieXRlc19mb3JfdmFsaWRhdGlvbg==', // base64 encoded mock > 32 bytes
        clientData: '{"type":"webauthn.create","challenge":"mock_challenge"}',
        attestation: 'mock_attestation'
      };

      const response = await fetch(`${serverUrl}/accounts/register-passkey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockWebAuthnData)
      });

      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.credentialId).toBe(mockWebAuthnData.credentialId);
      expect(result.message).toContain('placeholder');
      expect(result.todo).toBeDefined(); // List of required implementations
    });
  });

  describe('Service Capabilities', () => {
    it('should expose secure service capabilities', async () => {
      const response = await fetch(`${serverUrl}/capabilities`);
      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.service).toBe('accounts');
      expect(result.version).toBe('2.0.0');
      expect(result.modules).toContain('secure-account-registration');
      expect(result.modules).toContain('session-management');
      expect(result.modules).toContain('webauthn-passkey-support');
      expect(result.security.keyGeneration).toBe('CLIENT_SIDE_ONLY');
      expect(result.security.serverKeyGeneration).toBe('NEVER');
    });

    it('should list all secure endpoints', async () => {
      const response = await fetch(`${serverUrl}/capabilities`);
      const result = await response.json() as any;

      const endpointPaths = result.endpoints.map((ep: any) => ep.path);
      expect(endpointPaths).toContain('/accounts/register');
      expect(endpointPaths).toContain('/accounts/register-passkey');
      expect(endpointPaths).toContain('/accounts/create-session');
      expect(endpointPaths).toContain('/accounts/session/:id');
      expect(endpointPaths).toContain('/accounts/webauthn/challenge');

      // Ensure no insecure endpoints
      expect(endpointPaths).not.toContain('/accounts/dev-keygen');
      expect(endpointPaths).not.toContain('/accounts'); // old endpoint
    });
  });

  describe('Integration with Paper Wallets', () => {
    it('should register paper wallet generated with enhanced entropy', async () => {
      // Generate paper wallet using enhanced entropy
      const paperWallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useEnhancedEntropy: true,
        useMultiplicationMethod: true
      });

      expect(paperWallet.entropy.method).toBe('enhanced-multiplication');
      expect(paperWallet.entropy.totalBits).toBe(512); // Two 256-bit multiplied

      // Register the paper wallet
      const response = await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: paperWallet.address,
          publicKeyBase64: paperWallet.publicKey,
          sigAlg: paperWallet.sigAlg,
          username: 'paperwallet1'
        })
      });

      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.address).toBe(paperWallet.address);
    });

    it('should register paper wallet with secp256k1 algorithm', async () => {
      const paperWallet = generatePaperWallet({
        sigAlg: SigAlg.SECP256K1,
        useMultiplicationMethod: true
      });

      const response = await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: paperWallet.address,
          publicKeyBase64: paperWallet.publicKey,
          sigAlg: paperWallet.sigAlg
        })
      });

      const result = await response.json() as any;
      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
    });
  });

  describe('Security Enforcement', () => {
    it('should have no insecure key generation endpoints', async () => {
      // Ensure old insecure endpoints are removed
      const insecureEndpoints = [
        '/accounts',
        '/accounts/dev-keygen',
        '/accounts/generate-keys'
      ];

      for (const endpoint of insecureEndpoints) {
        const response = await fetch(`${serverUrl}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sigAlg: 'ed25519' })
        });

        // Should either be 404 (not found) or explicitly reject
        expect([404, 400].includes(response.status)).toBe(true);
      }
    });

    it('should enforce client-side only key generation', async () => {
      // Verify no endpoint can return private keys
      const endpoints = [
        '/accounts/register',
        '/accounts/register-passkey',
        '/capabilities'
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`${serverUrl}${endpoint}`, {
          method: endpoint === '/capabilities' ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: endpoint !== '/capabilities' ? JSON.stringify({
            address: 'test',
            publicKeyBase64: 'test',
            sigAlg: 'ed25519'
          }) : undefined
        });

        const result = await response.json() as any;

        // Ensure no private key data in any response
        const responseText = JSON.stringify(result);
        expect(responseText).not.toMatch(/privateKey/i);
        expect(responseText).not.toMatch(/-----BEGIN/); // PEM format
        expect(responseText).not.toMatch(/mnemonic/i);
        expect(responseText).not.toMatch(/seed/i);
      }
    });

    it('should demonstrate proper client-server separation', async () => {
      // This test demonstrates the correct pattern: client generates, server registers
      const clientSigner = createSigner(SigAlg.ED25519);

      // Client has private key (server never sees this)
      const privateKeyPEM = (clientSigner as any).exportPrivateKey('pem');
      expect(privateKeyPEM).toContain('-----BEGIN PRIVATE KEY-----');

      // Server only sees public key and address
      const publicKeyBase64 = Buffer.from(clientSigner.getPublicKeyDER()).toString('base64');

      const response = await fetch(`${serverUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: clientSigner.address,
          publicKeyBase64,
          sigAlg: 'ed25519'
        })
      });

      const result = await response.json() as any;

      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      // Server confirms registration but never returns private key data
      expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');
    });
  });
});