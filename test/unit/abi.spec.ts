import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { compileInstruction } from '../../src/instructions/compiler';
import { encodeIR, decodeIR, encodeProgram, decodeProgram } from '../../src/instructions/abi';
import { decodeInstruction } from '../../src/instructions/decoder';

describe('ABI Golden Vectors', () => {
  const vectorsDir = join(__dirname, '../vectors/m2/abi');

  it('REG: compile → encode → decode roundtrip', () => {
    const vector = JSON.parse(readFileSync(join(vectorsDir, 'reg.json'), 'utf-8'));
    const dsl = vector.dsl;

    // Compile DSL to IR
    const ir = compileInstruction(dsl);
    expect(ir.ver).toBe(0x01);
    expect(ir.selector4).toBe(0x00000001); // REG

    // Encode to bytes
    const bytes = encodeIR(ir);
    expect(bytes.length).toBeGreaterThan(0);

    // Decode back
    const { ir: decoded } = decodeIR(bytes);
    expect(decoded.ver).toBe(ir.ver);
    expect(decoded.selector4).toBe(ir.selector4);
    expect(decoded.args).toEqual(ir.args);

    // Re-encode must be identical
    const bytes2 = encodeIR(decoded);
    expect(bytes2.equals(bytes)).toBe(true);
  });

  it('INIT: compile → encode → decode roundtrip', () => {
    const vector = JSON.parse(readFileSync(join(vectorsDir, 'init.json'), 'utf-8'));
    const dsl = vector.dsl;

    const ir = compileInstruction(dsl);
    expect(ir.selector4).toBe(0x00000002); // INIT

    const bytes = encodeIR(ir);
    const { ir: decoded } = decodeIR(bytes);
    expect(decoded.args).toEqual(ir.args);

    const bytes2 = encodeIR(decoded);
    expect(bytes2.equals(bytes)).toBe(true);
  });

  it('VERIFY: compile → encode → decode roundtrip with flags', () => {
    const vector = JSON.parse(readFileSync(join(vectorsDir, 'verify.json'), 'utf-8'));
    const dsl = vector.dsl;

    const ir = compileInstruction(dsl);
    expect(ir.selector4).toBe(0x00000006); // VERIFY
    expect(ir.flags & 0x01).toBe(0x01); // readOnly flag

    const bytes = encodeIR(ir);
    const { ir: decoded } = decodeIR(bytes);
    expect(decoded.flags).toBe(ir.flags);
    expect(decoded.args).toEqual(ir.args);

    const bytes2 = encodeIR(decoded);
    expect(bytes2.equals(bytes)).toBe(true);
  });

  it('Program: multiple instructions encode/decode', () => {
    const reg = JSON.parse(readFileSync(join(vectorsDir, 'reg.json'), 'utf-8')).dsl;
    const init = JSON.parse(readFileSync(join(vectorsDir, 'init.json'), 'utf-8')).dsl;

    const ir1 = compileInstruction(reg);
    const ir2 = compileInstruction(init);

    const programBytes = encodeProgram([ir1, ir2]);
    const decoded = decodeProgram(programBytes);

    expect(decoded.length).toBe(2);
    expect(decoded[0].selector4).toBe(0x00000001);
    expect(decoded[1].selector4).toBe(0x00000002);

    // Re-encode must be identical
    const programBytes2 = encodeProgram(decoded);
    expect(programBytes2.equals(programBytes)).toBe(true);
  });
});

describe('ABI Edge Cases', () => {
  it('Empty program decodes to empty array', () => {
    const programBytes = Buffer.alloc(0);
    const decoded = decodeProgram(programBytes);
    expect(decoded).toEqual([]);
  });

  it('Rejects truncated IR buffer', () => {
    const dsl = { creator: 'sys', moduleId: 'SYS', method: 'REG', args: { stateId: '00'.repeat(32), type: 'test', owner: 'gc2test' } };
    const ir = compileInstruction(dsl);
    const bytes = encodeIR(ir);

    // Truncate the buffer
    const truncated = bytes.slice(0, bytes.length - 10);

    expect(() => decodeIR(truncated)).toThrow();
  });
});

describe('CBOR Determinism', () => {
  it('Same IR with same args produces identical bytes', () => {
    const dsl = {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'INIT',
      args: { stateId: '00'.repeat(32), expectedVersion: '00'.repeat(32), data: { a: 1, b: 2 } }
    };

    const ir1 = compileInstruction(dsl);
    const ir2 = compileInstruction(dsl);

    const bytes1 = encodeIR(ir1);
    const bytes2 = encodeIR(ir2);

    // Same input should always produce same bytes
    expect(bytes1.equals(bytes2)).toBe(true);
  });

  it('Decode → re-encode is stable', () => {
    const dsl = {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'UPDATE',
      args: { stateId: '00'.repeat(32), expectedVersion: '11'.repeat(32), patch: { op: 'put', kv: [['key', 'value']] } }
    };

    const ir = compileInstruction(dsl);
    const bytes1 = encodeIR(ir);

    // Decode and re-encode 10 times
    let currentBytes = bytes1;
    for (let i = 0; i < 10; i++) {
      const { ir: decoded } = decodeIR(currentBytes);
      currentBytes = encodeIR(decoded);
    }

    expect(currentBytes.equals(bytes1)).toBe(true);
  });
});
