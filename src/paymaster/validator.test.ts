/**
 * Paymaster Validator Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PaymasterValidator } from './validator';

describe('PaymasterValidator', () => {
  let validator: PaymasterValidator;

  beforeEach(() => {
    validator = new PaymasterValidator({ enabled: true });
  });

  describe('Paymaster registration', () => {
    it('should register a paymaster', () => {
      const result = validator.registerPaymaster('pm1', 10000n);
      expect(result.ok).toBe(true);

      const pm = validator.getPaymaster('pm1');
      expect(pm).toBeDefined();
      expect(pm?.balance).toBe(10000n);
    });

    it('should reject duplicate registration', () => {
      validator.registerPaymaster('pm1', 10000n);
      const result = validator.registerPaymaster('pm1', 5000n);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('already registered');
    });

    it('should fail when disabled', () => {
      const disabled = new PaymasterValidator({ enabled: false });
      const result = disabled.registerPaymaster('pm1', 10000n);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('disabled');
    });
  });

  describe('Deposits and withdrawals', () => {
    beforeEach(() => {
      validator.registerPaymaster('pm1', 10000n);
    });

    it('should deposit to paymaster', () => {
      const result = validator.deposit('pm1', 5000n);
      expect(result.ok).toBe(true);
      expect(validator.getPaymaster('pm1')?.balance).toBe(15000n);
    });

    it('should fail deposit to unknown paymaster', () => {
      const result = validator.deposit('unknown', 5000n);
      expect(result.ok).toBe(false);
    });

    it('should withdraw from paymaster', () => {
      const result = validator.withdraw('pm1', 3000n);
      expect(result.ok).toBe(true);
      expect(validator.getPaymaster('pm1')?.balance).toBe(7000n);
    });

    it('should fail withdrawal exceeding balance', () => {
      const result = validator.withdraw('pm1', 20000n);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Insufficient');
    });
  });

  describe('Voucher creation', () => {
    beforeEach(() => {
      validator.registerPaymaster('pm1', 10000n);
    });

    it('should create a voucher', () => {
      const result = validator.createVoucher('pm1', {
        beneficiary: 'user1',
        maxGas: 5000n,
      }, 100n);

      expect(result.ok).toBe(true);
      expect(result.voucher).toBeDefined();
      expect(result.voucher?.beneficiary).toBe('user1');
      expect(result.voucher?.maxGas).toBe(5000n);
      expect(result.voucher?.active).toBe(true);
    });

    it('should fail for unknown paymaster', () => {
      const result = validator.createVoucher('unknown', {
        beneficiary: 'user1',
        maxGas: 5000n,
      }, 100n);

      expect(result.ok).toBe(false);
    });

    it('should fail when exceeding max gas per voucher', () => {
      const result = validator.createVoucher('pm1', {
        beneficiary: 'user1',
        maxGas: 10_000_000n, // Exceeds default 1M limit
      }, 100n);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Max gas per voucher');
    });

    it('should set expiration', () => {
      const result = validator.createVoucher('pm1', {
        beneficiary: 'user1',
        maxGas: 5000n,
        expiresAt: 200n,
      }, 100n);

      expect(result.voucher?.expiresAt).toBe(200n);
    });

    it('should support single-use vouchers', () => {
      const result = validator.createVoucher('pm1', {
        beneficiary: 'user1',
        maxGas: 5000n,
        singleUse: true,
      }, 100n);

      expect(result.voucher?.singleUse).toBe(true);
    });
  });

  describe('Voucher revocation', () => {
    let voucherId: string;

    beforeEach(() => {
      validator.registerPaymaster('pm1', 10000n);
      const result = validator.createVoucher('pm1', {
        beneficiary: 'user1',
        maxGas: 5000n,
      }, 100n);
      voucherId = result.voucher!.id;
    });

    it('should revoke voucher', () => {
      const result = validator.revokeVoucher(voucherId, 'pm1');
      expect(result.ok).toBe(true);
      expect(validator.getVoucher(voucherId)?.active).toBe(false);
    });

    it('should fail for wrong paymaster', () => {
      validator.registerPaymaster('pm2', 10000n);
      const result = validator.revokeVoucher(voucherId, 'pm2');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Not authorized');
    });

    it('should fail for unknown voucher', () => {
      const result = validator.revokeVoucher('unknown', 'pm1');
      expect(result.ok).toBe(false);
    });
  });

  describe('Sponsorship validation', () => {
    let voucherId: string;

    beforeEach(() => {
      validator.registerPaymaster('pm1', 10000n);
      const result = validator.createVoucher('pm1', {
        beneficiary: 'user1',
        maxGas: 5000n,
      }, 100n);
      voucherId = result.voucher!.id;
    });

    it('should validate valid sponsorship', () => {
      const result = validator.validateSponsorship('user1', 'pm1', 1000n, 100n);
      expect(result.valid).toBe(true);
      expect(result.voucher).toBeDefined();
    });

    it('should reject unknown paymaster', () => {
      const result = validator.validateSponsorship('user1', 'unknown', 1000n, 100n);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should reject sender without voucher', () => {
      const result = validator.validateSponsorship('user2', 'pm1', 1000n, 100n);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No vouchers');
    });

    it('should reject gas exceeding voucher limit', () => {
      const result = validator.validateSponsorship('user1', 'pm1', 10000n, 100n);
      expect(result.valid).toBe(false);
    });

    it('should reject when paymaster has insufficient balance', () => {
      validator.withdraw('pm1', 9500n); // Leave only 500
      const result = validator.validateSponsorship('user1', 'pm1', 1000n, 100n);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('insufficient balance');
    });

    it('should reject expired voucher', () => {
      const result = validator.validateSponsorship('user1', 'pm1', 1000n, 20000n);
      expect(result.valid).toBe(false);
    });
  });

  describe('Using vouchers', () => {
    let voucherId: string;

    beforeEach(() => {
      validator.registerPaymaster('pm1', 10000n);
      const result = validator.createVoucher('pm1', {
        beneficiary: 'user1',
        maxGas: 5000n,
      }, 100n);
      voucherId = result.voucher!.id;
    });

    it('should use voucher for sponsorship', () => {
      const result = validator.useVoucher(voucherId, 1000n, 'txhash1', 100n);
      expect(result.sponsored).toBe(true);
      expect(result.gasSponsored).toBe(1000n);

      // Check voucher gas updated
      const voucher = validator.getVoucher(voucherId);
      expect(voucher?.usedGas).toBe(1000n);

      // Check paymaster balance deducted
      const pm = validator.getPaymaster('pm1');
      expect(pm?.balance).toBe(9000n);
      expect(pm?.totalSponsored).toBe(1000n);
    });

    it('should deactivate single-use voucher after use', () => {
      // Create single-use voucher
      const singleUse = validator.createVoucher('pm1', {
        beneficiary: 'user2',
        maxGas: 5000n,
        singleUse: true,
      }, 100n);

      validator.useVoucher(singleUse.voucher!.id, 500n, 'txhash2', 100n);

      expect(validator.getVoucher(singleUse.voucher!.id)?.active).toBe(false);
    });

    it('should fail for inactive voucher', () => {
      validator.revokeVoucher(voucherId, 'pm1');
      const result = validator.useVoucher(voucherId, 1000n, 'txhash1', 100n);
      expect(result.sponsored).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should fail for expired voucher', () => {
      const result = validator.useVoucher(voucherId, 1000n, 'txhash1', 20000n);
      expect(result.sponsored).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should fail for insufficient voucher gas', () => {
      validator.useVoucher(voucherId, 4000n, 'txhash1', 100n);
      const result = validator.useVoucher(voucherId, 2000n, 'txhash2', 100n);
      expect(result.sponsored).toBe(false);
      expect(result.error).toContain('Insufficient');
    });

    it('should log usage', () => {
      validator.useVoucher(voucherId, 1000n, 'txhash1', 100n);
      validator.useVoucher(voucherId, 500n, 'txhash2', 101n);

      const log = validator.getUsageLog();
      expect(log.length).toBe(2);
      expect(log[0].txHash).toBe('txhash2'); // Most recent first
    });
  });

  describe('Querying vouchers', () => {
    beforeEach(() => {
      validator.registerPaymaster('pm1', 10000n);
      validator.registerPaymaster('pm2', 10000n);

      validator.createVoucher('pm1', { beneficiary: 'user1', maxGas: 1000n }, 100n);
      validator.createVoucher('pm1', { beneficiary: 'user1', maxGas: 2000n }, 100n);
      validator.createVoucher('pm2', { beneficiary: 'user1', maxGas: 3000n }, 100n);
      validator.createVoucher('pm1', { beneficiary: 'user2', maxGas: 4000n }, 100n);
    });

    it('should get vouchers for beneficiary', () => {
      const vouchers = validator.getVouchersForBeneficiary('user1');
      expect(vouchers.length).toBe(3);
    });

    it('should get vouchers for paymaster', () => {
      const vouchers = validator.getVouchersForPaymaster('pm1');
      expect(vouchers.length).toBe(3);
    });
  });

  describe('Stats and cleanup', () => {
    beforeEach(() => {
      validator.registerPaymaster('pm1', 10000n);
      validator.createVoucher('pm1', { beneficiary: 'user1', maxGas: 1000n, expiresAt: 50n }, 0n);
      validator.createVoucher('pm1', { beneficiary: 'user2', maxGas: 2000n, expiresAt: 150n }, 0n);
    });

    it('should get stats', () => {
      const stats = validator.getStats();
      expect(stats.totalPaymasters).toBe(1);
      expect(stats.totalVouchers).toBe(2);
      expect(stats.activeVouchers).toBe(2);
      expect(stats.totalDeposited).toBe(10000n);
    });

    it('should cleanup expired vouchers', () => {
      const cleaned = validator.cleanupExpired(100n);
      expect(cleaned).toBe(1);

      const stats = validator.getStats();
      expect(stats.activeVouchers).toBe(1);
    });
  });
});
