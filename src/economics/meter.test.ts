/**
 * Gas Meter Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { estimateGas, costOfInstruction, GasMeter, GasInstruction } from './meter';
import { DEFAULT_GAS_SCHEDULE } from './types';

describe('Gas Estimation', () => {
  it('should calculate base gas for empty input', () => {
    const gas = estimateGas({});
    expect(gas).toBe(DEFAULT_GAS_SCHEDULE.base);
  });

  it('should add per-byte cost for program hex', () => {
    const gas = estimateGas({ programHex: '0x' + '00'.repeat(100) });
    expect(gas).toBe(DEFAULT_GAS_SCHEDULE.base + 100n * DEFAULT_GAS_SCHEDULE.perByte);
  });

  it('should calculate SYS.REG cost', () => {
    const ins: GasInstruction = { selector: 'SYS.REG' };
    const cost = costOfInstruction(ins, DEFAULT_GAS_SCHEDULE);
    expect(cost).toBe(DEFAULT_GAS_SCHEDULE.ops.SYS_REG);
  });

  it('should calculate SYS.UPDATE put cost', () => {
    const ins: GasInstruction = {
      selector: 'SYS.UPDATE',
      args: { patch: { op: 'put', totalBytes: 64 } }
    };
    const cost = costOfInstruction(ins, DEFAULT_GAS_SCHEDULE);
    // base + per32 * ceil(64/32) = base + per32 * 2
    const expected = DEFAULT_GAS_SCHEDULE.ops.SYS_UPDATE_PUT.base +
      DEFAULT_GAS_SCHEDULE.ops.SYS_UPDATE_PUT.per32 * 2n;
    expect(cost).toBe(expected);
  });

  it('should calculate SYS.UPDATE delete cost', () => {
    const ins: GasInstruction = {
      selector: 'SYS.UPDATE',
      args: { patch: { op: 'delete', totalBytes: 0 } }
    };
    const cost = costOfInstruction(ins, DEFAULT_GAS_SCHEDULE);
    expect(cost).toBe(DEFAULT_GAS_SCHEDULE.ops.SYS_UPDATE_DELETE);
  });

  it('should calculate SYS.VERIFY ed25519 cost', () => {
    const ins: GasInstruction = {
      selector: 'SYS.VERIFY',
      args: { algo: 'ed25519' }
    };
    const cost = costOfInstruction(ins, DEFAULT_GAS_SCHEDULE);
    expect(cost).toBe(DEFAULT_GAS_SCHEDULE.ops.SYS_VERIFY_ED25519);
  });

  it('should calculate SYS.VERIFY secp256k1 cost', () => {
    const ins: GasInstruction = {
      selector: 'SYS.VERIFY',
      args: { algo: 'secp256k1' }
    };
    const cost = costOfInstruction(ins, DEFAULT_GAS_SCHEDULE);
    expect(cost).toBe(DEFAULT_GAS_SCHEDULE.ops.SYS_VERIFY_SECP256K1);
  });
});

describe('GasMeter', () => {
  it('should track gas usage', () => {
    const meter = new GasMeter(10000n);
    meter.charge({ selector: 'SYS.REG' });
    expect(meter.getUsed()).toBe(DEFAULT_GAS_SCHEDULE.ops.SYS_REG);
  });

  it('should throw OOG when limit exceeded', () => {
    const meter = new GasMeter(100n);
    expect(() => {
      meter.charge({ selector: 'SYS.REG' }); // 800 gas > 100 limit
    }).toThrow('OOG');
  });

  it('should track remaining gas', () => {
    const meter = new GasMeter(10000n);
    meter.chargeRaw(500n);
    expect(meter.getRemaining()).toBe(9500n);
  });

  it('should detect out of gas state', () => {
    const meter = new GasMeter(100n);
    try {
      meter.chargeRaw(150n);
    } catch {
      // Expected OOG error
    }
    expect(meter.isOutOfGas()).toBe(true);
  });
});
