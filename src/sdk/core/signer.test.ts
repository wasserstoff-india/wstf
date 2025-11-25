/**
 * Enhanced Signer Tests
 *
 * Tests for the new secure paper wallet generation with enhanced entropy.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSigner,
  importSigner,
  generatePaperWallet,
  generatePaperWalletBatch,
  validatePaperWallet,
  KeypairSigner,
  type PaperWallet,
  type PaperWalletOptions
} from './signer';
import { SigAlg } from './types';

describe('Enhanced Signer', () => {
  describe('Basic Signer Functionality', () => {
    it('should create Ed25519 signer', () => {
      const signer = createSigner(SigAlg.ED25519);

      expect(signer.address).toMatch(/^gc/);
      expect(signer.sigAlg).toBe(SigAlg.ED25519);
    });

    it('should create secp256k1 signer', () => {
      const signer = createSigner(SigAlg.SECP256K1);

      expect(signer.address).toMatch(/^gc/);
      expect(signer.sigAlg).toBe(SigAlg.SECP256K1);
    });

    it('should generate different addresses each time', () => {
      const signer1 = createSigner(SigAlg.ED25519);
      const signer2 = createSigner(SigAlg.ED25519);

      expect(signer1.address).not.toBe(signer2.address);
    });

    it('should sign data consistently', async () => {
      const signer = createSigner(SigAlg.ED25519);
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const sig1 = await signer.sign(data);
      const sig2 = await signer.sign(data);

      // Same signer, same data should produce same signature
      expect(Buffer.from(sig1).toString('hex')).toBe(Buffer.from(sig2).toString('hex'));
    });

    it('should import signer from private key', () => {
      const originalSigner = createSigner(SigAlg.ED25519);
      const privateKeyPEM = (originalSigner as KeypairSigner).exportPrivateKey('pem') as string;

      const importedSigner = importSigner(privateKeyPEM, SigAlg.ED25519);

      expect(importedSigner.address).toBe(originalSigner.address);
      expect(importedSigner.sigAlg).toBe(originalSigner.sigAlg);
    });
  });

  describe('Enhanced Paper Wallet Generation', () => {
    it('should generate paper wallet with enhanced entropy', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useEnhancedEntropy: true,
        useMultiplicationMethod: false
      });

      expect(wallet.address).toMatch(/^gc/);
      expect(wallet.sigAlg).toBe('ed25519');
      expect(wallet.privateKeyPEM).toContain('-----BEGIN PRIVATE KEY-----');
      expect(wallet.privateKeyRaw).toBeInstanceOf(Uint8Array);
      expect(wallet.privateKeyRaw.length).toBe(32);

      expect(wallet.entropy.sources).toContain('os-random');
      expect(wallet.entropy.sources).toContain('high-res-timer');
      expect(wallet.entropy.sources).toContain('process-entropy');
      expect(wallet.entropy.method).toBe('enhanced-xor');
      expect(wallet.entropy.totalBits).toBe(256);
    });

    it('should generate paper wallet with multiplication method (enhanced entropy)', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useEnhancedEntropy: true,
        useMultiplicationMethod: true
      });

      expect(wallet.entropy.sources).toContain('os-random');
      expect(wallet.entropy.sources).toContain('high-res-timer');
      expect(wallet.entropy.sources).toContain('process-entropy');
      expect(wallet.entropy.sources).toContain('multiplication-method');
      expect(wallet.entropy.method).toBe('enhanced-multiplication');
      expect(wallet.entropy.totalBits).toBe(512); // Two 256-bit numbers multiplied
    });

    it('should generate paper wallet with secp256k1 algorithm', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.SECP256K1,
        useMultiplicationMethod: true
      });

      expect(wallet.sigAlg).toBe('secp256k1');
      expect(wallet.signer.sigAlg).toBe(SigAlg.SECP256K1);
      expect(wallet.entropy.method).toBe('enhanced-multiplication');
    });

    it('should generate wallet with standard crypto entropy when enhanced is disabled', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useEnhancedEntropy: false,
        useMultiplicationMethod: false
      });

      expect(wallet.entropy.sources).toEqual(['os-random']);
      expect(wallet.entropy.method).toBe('standard-crypto');
      expect(wallet.entropy.totalBits).toBe(256);
    });

    it('should generate wallet with custom entropy', () => {
      const customEntropy = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        customEntropy[i] = i; // Predictable for testing
      }

      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        customEntropy
      });

      expect(wallet.entropy.sources).toEqual(['custom']);
      expect(wallet.entropy.method).toBe('custom-provided');
      expect(wallet.entropy.totalBits).toBe(256);
      expect(wallet.privateKeyRaw).toEqual(customEntropy);
    });

    it('should generate different wallets with multiplication method', () => {
      const wallet1 = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      const wallet2 = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      expect(wallet1.address).not.toBe(wallet2.address);
      expect(wallet1.privateKeyPEM).not.toBe(wallet2.privateKeyPEM);
      expect(Buffer.from(wallet1.privateKeyRaw).toString('hex')).not.toBe(
        Buffer.from(wallet2.privateKeyRaw).toString('hex')
      );
    });

    it('should generate valid signers from paper wallets', async () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      // Test that the signer works
      const testData = new Uint8Array([1, 2, 3]);
      const signature = await wallet.signer.sign(testData);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBeGreaterThan(0);

      // Test that importing from PEM works
      const importedSigner = importSigner(wallet.privateKeyPEM, SigAlg.ED25519);
      expect(importedSigner.address).toBe(wallet.address);

      // Test that both signers produce same signature
      const importedSignature = await importedSigner.sign(testData);
      expect(Buffer.from(signature).toString('hex')).toBe(
        Buffer.from(importedSignature).toString('hex')
      );
    });
  });

  describe('Paper Wallet Batch Generation', () => {
    it('should generate batch of 10 wallets', () => {
      const wallets = generatePaperWalletBatch(10, {
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      expect(wallets.length).toBe(10);

      // All should be unique
      const addresses = wallets.map(w => w.address);
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(10);

      // All should have enhanced multiplication entropy
      wallets.forEach(wallet => {
        expect(wallet.entropy.method).toBe('enhanced-multiplication');
        expect(wallet.entropy.totalBits).toBe(512);
      });
    });

    it('should generate batch with mixed algorithms', () => {
      const ed25519Wallets = generatePaperWalletBatch(5, {
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      const secp256k1Wallets = generatePaperWalletBatch(5, {
        sigAlg: SigAlg.SECP256K1,
        useMultiplicationMethod: true
      });

      expect(ed25519Wallets.every(w => w.sigAlg === 'ed25519')).toBe(true);
      expect(secp256k1Wallets.every(w => w.sigAlg === 'secp256k1')).toBe(true);

      // Combine and ensure all unique
      const allWallets = [...ed25519Wallets, ...secp256k1Wallets];
      const addresses = allWallets.map(w => w.address);
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(10);
    });

    it('should reject batch size outside limits', () => {
      expect(() => generatePaperWalletBatch(0)).toThrow('Batch size must be between 1 and 100');
      expect(() => generatePaperWalletBatch(101)).toThrow('Batch size must be between 1 and 100');
    });

    it('should handle maximum batch size', () => {
      const wallets = generatePaperWalletBatch(100, {
        sigAlg: SigAlg.ED25519,
        useEnhancedEntropy: true
      });

      expect(wallets.length).toBe(100);

      // Verify all are unique
      const addresses = wallets.map(w => w.address);
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(100);
    });
  });

  describe('Paper Wallet Validation', () => {
    it('should validate correctly generated paper wallet', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      const isValid = validatePaperWallet(wallet);
      expect(isValid).toBe(true);
    });

    it('should validate secp256k1 paper wallet', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.SECP256K1,
        useEnhancedEntropy: true
      });

      const isValid = validatePaperWallet(wallet);
      expect(isValid).toBe(true);
    });

    it('should detect invalid paper wallet with wrong address', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519
      });

      // Corrupt the address
      const corruptedWallet: PaperWallet = {
        ...wallet,
        address: 'gc-corrupted-address'
      };

      const isValid = validatePaperWallet(corruptedWallet);
      expect(isValid).toBe(false);
    });

    it('should detect invalid paper wallet with corrupted private key', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519
      });

      // Corrupt the private key PEM
      const corruptedWallet: PaperWallet = {
        ...wallet,
        privateKeyPEM: wallet.privateKeyPEM.replace('PRIVATE', 'CORRUPTED')
      };

      const isValid = validatePaperWallet(corruptedWallet);
      expect(isValid).toBe(false);
    });
  });

  describe('Entropy Quality Analysis', () => {
    it('should produce unique entropy patterns in multiplication method', () => {
      const wallets = generatePaperWalletBatch(20, {
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      // Analyze private key entropy distribution
      const privateKeys = wallets.map(w => Buffer.from(w.privateKeyRaw).toString('hex'));

      // No duplicate private keys (extremely unlikely with proper entropy)
      const uniqueKeys = new Set(privateKeys);
      expect(uniqueKeys.size).toBe(20);

      // Check byte distribution in first wallet
      const firstKeyBytes = wallets[0].privateKeyRaw;
      const byteFrequency = new Array(256).fill(0);

      for (let i = 0; i < firstKeyBytes.length; i++) {
        byteFrequency[firstKeyBytes[i]]++;
      }

      // Ensure not all bytes are the same (would indicate poor entropy)
      const uniqueByteValues = byteFrequency.filter(freq => freq > 0).length;
      expect(uniqueByteValues).toBeGreaterThan(15); // Expect reasonable distribution
    });

    it('should demonstrate entropy source combinations', () => {
      const testConfigs: PaperWalletOptions[] = [
        { useEnhancedEntropy: false, useMultiplicationMethod: false },
        { useEnhancedEntropy: true, useMultiplicationMethod: false },
        { useEnhancedEntropy: true, useMultiplicationMethod: true },
      ];

      const wallets = testConfigs.map(config =>
        generatePaperWallet({ sigAlg: SigAlg.ED25519, ...config })
      );

      expect(wallets[0].entropy.method).toBe('standard-crypto');
      expect(wallets[0].entropy.sources).toEqual(['os-random']);
      expect(wallets[0].entropy.totalBits).toBe(256);

      expect(wallets[1].entropy.method).toBe('enhanced-xor');
      expect(wallets[1].entropy.sources.length).toBe(3);
      expect(wallets[1].entropy.totalBits).toBe(256);

      expect(wallets[2].entropy.method).toBe('enhanced-multiplication');
      expect(wallets[2].entropy.sources.length).toBe(4);
      expect(wallets[2].entropy.totalBits).toBe(512);

      // All should produce different addresses (different entropy)
      const addresses = wallets.map(w => w.address);
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(3);
    });
  });

  describe('Security Properties', () => {
    it('should never expose entropy generation internals', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      // Entropy info should only contain metadata, not actual values
      const entropyInfo = wallet.entropy;
      expect(entropyInfo.sources).toBeInstanceOf(Array);
      expect(typeof entropyInfo.totalBits).toBe('number');
      expect(typeof entropyInfo.method).toBe('string');

      // Should not contain actual entropy values or intermediate calculations
      const entropyStr = JSON.stringify(entropyInfo);
      expect(entropyStr.length).toBeLessThan(500); // Just metadata
    });

    it('should generate cryptographically strong private keys', () => {
      const wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      const privateKeyBytes = wallet.privateKeyRaw;

      // Check that we don't have obvious patterns (all zeros, all same byte, etc.)
      const allZeros = new Uint8Array(32);
      const allOnes = new Uint8Array(32).fill(255);
      const allSame = new Uint8Array(32).fill(privateKeyBytes[0]);

      expect(privateKeyBytes).not.toEqual(allZeros);
      expect(privateKeyBytes).not.toEqual(allOnes);
      expect(privateKeyBytes).not.toEqual(allSame);

      // Check Hamming weight (number of 1 bits) is reasonable
      let hammingWeight = 0;
      for (let i = 0; i < privateKeyBytes.length; i++) {
        for (let bit = 0; bit < 8; bit++) {
          if ((privateKeyBytes[i] >> bit) & 1) {
            hammingWeight++;
          }
        }
      }

      // For 256 bits, expect roughly 50% to be 1s (between 96 and 160)
      expect(hammingWeight).toBeGreaterThan(96);
      expect(hammingWeight).toBeLessThan(160);
    });

    it('should work correctly for both signature algorithms', async () => {
      const ed25519Wallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true
      });

      const secp256k1Wallet = generatePaperWallet({
        sigAlg: SigAlg.SECP256K1,
        useMultiplicationMethod: true
      });

      // Both should be able to sign
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const ed25519Sig = await ed25519Wallet.signer.sign(testData);
      const secp256k1Sig = await secp256k1Wallet.signer.sign(testData);

      expect(ed25519Sig).toBeInstanceOf(Uint8Array);
      expect(secp256k1Sig).toBeInstanceOf(Uint8Array);
      expect(ed25519Sig.length).toBeGreaterThan(0);
      expect(secp256k1Sig.length).toBeGreaterThan(0);

      // Signatures should be different (different keys + algorithms)
      expect(Buffer.from(ed25519Sig).toString('hex')).not.toBe(
        Buffer.from(secp256k1Sig).toString('hex')
      );
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should support cold storage wallet generation', () => {
      // Simulate generating wallets for cold storage
      const coldStorageWallets = generatePaperWalletBatch(5, {
        sigAlg: SigAlg.ED25519,
        useMultiplicationMethod: true // Maximum entropy
      });

      coldStorageWallets.forEach((wallet, index) => {
        expect(wallet.address).toMatch(/^gc/);
        expect(wallet.entropy.method).toBe('enhanced-multiplication');
        expect(wallet.privateKeyPEM).toContain('-----BEGIN PRIVATE KEY-----');
        expect(wallet.privateKeyPEM).toContain('-----END PRIVATE KEY-----');

        // Validate each wallet
        expect(validatePaperWallet(wallet)).toBe(true);
      });
    });

    it('should support testnet development wallet sets', () => {
      // Generate a mix for testnet use
      const testnetWallets = [
        ...generatePaperWalletBatch(50, { sigAlg: SigAlg.ED25519 }),
        ...generatePaperWalletBatch(50, { sigAlg: SigAlg.SECP256K1 })
      ];

      expect(testnetWallets.length).toBe(100);

      // Verify algorithm distribution
      const ed25519Count = testnetWallets.filter(w => w.sigAlg === 'ed25519').length;
      const secp256k1Count = testnetWallets.filter(w => w.sigAlg === 'secp256k1').length;

      expect(ed25519Count).toBe(50);
      expect(secp256k1Count).toBe(50);

      // All addresses should be unique
      const addresses = testnetWallets.map(w => w.address);
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(100);
    });

    it('should demonstrate SDK integration workflow', async () => {
      // 1. Generate paper wallet offline
      const paperWallet = generatePaperWallet({
        sigAlg: SigAlg.ED25519,
        useEnhancedEntropy: true,
        useMultiplicationMethod: true
      });

      // 2. Import into SDK signer when needed
      const signer = importSigner(paperWallet.privateKeyPEM, SigAlg.ED25519);

      // 3. Verify they match
      expect(signer.address).toBe(paperWallet.address);
      expect(signer.sigAlg).toBe(SigAlg.ED25519);

      // 4. Use for signing operations
      const testMessage = new TextEncoder().encode('Hello WSTFChain');
      const signature = await signer.sign(testMessage);

      // 5. Verify signature was created
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBeGreaterThan(0);

      // 6. Demonstrate that paper wallet signer produces same result
      const paperSignature = await paperWallet.signer.sign(testMessage);
      expect(Buffer.from(signature).toString('hex')).toBe(
        Buffer.from(paperSignature).toString('hex')
      );
    });
  });
});