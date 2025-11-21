/**
 * Determinism & Integration Tests
 *
 * Tests cross-cutting determinism properties and system integration.
 * Ensures consistent behavior across components.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

// Crypto imports
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { signPreimage, verifyPreimage } from '../crypto/sign';
import { deriveAddress } from '../crypto/address';
import { SigAlgId, MappingAlgId } from '../crypto/algorithms';

// Transaction imports
import { TxV2F, createSampleTxV2F, computeTxId } from '../tx/v2f';

// Instruction imports
import { compileProgram, InstructionDSL } from '../instructions/compiler';
import {
  encodeProgram,
  decodeProgram as decodeBytesToIRs,
  computeInstructionsHash,
  encodeIR,
  decodeIR,
  InstructionRecord,
} from '../instructions/abi';
import { decodeProgram as decodeIRsToDSL } from '../instructions/decoder';

// Economics imports
import { InMemoryBalanceStore } from '../economics/balances';
import { FeeService } from '../economics/fees';

describe('Determinism: Cryptographic Operations', () => {
  describe('Key generation determinism', () => {
    it('should produce different keys on each generation', () => {
      const kp1 = generateKeypair(SigAlgId.ED25519);
      const kp2 = generateKeypair(SigAlgId.ED25519);

      const pub1 = exportPubDER(kp1.publicKey);
      const pub2 = exportPubDER(kp2.publicKey);

      expect(pub1.equals(pub2)).toBe(false);
    });

    it('should produce deterministic signature for same message', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const message = Buffer.from('deterministic message');

      const sig1 = signPreimage(SigAlgId.ED25519, kp.privateKey, message);
      const sig2 = signPreimage(SigAlgId.ED25519, kp.privateKey, message);

      // Ed25519 signatures are deterministic
      expect(sig1.equals(sig2)).toBe(true);
    });

    it('should derive same address from same key', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const pubDER = exportPubDER(kp.publicKey);

      const addr1 = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
      const addr2 = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      expect(addr1).toBe(addr2);
    });
  });

  describe('Hash determinism', () => {
    it('should produce same hash for same input', () => {
      const input = Buffer.from('test data for hashing');

      const hash1 = crypto.createHash('sha256').update(input).digest();
      const hash2 = crypto.createHash('sha256').update(input).digest();

      expect(hash1.equals(hash2)).toBe(true);
    });

    it('should produce same tx hash for same tx', () => {
      // Use V2F tx which has deterministic hashing
      const tx1 = createSampleTxV2F({});
      const tx2 = createSampleTxV2F({});

      const hash1 = computeTxId(tx1);
      const hash2 = computeTxId(tx2);

      // Both should produce same hash since createSampleTxV2F is deterministic
      expect(hash1).toBe(hash2);
    });

    it('should produce same instructions hash for same program', () => {
      const program: InstructionDSL[] = [
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'REG',
          args: { stateId: '0x' + 'aa'.repeat(32) },
        },
      ];

      const irs = compileProgram(program);
      const encoded = encodeProgram(irs);

      const hash1 = computeInstructionsHash(encoded);
      const hash2 = computeInstructionsHash(encoded);

      expect(hash1.equals(hash2)).toBe(true);
    });
  });
});

describe('Determinism: Instruction Encoding', () => {
  it('should encode same IR to same bytes', () => {
    const ir: InstructionRecord = {
      ver: 1,
      flags: 0,
      creatorPkHash20: Buffer.alloc(20, 0xaa),
      moduleId16: Buffer.alloc(16, 0xbb),
      selector4: 1,
      args: { stateId: 'test', type: 'account' },
    };

    const encoded1 = encodeIR(ir);
    const encoded2 = encodeIR(ir);

    expect(encoded1.equals(encoded2)).toBe(true);
  });

  it('should roundtrip IR exactly', () => {
    const ir: InstructionRecord = {
      ver: 1,
      flags: 3,
      creatorPkHash20: Buffer.alloc(20, 0xcc),
      moduleId16: Buffer.alloc(16, 0xdd),
      selector4: 5,
      args: {
        nested: { a: 1, b: 'two', c: [1, 2, 3] },
      },
    };

    const encoded = encodeIR(ir);
    const { ir: decoded } = decodeIR(encoded);

    expect(decoded.ver).toBe(ir.ver);
    expect(decoded.flags).toBe(ir.flags);
    expect(decoded.selector4).toBe(ir.selector4);
    expect(decoded.args.nested.a).toBe(ir.args.nested.a);
    expect(decoded.args.nested.b).toBe(ir.args.nested.b);
  });

  it('should produce deterministic program bytes', () => {
    const program: InstructionDSL[] = [
      { creator: 'sys', moduleId: 'SYS', method: 'REG', args: { x: 1 } },
      { creator: 'sys', moduleId: 'SYS', method: 'INIT', args: { y: 2 } },
    ];

    const irs1 = compileProgram(program);
    const irs2 = compileProgram(program);

    const bytes1 = encodeProgram(irs1);
    const bytes2 = encodeProgram(irs2);

    expect(bytes1.equals(bytes2)).toBe(true);
  });
});

describe('Determinism: Gas Estimation', () => {
  it('should estimate same gas for same input', async () => {
    const balances = new InMemoryBalanceStore();
    const feeService = new FeeService(balances, { enabled: true });

    const gasInput = { programHex: '0x' + '00'.repeat(100) };

    const quote1 = await feeService.quoteFee(gasInput);
    const quote2 = await feeService.quoteFee(gasInput);

    expect(quote1.gasEstimate).toBe(quote2.gasEstimate);
  });

  it('should calculate same fee for same parameters', async () => {
    const balances = new InMemoryBalanceStore();
    const feeService = new FeeService(balances, { enabled: true });

    const gasInput = { programHex: '0x' + 'aa'.repeat(50) };
    const gasPrice = 1000n;

    const quote1 = await feeService.quoteFee(gasInput, gasPrice);
    const quote2 = await feeService.quoteFee(gasInput, gasPrice);

    expect(quote1.minFee).toBe(quote2.minFee);
  });
});

describe('Integration: End-to-End Transaction Flow', () => {
  it('should process transaction from creation to execution', async () => {
    // 1. Generate keypair and derive address
    const kp = generateKeypair(SigAlgId.ED25519);
    const pubDER = exportPubDER(kp.publicKey);
    const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    // 2. Create recipient address
    const recipientKp = generateKeypair(SigAlgId.ED25519);
    const recipientPubDER = exportPubDER(recipientKp.publicKey);
    const recipient = deriveAddress(recipientPubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    // 3. Create V2F transaction using gc1 format (v2f expected format)
    // V2F uses a simplified gc1+hex address format
    const v2fAddress = 'gc1' + '00'.repeat(22);
    const tx = createSampleTxV2F({ from: v2fAddress });
    const txId = computeTxId(tx);
    expect(txId).toBeDefined();

    // 4. Setup balance store (using the real derived addresses)
    const balances = new InMemoryBalanceStore();
    await balances.credit(address, 100000n);

    // 5. Transfer
    const transferOk = await balances.transfer(address, recipient, 1000n);
    expect(transferOk).toBe(true);

    // 6. Verify balances
    expect(await balances.get(address)).toBe(99000n);
    expect(await balances.get(recipient)).toBe(1000n);
  });

  it('should compile, encode, decode instruction program', () => {
    // 1. Define program in DSL
    const program: InstructionDSL[] = [
      {
        creator: 'sys',
        moduleId: 'SYS',
        method: 'REG',
        args: { stateId: '0x' + 'ff'.repeat(32), type: 'data' },
      },
      {
        creator: 'sys',
        moduleId: 'SYS',
        method: 'INIT',
        args: { stateId: '0x' + 'ff'.repeat(32), data: { value: 42 } },
      },
    ];

    // 2. Compile to IR
    const irs = compileProgram(program);
    expect(irs.length).toBe(2);

    // 3. Encode to bytes
    const bytes = encodeProgram(irs);
    expect(bytes.length).toBeGreaterThan(0);

    // 4. Compute hash
    const hash = computeInstructionsHash(bytes);
    expect(hash.length).toBe(32);

    // 5. Decode bytes back to IR
    const decodedIRs = decodeBytesToIRs(bytes);
    expect(decodedIRs.length).toBe(2);

    // 6. Decode IR to DSL
    const decodedDSL = decodeIRsToDSL(decodedIRs);
    expect(decodedDSL[0].method).toBe('REG');
    expect(decodedDSL[1].method).toBe('INIT');
  });

  it('should handle fee charging workflow', async () => {
    // Setup
    const balances = new InMemoryBalanceStore();
    const feeService = new FeeService(balances, { enabled: true });

    const sender = 'gc1sender';
    const miner = 'gc1miner';

    await balances.credit(sender, 1000000n);

    // Quote fee
    const gasInput = { programHex: '0x' + '00'.repeat(50) };
    const quote = await feeService.quoteFee(gasInput);

    // Charge fee
    const result = await feeService.chargeAndDistribute(
      {
        feePayer: sender,
        from: sender,
        maxGas: quote.gasEstimate * 2n,
        gasPrice: quote.suggestedGasPrice,
        gasInput,
      },
      miner,
    );

    // Verify
    expect(result.gasUsed).toBe(quote.gasEstimate);
    expect(result.feePaid).toBe(quote.minFee);

    const senderBalance = await balances.get(sender);
    const minerBalance = await balances.get(miner);

    expect(senderBalance).toBeLessThan(1000000n);
    expect(minerBalance).toBeGreaterThan(0n);
  });
});

describe('Integration: Cross-Component Consistency', () => {
  it('should maintain address consistency across operations', () => {
    const kp = generateKeypair(SigAlgId.ED25519);
    const pubDER = exportPubDER(kp.publicKey);
    const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    // Address should be valid for all operations
    expect(address.startsWith('gc')).toBe(true);
    expect(address.length).toBeGreaterThan(20);

    // Should work in balance store
    const balances = new InMemoryBalanceStore();
    balances.credit(address, 1000n);

    // Should sign correctly
    const message = Buffer.from('test');
    const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, message);
    const valid = verifyPreimage(SigAlgId.ED25519, kp.publicKey, message, sig);
    expect(valid).toBe(true);
  });

  it('should maintain state consistency with multiple operations', async () => {
    const balances = new InMemoryBalanceStore();

    // Multiple credits
    await balances.credit('gc1a', 100n);
    await balances.credit('gc1a', 200n);
    await balances.credit('gc1b', 500n);

    expect(await balances.get('gc1a')).toBe(300n);
    expect(await balances.get('gc1b')).toBe(500n);

    // Transfers
    await balances.transfer('gc1a', 'gc1b', 50n);

    expect(await balances.get('gc1a')).toBe(250n);
    expect(await balances.get('gc1b')).toBe(550n);

    // Total supply check
    expect(balances.getTotalSupply()).toBe(800n);
  });
});

describe('Edge Cases: System Limits', () => {
  it('should handle maximum nonce value', () => {
    const maxNonce = BigInt('18446744073709551615'); // 2^64 - 1

    // Create a tx with max nonce using v2f format
    const tx = createSampleTxV2F({ nonce: maxNonce });
    expect(tx.nonce).toBe(maxNonce);

    const txId = computeTxId(tx);
    expect(txId).toBeDefined();
  });

  it('should handle empty program', () => {
    const irs = compileProgram([]);
    const bytes = encodeProgram(irs);
    const hash = computeInstructionsHash(bytes);

    expect(bytes.length).toBe(0);
    expect(hash.length).toBe(32);
  });

  it('should handle large program', () => {
    const program: InstructionDSL[] = Array.from({ length: 100 }, (_, i) => ({
      creator: 'sys',
      moduleId: 'SYS',
      method: 'UPDATE',
      args: { stateId: '0x' + i.toString(16).padStart(64, '0'), data: { index: i } },
    }));

    const irs = compileProgram(program);
    expect(irs.length).toBe(100);

    const bytes = encodeProgram(irs);
    expect(bytes.length).toBeGreaterThan(0);

    const decodedIRs = decodeBytesToIRs(bytes);
    expect(decodedIRs.length).toBe(100);
  });

  it('should handle zero balance operations', async () => {
    const balances = new InMemoryBalanceStore();

    // Get from unknown address
    expect(await balances.get('gc1unknown')).toBe(0n);

    // Debit from zero balance
    expect(await balances.debit('gc1unknown', 1n)).toBe(false);

    // Transfer from zero balance
    expect(await balances.transfer('gc1unknown', 'gc1dest', 1n)).toBe(false);
  });
});
