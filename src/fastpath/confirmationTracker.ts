/**
 * Confirmation Tracker
 *
 * Tracks transaction confirmation progress through trust tiers,
 * handling block inclusions, successor blocks, and reorgs.
 */

import { TrustTier, computeTrustTier } from './trustTypes';

/**
 * Transaction confirmation state
 */
export interface TxConfirmationState {
  txId: string;
  currentTier: TrustTier;
  blockHash?: string;
  blockHeight?: bigint;
  confirmations: number;
  trustScore: number;
  riskScore: number;
  isFinalized: boolean;
}

/**
 * Event types emitted by tracker
 */
export type TrackerEvent =
  | { type: 'tracked'; txId: string }
  | { type: 'included'; txId: string; blockHash: string }
  | { type: 'confirmed'; txId: string; confirmations: number }
  | { type: 'reorg'; txId: string; fromHeight: bigint }
  | { type: 'finalized'; txId: string };

type EventHandler = (event: TrackerEvent) => void;

/**
 * Confirmation Tracker
 */
export class ConfirmationTracker {
  private states = new Map<string, TxConfirmationState>();
  private eventHandlers: EventHandler[] = [];

  /**
   * Start tracking a transaction
   */
  track(txId: string, ctx: { trustScore: number; riskScore: number }): void {
    const tier = computeTrustTier({
      trustScore: ctx.trustScore,
      riskScore: ctx.riskScore,
      valueUsd: 0,
      isHighValue: false,
    });

    const state: TxConfirmationState = {
      txId,
      currentTier: tier,
      confirmations: 0,
      trustScore: ctx.trustScore,
      riskScore: ctx.riskScore,
      isFinalized: false,
    };

    this.states.set(txId, state);
    this.emit({ type: 'tracked', txId });
  }

  /**
   * Get current state for a transaction
   */
  get(txId: string): TxConfirmationState | undefined {
    return this.states.get(txId);
  }

  /**
   * Handle block inclusion event
   */
  onBlockInclusion(txId: string, blockHash: string, blockHeight: bigint): void {
    const state = this.states.get(txId);
    if (!state) return;

    state.blockHash = blockHash;
    state.blockHeight = blockHeight;
    state.confirmations = 0;

    // Advance tier if at ADMITTED
    if (state.currentTier === TrustTier.ADMITTED) {
      state.currentTier = TrustTier.INCLUDED;
    }

    this.emit({ type: 'included', txId, blockHash });
  }

  /**
   * Handle successor block event
   */
  onSuccessorBlock(txId: string, newHeight: bigint): void {
    const state = this.states.get(txId);
    if (!state || !state.blockHeight) return;

    const depth = Number(newHeight - state.blockHeight);
    state.confirmations = depth;

    // Advance tier based on confirmations
    if (depth >= 6 && state.currentTier < TrustTier.CROSS_CHAIN) {
      state.currentTier = TrustTier.CROSS_CHAIN;
    } else if (depth >= 2 && state.currentTier < TrustTier.K_DEPTH) {
      state.currentTier = TrustTier.K_DEPTH;
    }

    this.emit({ type: 'confirmed', txId, confirmations: depth });
  }

  /**
   * Handle reorg event
   */
  onReorg(txId: string, fromHeight: bigint): void {
    const state = this.states.get(txId);
    if (!state || !state.blockHeight) return;

    // Reset confirmations to the reorg point
    if (fromHeight <= state.blockHeight) {
      state.confirmations = 0;
      state.blockHash = undefined;
      state.blockHeight = undefined;
      state.currentTier = TrustTier.ADMITTED;
    } else {
      state.confirmations = Number(fromHeight - state.blockHeight) - 1;
    }

    this.emit({ type: 'reorg', txId, fromHeight });
  }

  /**
   * Handle journal commit (finalization)
   */
  onJournalCommit(txId: string): void {
    const state = this.states.get(txId);
    if (!state) return;

    state.isFinalized = true;
    state.currentTier = TrustTier.CROSS_CHAIN;

    this.emit({ type: 'finalized', txId });
  }

  /**
   * Register event handler
   */
  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: TrackerEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
}
