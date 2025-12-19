/**
 * Secure Wallet Flow Integration Tests
 *
 * End-to-end tests demonstrating the complete secure wallet workflow:
 * 1. Client-side key generation
 * 2. Account registration
 * 3. Session management
 * 4. Transaction signing
 * 5. Paper wallet integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startAccountsService } from '../accounts/service';
import {
  createSigner,
  generatePaperWallet,
  generatePaperWalletBatch,
  buildAuthToken,
  parseAuthToken,
  type Signer
} from '../sdk/core/signer';
import { SigAlg } from '../sdk/core/types';
import { FastifyInstance } from 'fastify';

describe('Secure Wallet Flow Integration', () => {
  let accountsService: {
    app: FastifyInstance;
    accounts: any;
    users: any;
  };
  let serviceUrl: string;

  beforeEach(async () => {
    const port = 7000 + Math.floor(Math.random() * 1000);
    accountsService = await startAccountsService(port);
    serviceUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (accountsService?.app) {
      await accountsService.app.close();
    }
  });

  describe('Complete Secure Workflow', () => {
    it('should demonstrate end-to-end secure wallet usage', async () => {
      // 🔐 Step 1: Client-side key generation (never touches server)
      console.log('🔐 Generating client-side wallet...');
      const clientSigner = createSigner(SigAlg.ED25519);
      const publicKeyBase64 = Buffer.from(clientSigner.getPublicKeyDER()).toString('base64');

      console.log(`   Address: ${clientSigner.address}`);
      console.log(`   Algorithm: ${clientSigner.sigAlg}`);

      // ✅ Step 2: Register public key with accounts service
      console.log('✅ Registering account with public key only...');
      const registerResponse = await fetch(`${serviceUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: clientSigner.address,
          publicKeyBase64,
          sigAlg: 'ed25519',
          username: 'integration-test-user'
        })
      });

      const registerResult = await registerResponse.json() as any;
      expect(registerResult.ok).toBe(true);
      expect(registerResult.registered).toBe(true);
      console.log(`   ✅ Registered: ${registerResult.address}`);

      // 🎫 Step 3: Create WSTFAuth token
      console.log('🎫 Creating WSTFAuth token...');
      const authToken = buildAuthToken(clientSigner)
        .audience('wstfchain-integration-test')
        .scopes('read', 'write', 'execute')
        .ttl(3600)
        .jti()
        .claim('environment', 'test')
        .sign(clientSigner);

      expect(authToken).toBeTruthy();
      console.log(`   Token: ${authToken.slice(0, 50)}...`);

      // Verify token content
      const parsedToken = parseAuthToken(authToken);
      expect(parsedToken?.sub).toBe(clientSigner.address);
      expect(parsedToken?.aud).toBe('wstfchain-integration-test');
      expect(parsedToken?.scp).toContain('read');

      // 📱 Step 4: Create session for account abstraction
      console.log('📱 Creating session for account abstraction...');
      const sessionResponse = await fetch(`${serviceUrl}/accounts/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: clientSigner.address,
          permissions: ['MKT_BUY', 'MKT_SELL', 'VAR_SET:trading.*'],
          expiresAt: Date.now() + 30 * 60 * 1000
        })
      });

      const sessionResult = await sessionResponse.json() as any;
      expect(sessionResult.ok).toBe(true);
      expect(sessionResult.sessionId).toBeDefined();
      console.log(`   Session ID: ${sessionResult.sessionId}`);

      // ✍️ Step 5: Demonstrate transaction signing
      console.log('✍️ Signing test transaction...');
      const testTxData = {
        from: clientSigner.address,
        to: 'gc-recipient',
        amount: '100.0',
        timestamp: Date.now()
      };

      const txBytes = new TextEncoder().encode(JSON.stringify(testTxData));
      const signature = await clientSigner.sign(txBytes);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBeGreaterThan(0);
      console.log(`   Signature: ${Buffer.from(signature).toString('hex').slice(0, 32)}...`);

      // 🔍 Step 6: Verify session is accessible
      console.log('🔍 Verifying session access...');
      const sessionInfoResponse = await fetch(`${serviceUrl}/accounts/session/${sessionResult.sessionId}`);
      const sessionInfo = await sessionInfoResponse.json() as any;

      expect(sessionInfo.ok).toBe(true);
      expect(sessionInfo.userAddress).toBe(clientSigner.address);
      expect(sessionInfo.permissions).toContain('MKT_BUY');
      console.log(`   Session TTL: ${sessionInfo.remainingTTL}ms`);

      console.log('🎉 Complete secure workflow successful!');
    });

    it('should handle paper wallet integration workflow', async () => {
      // 🧻 Step 1: Generate paper wallet with enhanced entropy
      console.log('🧻 Generating paper wallet with enhanced entropy...');
      const paperWallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useEnhancedEntropy: true,
        useMultiplicationMethod: true
      });

      expect(paperWallet.entropy.method).toBe('enhanced-multiplication');
      expect(paperWallet.entropy.totalBits).toBe(512);
      console.log(`   Address: ${paperWallet.address}`);
      console.log(`   Entropy: ${paperWallet.entropy.totalBits} bits from ${paperWallet.entropy.sources.join(', ')}`);

      // 📋 Step 2: Register paper wallet
      console.log('📋 Registering paper wallet...');
      const response = await fetch(`${serviceUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: paperWallet.address,
          publicKeyBase64: paperWallet.publicKey,
          sigAlg: paperWallet.sigAlg,
          username: 'paper-wallet-test'
        })
      });

      const result = await response.json() as any;
      expect(result.ok).toBe(true);
      console.log(`   ✅ Registered paper wallet: ${result.address}`);

      // 🔐 Step 3: Use paper wallet for signing
      console.log('🔐 Using paper wallet for signing...');
      const testData = new TextEncoder().encode('Paper wallet test message');
      const signature = await paperWallet.signer.sign(testData);

      expect(signature).toBeInstanceOf(Uint8Array);
      console.log(`   Signature: ${Buffer.from(signature).toString('hex').slice(0, 32)}...`);

      // 🎫 Step 4: Create auth token with paper wallet
      const authToken = paperWallet.signer.createAuthToken('paper-wallet-test');
      const parsedToken = parseAuthToken(authToken);

      expect(parsedToken?.sub).toBe(paperWallet.address);
      console.log(`   Auth token created for: ${parsedToken?.sub}`);

      console.log('🎉 Paper wallet workflow successful!');
    });

    it('should demonstrate multi-algorithm support', async () => {
      console.log('🔧 Testing multi-algorithm support...');

      // Create signers with both algorithms
      const ed25519Signer = createSigner(SigAlg.ED25519);
      const secp256k1Signer = createSigner(SigAlg.SECP256K1);

      console.log(`   Ed25519 address: ${ed25519Signer.address}`);
      console.log(`   secp256k1 address: ${secp256k1Signer.address}`);

      // Register both
      const signers = [
        { signer: ed25519Signer, alg: 'ed25519' },
        { signer: secp256k1Signer, alg: 'secp256k1' }
      ];

      for (const { signer, alg } of signers) {
        const publicKeyBase64 = Buffer.from(signer.getPublicKeyDER()).toString('base64');

        const response = await fetch(`${serviceUrl}/accounts/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: signer.address,
            publicKeyBase64,
            sigAlg: alg,
            username: `multi-alg-${alg}`
          })
        });

        const result = await response.json() as any; // Cast existing result to any
        expect(result.ok).toBe(true);
        console.log(`   ✅ Registered ${alg}: ${result.address}`);

      }

      // Test signing with both
      const testMessage = new TextEncoder().encode('Multi-algorithm test');

      const ed25519Sig = await ed25519Signer.sign(testMessage);
      const secp256k1Sig = await secp256k1Signer.sign(testMessage);

      expect(ed25519Sig).toBeInstanceOf(Uint8Array);
      expect(secp256k1Sig).toBeInstanceOf(Uint8Array);

      // Should produce different signatures (different keys + algorithms)
      expect(Buffer.from(ed25519Sig).toString('hex')).not.toBe(
        Buffer.from(secp256k1Sig).toString('hex')
      );

      console.log(`   Ed25519 signature: ${Buffer.from(ed25519Sig).toString('hex').slice(0, 24)}...`);
      console.log(`   secp256k1 signature: ${Buffer.from(secp256k1Sig).toString('hex').slice(0, 24)}...`);
      console.log('🎉 Multi-algorithm support verified!');
    });

    it('should handle testnet development scenario', async () => {
      console.log('🧪 Simulating testnet development scenario...');

      // Generate batch of wallets for testnet
      const testWallets = [
        ...generatePaperWalletBatch(5, { sigAlg: SigAlg.ED25519 }),
        ...generatePaperWalletBatch(5, { sigAlg: SigAlg.SECP256K1 })
      ];

      expect(testWallets.length).toBe(10);
      console.log(`   Generated ${testWallets.length} test wallets`);

      // Register first 5 wallets
      const registrationResults = [];
      for (let i = 0; i < 5; i++) {
        const wallet = testWallets[i];

        const response = await fetch(`${serviceUrl}/accounts/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: wallet.address,
            publicKeyBase64: wallet.publicKey,
            sigAlg: wallet.sigAlg,
            username: `testnet-user-${i + 1}`
          })
        });

        const result = await response.json();
        expect(result.ok).toBe(true);
        registrationResults.push(result);
      }

      console.log(`   ✅ Registered ${registrationResults.length} wallets`);

      // Create sessions for first 3 wallets
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const wallet = testWallets[i];

        const response = await fetch(`${serviceUrl}/accounts/create-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: wallet.address,
            permissions: ['MKT_BUY', 'MKT_SELL'],
            expiresAt: Date.now() + 60 * 60 * 1000
          })
        });

        const result = await response.json();
        expect(result.ok).toBe(true);
        sessions.push(result);
      }

      console.log(`   📱 Created ${sessions.length} sessions`);

      // Test auth tokens for all registered wallets
      const authTokens = [];
      for (let i = 0; i < 5; i++) {
        const wallet = testWallets[i];
        const token = wallet.signer.createAuthToken(`testnet-app-${i}`);

        const parsed = parseAuthToken(token);
        expect(parsed?.sub).toBe(wallet.address);
        authTokens.push(token);
      }

      console.log(`   🎫 Created ${authTokens.length} auth tokens`);

      // Display summary
      console.log('📊 Testnet Summary:');
      console.log(`   Total wallets generated: ${testWallets.length}`);
      console.log(`   Registered wallets: ${registrationResults.length}`);
      console.log(`   Active sessions: ${sessions.length}`);
      console.log(`   Auth tokens: ${authTokens.length}`);

      const algorithms = testWallets.reduce((acc, w) => {
        acc[w.sigAlg] = (acc[w.sigAlg] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log(`   Algorithm distribution: ${JSON.stringify(algorithms)}`);
      console.log('🎉 Testnet scenario completed!');
    });
  });

  describe('Security Verification', () => {
    it('should ensure no private keys are exposed in API responses', async () => {
      const signer = createSigner(SigAlg.ED25519);
      const publicKeyBase64 = Buffer.from(signer.getPublicKeyDER()).toString('base64');

      // Test all API endpoints
      const endpoints = [
        {
          method: 'POST',
          path: '/accounts/register',
          body: {
            address: signer.address,
            publicKeyBase64,
            sigAlg: 'ed25519'
          }
        },
        {
          method: 'GET',
          path: '/capabilities',
          body: null
        }
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`${serviceUrl}${endpoint.path}`, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' },
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
        });

        const result = await response.json();
        const responseText = JSON.stringify(result);

        // Verify no private key data is leaked
        expect(responseText).not.toMatch(/-----BEGIN PRIVATE KEY-----/);
        expect(responseText).not.toMatch(/-----END PRIVATE KEY-----/);
        expect(responseText).not.toMatch(/privateKey/i);
        expect(responseText).not.toMatch(/mnemonic/i);
        expect(responseText).not.toMatch(/seed/i);
      }
    });

    it('should verify client-server separation', async () => {
      // Generate key client-side
      const clientSigner = createSigner(SigAlg.ED25519);
      const privateKeyPEM = (clientSigner as any).exportPrivateKey('pem');

      // Client has private key
      expect(privateKeyPEM).toContain('-----BEGIN PRIVATE KEY-----');

      // Server registration only needs public key
      const publicKeyBase64 = Buffer.from(clientSigner.getPublicKeyDER()).toString('base64');

      const response = await fetch(`${serviceUrl}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: clientSigner.address,
          publicKeyBase64,
          sigAlg: 'ed25519'
        })
      });

      const result = await response.json();

      // Server confirms registration but never returns private key
      expect(result.ok).toBe(true);
      expect(result.address).toBe(clientSigner.address);
      expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');

      // Client can still sign with their private key
      const testData = new TextEncoder().encode('test message');
      const signature = await clientSigner.sign(testData);
      expect(signature).toBeInstanceOf(Uint8Array);
    });

    it('should demonstrate proper error handling', async () => {
      // Test various error conditions
      const testCases = [
        {
          name: 'Missing fields',
          payload: { address: 'test' },
          expectedStatus: 400,
          expectedError: 'MISSING_FIELDS'
        },
        {
          name: 'Mismatched address/pubkey',
          payload: {
            address: 'gc-fake-address',
            publicKeyBase64: 'ZmFrZV9wdWJrZXk=', // fake pubkey
            sigAlg: 'ed25519'
          },
          expectedStatus: 400,
          expectedError: 'ADDRESS_PUBKEY_MISMATCH'
        }
      ];

      for (const testCase of testCases) {
        const response = await fetch(`${serviceUrl}/accounts/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testCase.payload)
        });

        const result = await response.json();

        expect(response.status).toBe(testCase.expectedStatus);
        expect(result.ok).toBe(false);
        expect(result.error).toBe(testCase.expectedError);

        console.log(`   ✅ ${testCase.name}: ${result.error}`);
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent registrations', async () => {
      console.log('🚀 Testing concurrent registrations...');

      // Generate multiple wallets
      const wallets = generatePaperWalletBatch(20, {
        sigAlg: SigAlg.ED25519,
        useEnhancedEntropy: true
      });

      // Register them concurrently
      const startTime = Date.now();
      const registrationPromises = wallets.map(async (wallet, index) => {
        return fetch(`${serviceUrl}/accounts/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: wallet.address,
            publicKeyBase64: wallet.publicKey,
            sigAlg: wallet.sigAlg,
            username: `concurrent-user-${index}`
          })
        });
      });

      const responses = await Promise.all(registrationPromises);
      const results = await Promise.all(responses.map(r => r.json()));
      const endTime = Date.now();

      // Verify all succeeded
      const successCount = results.filter(r => r.ok).length;
      expect(successCount).toBe(20);

      console.log(`   ✅ ${successCount}/${wallets.length} registrations successful`);
      console.log(`   ⏱️  Total time: ${endTime - startTime}ms`);
      console.log(`   📊 Average: ${(endTime - startTime) / wallets.length}ms per registration`);
    });

    it('should efficiently generate large wallet batches', () => {
      console.log('📦 Testing large batch generation...');

      const batchSizes = [10, 50, 100];

      for (const size of batchSizes) {
        const startTime = Date.now();
        const wallets = generatePaperWalletBatch(size, {
          sigAlg: SigAlg.ED25519,
          useMultiplicationMethod: true
        });
        const endTime = Date.now();

        expect(wallets.length).toBe(size);

        // All should be unique
        const addresses = wallets.map(w => w.address);
        const uniqueAddresses = new Set(addresses);
        expect(uniqueAddresses.size).toBe(size);

        console.log(`   📦 ${size} wallets: ${endTime - startTime}ms (${(endTime - startTime) / size}ms per wallet)`);
      }
    });
  });
});