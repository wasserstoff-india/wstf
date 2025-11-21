/**
 * Instructions & Executor Comprehensive Unit Tests
 *
 * Tests IR compilation, decoding, and execution with positive/negative cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { compileProgram, InstructionDSL } from './compiler';
import { decodeProgram as decodeIRsToDSL, decodeInstruction } from './decoder';
import {
  computeInstructionsHash,
  encodeIR,
  decodeIR,
  encodeProgram,
  decodeProgram as decodeBytesToIRs,
  InstructionRecord,
} from './abi';

describe('Instructions: ABI Encoding', () => {
  describe('Encode IR', () => {
    it('should encode InstructionRecord', () => {
      const ir: InstructionRecord = {
        ver: 1,
        flags: 0,
        creatorPkHash20: Buffer.alloc(20, 0),
        moduleId16: Buffer.alloc(16, 0),
        selector4: 1,
        args: { stateId: 'test', type: 'account' },
      };

      const encoded = encodeIR(ir);
      expect(Buffer.isBuffer(encoded)).toBe(true);
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should encode IR with empty args', () => {
      const ir: InstructionRecord = {
        ver: 1,
        flags: 0,
        creatorPkHash20: Buffer.alloc(20, 0),
        moduleId16: Buffer.alloc(16, 0),
        selector4: 1,
        args: {},
      };

      const encoded = encodeIR(ir);
      expect(Buffer.isBuffer(encoded)).toBe(true);
    });

    it('should encode IR with nested args', () => {
      const ir: InstructionRecord = {
        ver: 1,
        flags: 0,
        creatorPkHash20: Buffer.alloc(20, 0),
        moduleId16: Buffer.alloc(16, 0),
        selector4: 3,
        args: {
          patch: { op: 'put', key: 'balance', value: { amount: 1000 } },
        },
      };

      const encoded = encodeIR(ir);
      expect(Buffer.isBuffer(encoded)).toBe(true);
    });
  });

  describe('Decode IR', () => {
    it('should roundtrip InstructionRecord', () => {
      const ir: InstructionRecord = {
        ver: 1,
        flags: 0,
        creatorPkHash20: Buffer.alloc(20, 0xaa),
        moduleId16: Buffer.alloc(16, 0xbb),
        selector4: 1,
        args: { stateId: 'test', type: 'account' },
      };

      const encoded = encodeIR(ir);
      const { ir: decoded } = decodeIR(encoded);

      expect(decoded.ver).toBe(ir.ver);
      expect(decoded.flags).toBe(ir.flags);
      expect(decoded.selector4).toBe(ir.selector4);
      expect(decoded.args.stateId).toBe(ir.args.stateId);
    });

    it('should decode IR with numeric args', () => {
      const ir: InstructionRecord = {
        ver: 1,
        flags: 0,
        creatorPkHash20: Buffer.alloc(20, 0),
        moduleId16: Buffer.alloc(16, 0),
        selector4: 2,
        args: { data: { balance: 1000, nonce: 0 } },
      };

      const encoded = encodeIR(ir);
      const { ir: decoded } = decodeIR(encoded);

      expect(decoded.args.data.balance).toBe(1000);
      expect(decoded.args.data.nonce).toBe(0);
    });
  });

  describe('Instructions hash', () => {
    it('should compute deterministic hash', () => {
      const program = Buffer.from('test program bytes');
      const hash1 = computeInstructionsHash(program);
      const hash2 = computeInstructionsHash(program);

      expect(hash1.equals(hash2)).toBe(true);
    });

    it('should produce 32 byte hash', () => {
      const program = Buffer.from('test');
      const hash = computeInstructionsHash(program);
      expect(hash.length).toBe(32);
    });

    it('should differ for different programs', () => {
      const hash1 = computeInstructionsHash(Buffer.from('program1'));
      const hash2 = computeInstructionsHash(Buffer.from('program2'));

      expect(hash1.equals(hash2)).toBe(false);
    });

    it('should compute hash for empty program', () => {
      const hash = computeInstructionsHash(Buffer.alloc(0));
      expect(hash.length).toBe(32);
    });
  });
});

describe('Instructions: Compiler', () => {
  describe('Compile program', () => {
    it('should compile single instruction to IR array', () => {
      const program: InstructionDSL[] = [
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'REG',
          args: {
            stateId: '0x' + 'aa'.repeat(32),
            type: 'account',
            owner: 'gc1' + '00'.repeat(22),
          },
        },
      ];

      const irs = compileProgram(program);
      expect(Array.isArray(irs)).toBe(true);
      expect(irs.length).toBe(1);
      expect(irs[0].selector4).toBeDefined();
    });

    it('should encode IR array to Buffer', () => {
      const program: InstructionDSL[] = [
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'REG',
          args: {
            stateId: '0x' + 'aa'.repeat(32),
            type: 'account',
          },
        },
      ];

      const irs = compileProgram(program);
      const encoded = encodeProgram(irs);
      expect(Buffer.isBuffer(encoded)).toBe(true);
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should compile multiple instructions', () => {
      const program: InstructionDSL[] = [
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'REG',
          args: { stateId: '0x' + 'aa'.repeat(32), type: 'account' },
        },
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'INIT',
          args: {
            stateId: '0x' + 'aa'.repeat(32),
            expectedVersion: '0x' + '00'.repeat(32),
            data: { balance: 100 },
          },
        },
      ];

      const irs = compileProgram(program);
      expect(irs.length).toBe(2);

      const encoded = encodeProgram(irs);
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should compile empty program', () => {
      const irs = compileProgram([]);
      expect(Array.isArray(irs)).toBe(true);
      expect(irs.length).toBe(0);

      const encoded = encodeProgram(irs);
      expect(Buffer.isBuffer(encoded)).toBe(true);
      expect(encoded.length).toBe(0);
    });

    it('should produce deterministic output', () => {
      const program: InstructionDSL[] = [
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'REG',
          args: { stateId: '0x' + 'aa'.repeat(32) },
        },
      ];

      const irs1 = compileProgram(program);
      const irs2 = compileProgram(program);

      const encoded1 = encodeProgram(irs1);
      const encoded2 = encodeProgram(irs2);

      expect(encoded1.toString('hex')).toBe(encoded2.toString('hex'));
    });
  });
});

describe('Instructions: Decoder', () => {
  describe('Decode program', () => {
    it('should roundtrip compiled program', () => {
      const original: InstructionDSL[] = [
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'REG',
          args: {
            stateId: '0x' + 'aa'.repeat(32),
            type: 'account',
          },
        },
      ];

      // DSL -> IRs -> Buffer -> IRs -> DSL
      const irs = compileProgram(original);
      const encoded = encodeProgram(irs);
      const decodedIRs = decodeBytesToIRs(encoded);
      const decoded = decodeIRsToDSL(decodedIRs);

      expect(decoded.length).toBe(original.length);
      expect(decoded[0].creator).toBe(original[0].creator);
      expect(decoded[0].moduleId).toBe(original[0].moduleId);
      expect(decoded[0].method).toBe(original[0].method);
    });

    it('should decode multi-instruction program', () => {
      const original: InstructionDSL[] = [
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'REG',
          args: { stateId: '0x' + 'aa'.repeat(32) },
        },
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'INIT',
          args: { stateId: '0x' + 'aa'.repeat(32), data: {} },
        },
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: 'UPDATE',
          args: { stateId: '0x' + 'aa'.repeat(32), patch: {} },
        },
      ];

      const irs = compileProgram(original);
      const encoded = encodeProgram(irs);
      const decodedIRs = decodeBytesToIRs(encoded);
      const decoded = decodeIRsToDSL(decodedIRs);

      expect(decoded.length).toBe(3);
      expect(decoded[0].method).toBe('REG');
      expect(decoded[1].method).toBe('INIT');
      expect(decoded[2].method).toBe('UPDATE');
    });

    it('should decode empty program', () => {
      const irs = compileProgram([]);
      const encoded = encodeProgram(irs);
      const decodedIRs = decodeBytesToIRs(encoded);

      expect(decodedIRs.length).toBe(0);
    });
  });

  describe('Decode single instruction', () => {
    it('should decode single IR from buffer', () => {
      const ir: InstructionRecord = {
        ver: 1,
        flags: 0,
        creatorPkHash20: Buffer.alloc(20, 0),
        moduleId16: Buffer.alloc(16, 0),
        selector4: 5,
        args: { algo: 'ed25519' },
      };

      const encoded = encodeIR(ir);
      const { ir: decoded, bytesRead } = decodeIR(encoded);

      expect(decoded.selector4).toBe(5);
      expect(decoded.args.algo).toBe('ed25519');
      expect(bytesRead).toBeGreaterThan(0);
    });
  });
});

describe('Instructions: SYS Module Opcodes', () => {
  const OPCODES = ['REG', 'INIT', 'UPDATE', 'SIGN', 'VERIFY', 'RENT', 'XVAL'];

  OPCODES.forEach(opcode => {
    it(`should compile and decode SYS.${opcode}`, () => {
      const program: InstructionDSL[] = [
        {
          creator: 'sys',
          moduleId: 'SYS',
          method: opcode,
          args: { test: 'value' },
        },
      ];

      const irs = compileProgram(program);
      const encoded = encodeProgram(irs);
      const decodedIRs = decodeBytesToIRs(encoded);
      const decoded = decodeIRsToDSL(decodedIRs);

      expect(decoded.length).toBe(1);
      expect(decoded[0].method).toBe(opcode);
    });
  });
});

describe('Instructions: Edge Cases', () => {
  it('should handle IR with very long args', () => {
    const ir: InstructionRecord = {
      ver: 1,
      flags: 0,
      creatorPkHash20: Buffer.alloc(20, 0),
      moduleId16: Buffer.alloc(16, 0),
      selector4: 3,
      args: {
        data: {
          longString: 'a'.repeat(10000),
          nestedArray: Array(100).fill({ key: 'value' }),
        },
      },
    };

    const encoded = encodeIR(ir);
    const { ir: decoded } = decodeIR(encoded);

    expect(decoded.args.data.longString.length).toBe(10000);
    expect(decoded.args.data.nestedArray.length).toBe(100);
  });

  it('should handle special characters in string args', () => {
    const ir: InstructionRecord = {
      ver: 1,
      flags: 0,
      creatorPkHash20: Buffer.alloc(20, 0),
      moduleId16: Buffer.alloc(16, 0),
      selector4: 4,
      args: {
        message: 'hello\nworld\t\r',
        unicode: '🎉 emoji 中文',
      },
    };

    const encoded = encodeIR(ir);
    const { ir: decoded } = decodeIR(encoded);

    expect(decoded.args.message).toBe(ir.args.message);
    expect(decoded.args.unicode).toBe(ir.args.unicode);
  });

  it('should handle boolean args', () => {
    const ir: InstructionRecord = {
      ver: 1,
      flags: 0,
      creatorPkHash20: Buffer.alloc(20, 0),
      moduleId16: Buffer.alloc(16, 0),
      selector4: 3,
      args: {
        active: true,
        deleted: false,
      },
    };

    const encoded = encodeIR(ir);
    const { ir: decoded } = decodeIR(encoded);

    expect(decoded.args.active).toBe(true);
    expect(decoded.args.deleted).toBe(false);
  });

  it('should handle null args', () => {
    const ir: InstructionRecord = {
      ver: 1,
      flags: 0,
      creatorPkHash20: Buffer.alloc(20, 0),
      moduleId16: Buffer.alloc(16, 0),
      selector4: 3,
      args: {
        value: null,
      },
    };

    const encoded = encodeIR(ir);
    const { ir: decoded } = decodeIR(encoded);

    expect(decoded.args.value).toBeNull();
  });
});
