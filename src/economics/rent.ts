/**
 * Rent Collector - Storage economy
 */
import { EventEmitter } from 'events';
import { Balance, Hex32, RentConfig, DEFAULT_RENT_CONFIG, RentRecord } from './types';
import { BalanceView } from './balances';

/**
 * Rent view interface
 */
export interface RentView {
  /** Get rent record for state */
  getRent(stateId: Hex32): Promise<RentRecord | null>;

  /** Set rent record */
  setRent(record: RentRecord): Promise<void>;

  /** Iterate active rent records */
  iterateActive(callback: (record: RentRecord) => Promise<boolean>): Promise<void>;

  /** Set paused status */
  setPaused(stateId: Hex32, paused: boolean): Promise<void>;
}

/**
 * In-memory rent store
 */
export class InMemoryRentStore implements RentView {
  private records = new Map<string, RentRecord>();

  async getRent(stateId: Hex32): Promise<RentRecord | null> {
    return this.records.get(stateId) || null;
  }

  async setRent(record: RentRecord): Promise<void> {
    this.records.set(record.stateId, record);
  }

  async iterateActive(callback: (record: RentRecord) => Promise<boolean>): Promise<void> {
    for (const record of this.records.values()) {
      if (record.active) {
        const continueLoop = await callback(record);
        if (!continueLoop) break;
      }
    }
  }

  async setPaused(stateId: Hex32, paused: boolean): Promise<void> {
    const record = this.records.get(stateId);
    if (record) {
      record.active = !paused;
    }
  }

  clear(): void {
    this.records.clear();
  }

  getAll(): RentRecord[] {
    return Array.from(this.records.values());
  }
}

/**
 * Rent collection result
 */
export interface RentCollectionResult {
  /** Number of records charged */
  charged: number;
  /** Number of records paused (insufficient funds) */
  paused: number;
  /** Total rent collected */
  totalCollected: Balance;
  /** Block height */
  height: bigint;
}

/**
 * Rent Collector Service
 */
export class RentCollector extends EventEmitter {
  private config: RentConfig;
  private rentStore: RentView;
  private balances: BalanceView;

  // Stats
  private totalCollected: Balance = 0n;
  private totalCharged = 0;
  private totalPaused = 0;

  constructor(
    rentStore: RentView,
    balances: BalanceView,
    config: Partial<RentConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_RENT_CONFIG, ...config };
    this.rentStore = rentStore;
    this.balances = balances;
  }

  /**
   * Collect rent at block height
   */
  async collectRent(height: bigint): Promise<RentCollectionResult> {
    // Check if enabled
    if (!this.config.enabled) {
      return { charged: 0, paused: 0, totalCollected: 0n, height };
    }

    // Check if this is a collection block
    if (Number(height % BigInt(this.config.collectEvery)) !== 0) {
      return { charged: 0, paused: 0, totalCollected: 0n, height };
    }

    let charged = 0;
    let paused = 0;
    let totalCollected: Balance = 0n;

    await this.rentStore.iterateActive(async (record) => {
      const debitOk = await this.balances.debit(record.payer, record.perBlock);

      if (debitOk) {
        charged++;
        totalCollected += record.perBlock;

        // Update last paid height
        record.lastPaidHeight = height;
        await this.rentStore.setRent(record);
      } else {
        // Insufficient funds - pause the record
        await this.rentStore.setPaused(record.stateId, true);
        paused++;

        this.emit('rent:paused', {
          stateId: record.stateId,
          payer: record.payer,
          height,
        });
      }

      return true; // Continue iteration
    });

    // Update stats
    this.totalCollected += totalCollected;
    this.totalCharged += charged;
    this.totalPaused += paused;

    const result: RentCollectionResult = {
      charged,
      paused,
      totalCollected,
      height,
    };

    this.emit('rent:collected', result);

    return result;
  }

  /**
   * Register rent for a state
   */
  async registerRent(
    stateId: Hex32,
    payer: string,
    perBlock: bigint,
    height: bigint
  ): Promise<RentRecord> {
    const record: RentRecord = {
      stateId,
      payer,
      perBlock: perBlock || this.config.defaultPerBlock,
      active: true,
      createdAt: height,
      lastPaidHeight: height,
    };

    await this.rentStore.setRent(record);

    this.emit('rent:registered', record);

    return record;
  }

  /**
   * Reactivate a paused rent record (after funding)
   */
  async reactivate(stateId: Hex32): Promise<boolean> {
    const record = await this.rentStore.getRent(stateId);
    if (!record) return false;

    // Check if payer has balance
    const balance = await this.balances.get(record.payer);
    if (balance < record.perBlock) {
      return false;
    }

    await this.rentStore.setPaused(stateId, false);

    this.emit('rent:reactivated', { stateId });

    return true;
  }

  /**
   * Get rent record
   */
  async getRent(stateId: Hex32): Promise<RentRecord | null> {
    return this.rentStore.getRent(stateId);
  }

  /**
   * Check if state has active rent
   */
  async isRentActive(stateId: Hex32): Promise<boolean> {
    const record = await this.rentStore.getRent(stateId);
    return record?.active ?? false;
  }

  /**
   * Get configuration
   */
  getConfig(): RentConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalCollected: Balance;
    totalCharged: number;
    totalPaused: number;
  } {
    return {
      totalCollected: this.totalCollected,
      totalCharged: this.totalCharged,
      totalPaused: this.totalPaused,
    };
  }
}
