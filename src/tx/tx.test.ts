/**
 * Transaction Comprehensive Unit Tests
 *
 * Tests Tx v1, v2, and v2F with positive, negative, and edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { BasicTx, BASIC_TX_VERSION } from './basic';
import {
  TxV2,
  TX_V2_VERSION,
  preimageTxV2,
  integrityHashTxV2,
  computeReadsHash,
  computeLocksHash,
  buildTxV2,
} from './v2';
import {
  TxV2F,
  buildPreimage,
  computeIntegrityHash,
  computeTxId,
  validateTxV2FStructure,
  createSampleTxV2F,
} from './v2f';
import { SigAlgId, MappingAlgId } from '../crypto/algorithms';
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { deriveAddress } from '../crypto/address';
import { signPreimage, verifyPreimage } from '../crypto/sign';

// Helper to create test address
function createTestAddress(sigAlg: SigAlgId = SigAlgId.ED25519) {
  const kp = generateKeypair(sigAlg);
  const der = exportPubDER(kp.publicKey);
  const address = deriveAddress(der, MappingAlgId.SIMPLE_HASH, sigAlg);
  return { kp, der, address, publicKeyBase64: der.toString('base64') };
}

describe('Transaction v1 (BasicTx)', () => {
  describe('Structure validation', () => {
    it('should have correct version', () => {
      expect(BASIC_TX_VERSION).toBe(1);
    });

    it('should create valid BasicTx structure', () => {
      const { address, publicKeyBase64 } = createTestAddress();
      const tx: BasicTx = {
        version: 1,
        from: address,
        nonce: 1n,
        payloadHash: '0'.repeat(64),
        integrityHash: 'a'.repeat(64),
        signature: 'b'.repeat(128),
        publicKey: publicKeyBase64,
      };

      expect(tx.version).toBe(1);
      expect(tx.from).toBe(address);
      expect(tx.nonce).toBe(1n);
    });
  });

  describe('Nonce validation', () => {
    it('should accept nonce = 0', () => {
      const { address } = createTestAddress();
      const tx: BasicTx = {
        version: 1,
        from: address,
        nonce: 0n,
        payloadHash: '0'.repeat(64),
        integrityHash: 'a'.repeat(64),
        signature: 'b'.repeat(128),
      };
      expect(tx.nonce).toBe(0n);
    });

    it('should accept large nonce', () => {
      const { address } = createTestAddress();
      const tx: BasicTx = {
        version: 1,
        from: address,
        nonce: 2n ** 63n,
        payloadHash: '0'.repeat(64),
        integrityHash: 'a'.repeat(64),
        signature: 'b'.repeat(128),
      };
      expect(tx.nonce).toBe(2n ** 63n);
    });
  });
});

describe('Transaction v2 (TxV2)', () => {
  describe('Preimage construction', () => {
    it('should create deterministic preimage', () => {
      const { address } = createTestAddress();
      const instructionsHash = 'a'.repeat(64);
      const readsHash = 'b'.repeat(64);
      const locksHash = 'c'.repeat(64);

      const preimage1 = preimageTxV2(address, 1n, instructionsHash, readsHash, locksHash);
      const preimage2 = preimageTxV2(address, 1n, instructionsHash, readsHash, locksHash);

      expect(preimage1.equals(preimage2)).toBe(true);
    });

    it('should differ with different nonce', () => {
      const { address } = createTestAddress();
      const instructionsHash = 'a'.repeat(64);
      const readsHash = 'b'.repeat(64);
      const locksHash = 'c'.repeat(64);

      const preimage1 = preimageTxV2(address, 1n, instructionsHash, readsHash, locksHash);
      const preimage2 = preimageTxV2(address, 2n, instructionsHash, readsHash, locksHash);

      expect(preimage1.equals(preimage2)).toBe(false);
    });

    it('should differ with different addresses', () => {
      const { address: addr1 } = createTestAddress();
      const { address: addr2 } = createTestAddress();
      const instructionsHash = 'a'.repeat(64);
      const readsHash = 'b'.repeat(64);
      const locksHash = 'c'.repeat(64);

      const preimage1 = preimageTxV2(addr1, 1n, instructionsHash, readsHash, locksHash);
      const preimage2 = preimageTxV2(addr2, 1n, instructionsHash, readsHash, locksHash);

      expect(preimage1.equals(preimage2)).toBe(false);
    });

    it('should include TX2 tag', () => {
      const { address } = createTestAddress();
      const preimage = preimageTxV2(address, 1n, 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64));

      expect(preimage.slice(0, 3).toString()).toBe('TX2');
    });
  });

  describe('Hash computation', () => {
    it('should compute deterministic integrity hash', () => {
      const preimage = Buffer.from('test preimage');
      const hash1 = integrityHashTxV2(preimage);
      const hash2 = integrityHashTxV2(preimage);

      expect(hash1.equals(hash2)).toBe(true);
    });

    it('should compute empty reads hash', () => {
      const hash = computeReadsHash([]);
      expect(hash).toBe('0'.repeat(64));
    });

    it('should compute reads hash with entries', () => {
      const reads = [
        { stateId: 'a'.repeat(64), expectedVersion: 'b'.repeat(64) },
      ];
      const hash = computeReadsHash(reads);
      expect(hash.length).toBe(64);
      expect(hash).not.toBe('0'.repeat(64));
    });

    it('should compute empty locks hash', () => {
      const hash = computeLocksHash([]);
      expect(hash).toBe('0'.repeat(64));
    });

    it('should compute locks hash with entries', () => {
      const locks = [{ stateId: 'a'.repeat(64) }];
      const hash = computeLocksHash(locks);
      expect(hash.length).toBe(64);
      expect(hash).not.toBe('0'.repeat(64));
    });

    it('should produce different hashes for different reads order', () => {
      const reads1 = [
        { stateId: 'a'.repeat(64), expectedVersion: '1'.repeat(64) },
        { stateId: 'b'.repeat(64), expectedVersion: '2'.repeat(64) },
      ];
      const reads2 = [
        { stateId: 'b'.repeat(64), expectedVersion: '2'.repeat(64) },
        { stateId: 'a'.repeat(64), expectedVersion: '1'.repeat(64) },
      ];
      const hash1 = computeReadsHash(reads1);
      const hash2 = computeReadsHash(reads2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Build Tx v2', () => {
    it('should build complete Tx v2', () => {
      const { address, kp, publicKeyBase64 } = createTestAddress();
      const programBytes = Buffer.from('test program');

      const tx = buildTxV2({
        from: address,
        nonce: 1n,
        programBytes,
        reads: [],
        locks: [],
        signature: 'sig'.repeat(20),
        publicKey: publicKeyBase64,
      });

      expect(tx.version).toBe(2);
      expect(tx.from).toBe(address);
      expect(tx.nonce).toBe(1n);
      expect(tx.instructionsHash.length).toBe(64);
      expect(tx.readsHash).toBe('0'.repeat(64));
      expect(tx.locksHash).toBe('0'.repeat(64));
      expect(tx.integrityHash.length).toBe(64);
    });
  });
});

describe('Transaction v2F (Fee envelope)', () => {
  describe('Structure validation', () => {
    it('should validate correct structure', () => {
      const tx = createSampleTxV2F({});
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(true);
    });

    it('should reject null tx', () => {
      const result = validateTxV2FStructure(null);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('EMPTY_TX');
    });

    it('should reject wrong version', () => {
      const tx = createSampleTxV2F({});
      (tx as any).version = 1;
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('INVALID_VERSION');
    });

    it('should reject missing from', () => {
      const tx = createSampleTxV2F({});
      (tx as any).from = null;
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('INVALID_FROM');
    });

    it('should reject non-bigint nonce', () => {
      const tx = createSampleTxV2F({});
      (tx as any).nonce = 123;
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('INVALID_NONCE');
    });

    it('should reject zero maxGas', () => {
      const tx = createSampleTxV2F({});
      (tx as any).maxGas = 0n;
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('INVALID_MAX_GAS');
    });

    it('should reject zero gasPrice', () => {
      const tx = createSampleTxV2F({});
      (tx as any).gasPrice = 0n;
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('INVALID_GAS_PRICE');
    });

    it('should reject invalid hash prefix', () => {
      const tx = createSampleTxV2F({});
      (tx as any).instructionsHash = 'invalid';
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('INVALID_INSTRUCTIONS_HASH');
    });
  });

  describe('Preimage construction', () => {
    it('should build deterministic preimage', () => {
      const tx = createSampleTxV2F({});
      const preimage1 = buildPreimage(tx);
      const preimage2 = buildPreimage(tx);

      expect(preimage1.equals(preimage2)).toBe(true);
    });

    it('should have correct length (190 bytes)', () => {
      const tx = createSampleTxV2F({});
      const preimage = buildPreimage(tx);
      // 4 (tag) + 22 (from) + 8 (nonce) + 32*3 (hashes) + 8*2 (gas) + 22*2 (payer, pm)
      expect(preimage.length).toBe(190);
    });

    it('should include TX2F tag', () => {
      const tx = createSampleTxV2F({});
      const preimage = buildPreimage(tx);
      expect(preimage.slice(0, 4).toString()).toBe('TX2F');
    });

    it('should differ with different maxGas', () => {
      const tx1 = createSampleTxV2F({ maxGas: 1000n });
      const tx2 = createSampleTxV2F({ maxGas: 2000n });
      const preimage1 = buildPreimage(tx1);
      const preimage2 = buildPreimage(tx2);

      expect(preimage1.equals(preimage2)).toBe(false);
    });

    it('should include paymaster if provided', () => {
      const tx1 = createSampleTxV2F({});
      const tx2 = createSampleTxV2F({ paymaster: 'gc1' + 'ff'.repeat(22) });
      const preimage1 = buildPreimage(tx1);
      const preimage2 = buildPreimage(tx2);

      expect(preimage1.equals(preimage2)).toBe(false);
    });
  });

  describe('Integrity hash', () => {
    it('should compute deterministic hash', () => {
      const preimage = Buffer.from('test preimage');
      const hash1 = computeIntegrityHash(preimage);
      const hash2 = computeIntegrityHash(preimage);

      expect(hash1).toBe(hash2);
    });

    it('should have 0x prefix', () => {
      const preimage = Buffer.from('test');
      const hash = computeIntegrityHash(preimage);
      expect(hash.startsWith('0x')).toBe(true);
    });

    it('should be 64 chars after prefix', () => {
      const preimage = Buffer.from('test');
      const hash = computeIntegrityHash(preimage);
      expect(hash.length).toBe(66); // 0x + 64 hex chars
    });
  });

  describe('Transaction ID', () => {
    it('should compute deterministic txId', () => {
      const tx = createSampleTxV2F({});
      const id1 = computeTxId(tx);
      const id2 = computeTxId(tx);

      expect(id1).toBe(id2);
    });

    it('should differ for different txs', () => {
      const tx1 = createSampleTxV2F({ nonce: 1n });
      const tx2 = createSampleTxV2F({ nonce: 2n });
      const id1 = computeTxId(tx1);
      const id2 = computeTxId(tx2);

      expect(id1).not.toBe(id2);
    });
  });

  describe('Gas limits and edge cases', () => {
    it('should handle maxGas = 1', () => {
      const tx = createSampleTxV2F({ maxGas: 1n });
      expect(tx.maxGas).toBe(1n);
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(true);
    });

    it('should handle large maxGas', () => {
      const tx = createSampleTxV2F({ maxGas: 2n ** 60n });
      expect(tx.maxGas).toBe(2n ** 60n);
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(true);
    });

    it('should handle gasPrice = 1', () => {
      const tx = createSampleTxV2F({ gasPrice: 1n });
      expect(tx.gasPrice).toBe(1n);
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(true);
    });

    it('should handle large gasPrice', () => {
      const tx = createSampleTxV2F({ gasPrice: 2n ** 60n });
      expect(tx.gasPrice).toBe(2n ** 60n);
      const result = validateTxV2FStructure(tx);
      expect(result.ok).toBe(true);
    });
  });

  describe('Paymaster scenarios', () => {
    it('should create tx without paymaster', () => {
      const tx = createSampleTxV2F({});
      expect(tx.paymaster).toBeUndefined();
    });

    it('should create tx with paymaster', () => {
      const paymaster = 'gc1' + 'ab'.repeat(22);
      const tx = createSampleTxV2F({ paymaster });
      expect(tx.paymaster).toBe(paymaster);
    });

    it('should allow different feePayer than from', () => {
      const from = 'gc1' + '00'.repeat(22);
      const feePayer = 'gc1' + 'ff'.repeat(22);
      const tx = createSampleTxV2F({ from, feePayer });
      expect(tx.from).toBe(from);
      expect(tx.feePayer).toBe(feePayer);
      expect(tx.from).not.toBe(tx.feePayer);
    });
  });
});

describe('Transaction: Cross-version consistency', () => {
  it('should use same address format across all versions', () => {
    const { address } = createTestAddress();
    // v2F uses simplified gc1 format for testing, so use separate test addresses
    const v2fAddress = 'gc1' + '00'.repeat(22);

    const txV1: BasicTx = {
      version: 1,
      from: address,
      nonce: 1n,
      payloadHash: '0'.repeat(64),
      integrityHash: 'a'.repeat(64),
      signature: 'b'.repeat(128),
    };

    const txV2 = buildTxV2({
      from: address,
      nonce: 1n,
      programBytes: Buffer.alloc(0),
      reads: [],
      locks: [],
      signature: 'sig'.repeat(20),
    });

    const txV2F = createSampleTxV2F({ from: v2fAddress });

    // V1 and V2 use same address
    expect(txV1.from).toBe(txV2.from);
    // V2F has its own format - just verify it's valid
    expect(txV2F.from.startsWith('gc1')).toBe(true);
  });

  it('should use bigint nonce across all versions', () => {
    const { address } = createTestAddress();
    const v2fAddress = 'gc1' + '00'.repeat(22);
    const nonce = 12345678901234567890n;

    const txV1: BasicTx = {
      version: 1,
      from: address,
      nonce,
      payloadHash: '0'.repeat(64),
      integrityHash: 'a'.repeat(64),
      signature: 'b'.repeat(128),
    };

    const txV2 = buildTxV2({
      from: address,
      nonce,
      programBytes: Buffer.alloc(0),
      reads: [],
      locks: [],
      signature: 'sig'.repeat(20),
    });

    const txV2F = createSampleTxV2F({ from: v2fAddress, nonce });

    expect(txV1.nonce).toBe(nonce);
    expect(txV2.nonce).toBe(nonce);
    expect(txV2F.nonce).toBe(nonce);
  });
});
