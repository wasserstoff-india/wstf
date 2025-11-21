/**
 * Economics Comprehensive Unit Tests
 *
 * Tests fee service, rent collector, and balance management.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FeeService, FeeChargeRequest } from './fees';
import { RentCollector, InMemoryRentStore, RentCollectionResult } from './rent';
import { InMemoryBalanceStore } from './balances';
import { DEFAULT_FEE_CONFIG, DEFAULT_RENT_CONFIG, DEFAULT_GAS_SCHEDULE, Hex32 } from './types';

describe('Economics: Fee Service', () => {
  let balances: InMemoryBalanceStore;
  let feeService: FeeService;

  beforeEach(() => {
    balances = new InMemoryBalanceStore();
    feeService = new FeeService(balances, { enabled: true });
  });

  describe('Fee validation', () => {
    it('should validate valid fee request', async () => {
      await balances.credit('gc1alice', 1000000n);

      const request: FeeChargeRequest = {
        feePayer: 'gc1alice',
        from: 'gc1alice',
        maxGas: 10000n,
        gasPrice: DEFAULT_FEE_CONFIG.minGasPrice,
        gasInput: {},
      };

      const result = feeService.validateFees(request);
      expect(result.ok).toBe(true);
    });

    it('should reject when fees disabled', () => {
      const disabledService = new FeeService(balances, { enabled: false });

      const request: FeeChargeRequest = {
        feePayer: 'gc1alice',
        from: 'gc1alice',
        maxGas: 10000n,
        gasPrice: 1000n,
        gasInput: {},
      };

      const result = disabledService.validateFees(request);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('FEES_DISABLED');
    });

    it('should reject gas price below minimum', () => {
      const request: FeeChargeRequest = {
        feePayer: 'gc1alice',
        from: 'gc1alice',
        maxGas: 10000n,
        gasPrice: 0n, // Below minimum
        gasInput: {},
      };

      const result = feeService.validateFees(request);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('GAS_PRICE_TOO_LOW');
    });

    it('should reject insufficient max gas', () => {
      const request: FeeChargeRequest = {
        feePayer: 'gc1alice',
        from: 'gc1alice',
        maxGas: 1n, // Too low for base gas
        gasPrice: 1000n,
        gasInput: {},
      };

      const result = feeService.validateFees(request);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_MAX_GAS');
    });

    it('should reject sponsorship when not allowed', () => {
      const noSponsorService = new FeeService(balances, {
        enabled: true,
        allowSponsorship: false,
      });

      const request: FeeChargeRequest = {
        feePayer: 'gc1sponsor',
        from: 'gc1alice',
        maxGas: 10000n,
        gasPrice: 1000n,
        gasInput: {},
      };

      const result = noSponsorService.validateFees(request);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('SPONSOR_NOT_ALLOWED');
    });
  });

  describe('Fee charging', () => {
    it('should charge and distribute fees', async () => {
      await balances.credit('gc1alice', 1000000n);

      const request: FeeChargeRequest = {
        feePayer: 'gc1alice',
        from: 'gc1alice',
        maxGas: 10000n,
        gasPrice: DEFAULT_FEE_CONFIG.minGasPrice,
        gasInput: {},
      };

      const result = await feeService.chargeAndDistribute(request, 'gc1miner');

      expect(result.gasUsed).toBe(DEFAULT_GAS_SCHEDULE.base);
      expect(result.feePaid).toBeGreaterThan(0n);
      expect(result.credits.miner).toBeGreaterThan(0n);
    });

    it('should fail on insufficient funds', async () => {
      await balances.credit('gc1alice', 1n); // Not enough

      const request: FeeChargeRequest = {
        feePayer: 'gc1alice',
        from: 'gc1alice',
        maxGas: 10000n,
        gasPrice: 1000n,
        gasInput: {},
      };

      await expect(
        feeService.chargeAndDistribute(request, 'gc1miner'),
      ).rejects.toThrow('INSUFFICIENT_FUNDS');
    });

    it('should credit miner correctly', async () => {
      await balances.credit('gc1alice', 1000000n);
      const initialMinerBalance = await balances.get('gc1miner');

      const request: FeeChargeRequest = {
        feePayer: 'gc1alice',
        from: 'gc1alice',
        maxGas: 10000n,
        gasPrice: DEFAULT_FEE_CONFIG.minGasPrice,
        gasInput: {},
      };

      await feeService.chargeAndDistribute(request, 'gc1miner');

      const newMinerBalance = await balances.get('gc1miner');
      expect(newMinerBalance).toBeGreaterThan(initialMinerBalance);
    });
  });

  describe('Fee quoting', () => {
    it('should quote fee for empty input', async () => {
      const quote = await feeService.quoteFee({});

      expect(quote.gasEstimate).toBe(DEFAULT_GAS_SCHEDULE.base);
      expect(quote.minFee).toBeGreaterThan(0n);
      expect(quote.suggestedGasPrice).toBeDefined();
    });

    it('should quote higher fee for larger program', async () => {
      const smallQuote = await feeService.quoteFee({ programHex: '0x' + '00'.repeat(10) });
      const largeQuote = await feeService.quoteFee({ programHex: '0x' + '00'.repeat(1000) });

      expect(largeQuote.gasEstimate).toBeGreaterThan(smallQuote.gasEstimate);
      expect(largeQuote.minFee).toBeGreaterThan(smallQuote.minFee);
    });
  });

  describe('Stats tracking', () => {
    it('should track fee collection stats', async () => {
      await balances.credit('gc1alice', 10000000n);

      const request: FeeChargeRequest = {
        feePayer: 'gc1alice',
        from: 'gc1alice',
        maxGas: 10000n,
        gasPrice: DEFAULT_FEE_CONFIG.minGasPrice,
        gasInput: {},
      };

      await feeService.chargeAndDistribute(request, 'gc1miner');
      await feeService.chargeAndDistribute(request, 'gc1miner');

      const stats = feeService.getStats();
      expect(stats.totalFeesCollected).toBeGreaterThan(0n);
      expect(stats.totalGasConsumed).toBeGreaterThan(0n);
    });

    it('should track insufficient funds count', async () => {
      const request: FeeChargeRequest = {
        feePayer: 'gc1broke',
        from: 'gc1broke',
        maxGas: 10000n,
        gasPrice: 1000n,
        gasInput: {},
      };

      try {
        await feeService.chargeAndDistribute(request, 'gc1miner');
      } catch {
        // Expected
      }

      const stats = feeService.getStats();
      expect(stats.insufficientFundsCount).toBe(1);
    });
  });
});

describe('Economics: Rent Collector', () => {
  let balances: InMemoryBalanceStore;
  let rentStore: InMemoryRentStore;
  let rentCollector: RentCollector;

  beforeEach(() => {
    balances = new InMemoryBalanceStore();
    rentStore = new InMemoryRentStore();
    rentCollector = new RentCollector(rentStore, balances, {
      enabled: true,
      collectEvery: 10,
      defaultPerBlock: 100n,
    });
  });

  describe('Rent registration', () => {
    it('should register rent for state', async () => {
      const stateId = ('0x' + 'aa'.repeat(32)) as Hex32;

      const record = await rentCollector.registerRent(stateId, 'gc1alice', 50n, 0n);

      expect(record.stateId).toBe(stateId);
      expect(record.payer).toBe('gc1alice');
      expect(record.perBlock).toBe(50n);
      expect(record.active).toBe(true);
    });

    it('should use default per-block rent', async () => {
      const stateId = ('0x' + 'bb'.repeat(32)) as Hex32;

      const record = await rentCollector.registerRent(stateId, 'gc1bob', 0n, 0n);

      expect(record.perBlock).toBe(100n); // default
    });

    it('should retrieve rent record', async () => {
      const stateId = ('0x' + 'cc'.repeat(32)) as Hex32;
      await rentCollector.registerRent(stateId, 'gc1alice', 75n, 0n);

      const retrieved = await rentCollector.getRent(stateId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.perBlock).toBe(75n);
    });
  });

  describe('Rent collection', () => {
    it('should skip collection when disabled', async () => {
      const disabledCollector = new RentCollector(rentStore, balances, {
        enabled: false,
      });

      const result = await disabledCollector.collectRent(10n);

      expect(result.charged).toBe(0);
      expect(result.totalCollected).toBe(0n);
    });

    it('should skip non-collection blocks', async () => {
      await rentCollector.registerRent(('0x' + 'aa'.repeat(32)) as Hex32, 'gc1alice', 100n, 0n);
      await balances.credit('gc1alice', 1000n);

      // Block 5 is not a collection block (collectEvery=10)
      const result = await rentCollector.collectRent(5n);

      expect(result.charged).toBe(0);
    });

    it('should collect rent on collection blocks', async () => {
      const stateId = ('0x' + 'dd'.repeat(32)) as Hex32;
      await rentCollector.registerRent(stateId, 'gc1alice', 100n, 0n);
      await balances.credit('gc1alice', 1000n);

      const result = await rentCollector.collectRent(10n);

      expect(result.charged).toBe(1);
      expect(result.totalCollected).toBe(100n);
    });

    it('should pause record on insufficient funds', async () => {
      const stateId = ('0x' + 'ee'.repeat(32)) as Hex32;
      await rentCollector.registerRent(stateId, 'gc1broke', 100n, 0n);
      // Don't credit any balance

      const result = await rentCollector.collectRent(10n);

      expect(result.paused).toBe(1);
      expect(result.charged).toBe(0);

      const isActive = await rentCollector.isRentActive(stateId);
      expect(isActive).toBe(false);
    });

    it('should collect from multiple states', async () => {
      await rentCollector.registerRent(('0x' + 'aa'.repeat(32)) as Hex32, 'gc1alice', 100n, 0n);
      await rentCollector.registerRent(('0x' + 'bb'.repeat(32)) as Hex32, 'gc1alice', 50n, 0n);
      await balances.credit('gc1alice', 10000n);

      const result = await rentCollector.collectRent(10n);

      expect(result.charged).toBe(2);
      expect(result.totalCollected).toBe(150n);
    });
  });

  describe('Rent reactivation', () => {
    it('should reactivate paused rent after funding', async () => {
      const stateId = ('0x' + 'ff'.repeat(32)) as Hex32;
      await rentCollector.registerRent(stateId, 'gc1alice', 100n, 0n);
      // Don't fund - will pause on collection
      await rentCollector.collectRent(10n);

      // Now fund and reactivate
      await balances.credit('gc1alice', 500n);
      const success = await rentCollector.reactivate(stateId);

      expect(success).toBe(true);
      const isActive = await rentCollector.isRentActive(stateId);
      expect(isActive).toBe(true);
    });

    it('should fail reactivation with insufficient funds', async () => {
      const stateId = ('0x' + '11'.repeat(32)) as Hex32;
      await rentCollector.registerRent(stateId, 'gc1alice', 100n, 0n);
      await rentCollector.collectRent(10n);

      const success = await rentCollector.reactivate(stateId);

      expect(success).toBe(false);
    });

    it('should fail reactivation for unknown state', async () => {
      const success = await rentCollector.reactivate(('0x' + '99'.repeat(32)) as Hex32);
      expect(success).toBe(false);
    });
  });

  describe('Stats tracking', () => {
    it('should track collection stats', async () => {
      await rentCollector.registerRent(('0x' + 'aa'.repeat(32)) as Hex32, 'gc1alice', 100n, 0n);
      await balances.credit('gc1alice', 1000n);

      await rentCollector.collectRent(10n);
      await rentCollector.collectRent(20n);

      const stats = rentCollector.getStats();
      expect(stats.totalCollected).toBe(200n);
      expect(stats.totalCharged).toBe(2);
    });
  });
});

describe('Economics: Balance Management', () => {
  let balances: InMemoryBalanceStore;

  beforeEach(() => {
    balances = new InMemoryBalanceStore();
  });

  describe('Credit and debit', () => {
    it('should credit balance', async () => {
      await balances.credit('gc1alice', 1000n);
      const balance = await balances.get('gc1alice');
      expect(balance).toBe(1000n);
    });

    it('should debit balance', async () => {
      await balances.credit('gc1alice', 1000n);
      const success = await balances.debit('gc1alice', 300n);

      expect(success).toBe(true);
      const balance = await balances.get('gc1alice');
      expect(balance).toBe(700n);
    });

    it('should fail debit with insufficient funds', async () => {
      await balances.credit('gc1alice', 100n);
      const success = await balances.debit('gc1alice', 500n);

      expect(success).toBe(false);
      const balance = await balances.get('gc1alice');
      expect(balance).toBe(100n); // Unchanged
    });

    it('should return zero for unknown address', async () => {
      const balance = await balances.get('gc1unknown');
      expect(balance).toBe(0n);
    });
  });

  describe('Transfer', () => {
    it('should transfer between accounts', async () => {
      await balances.credit('gc1alice', 1000n);

      const success = await balances.transfer('gc1alice', 'gc1bob', 400n);

      expect(success).toBe(true);
      expect(await balances.get('gc1alice')).toBe(600n);
      expect(await balances.get('gc1bob')).toBe(400n);
    });

    it('should fail transfer with insufficient funds', async () => {
      await balances.credit('gc1alice', 100n);

      const success = await balances.transfer('gc1alice', 'gc1bob', 500n);

      expect(success).toBe(false);
      expect(await balances.get('gc1alice')).toBe(100n);
      expect(await balances.get('gc1bob')).toBe(0n);
    });
  });
});
