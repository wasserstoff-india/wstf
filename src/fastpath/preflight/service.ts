/**
 * Preflight Service - UX accelerator for fast-path transactions
 *
 * Checks conflicts, computes warm state stamp, provides confirmation guidance.
 */
import crypto from 'crypto';
import {
  PreflightRequest,
  PreflightResponse,
  WarmStateStamp,
  PreflightConfig,
  DEFAULT_PREFLIGHT_CONFIG,
} from './types';
import { PendingIndex } from '../pending/pendingIndex';
import { RecentTxRing } from '../hotwindow/recentTxRing';
import {
  ConfirmationTier,
  ConfirmationConfig,
  DEFAULT_CONFIRMATION_CONFIG,
  getRequiredTier,
  estimateConfirmationTimes,
} from '../../trust/types';
import { Conflict } from '../pending/types';

/**
 * Dependencies for preflight service
 */
export interface PreflightDeps {
  pendingIndex: PendingIndex;
  hotWindow: RecentTxRing;
  getState: (stateId: string) => Promise<{ version: string } | undefined>;
  getTip: () => { hash: string; height: bigint };
  decodeProgram?: (programHex: string) => { states: string[]; expected: [string, string][] };
}

/**
 * Preflight Service
 */
export class PreflightService {
  private config: PreflightConfig;
  private confirmConfig: ConfirmationConfig;
  private deps: PreflightDeps;

  // Lease tracking (if enabled)
  private leases = new Map<string, { from: string; exp: number }>();
  private leasesBySender = new Map<string, Set<string>>();

  constructor(
    deps: PreflightDeps,
    config: Partial<PreflightConfig> = {},
    confirmConfig: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG
  ) {
    this.deps = deps;
    this.config = { ...DEFAULT_PREFLIGHT_CONFIG, ...config };
    this.confirmConfig = confirmConfig;
  }

  /**
   * Run preflight check
   */
  async check(req: PreflightRequest): Promise<PreflightResponse> {
    const nonce = typeof req.nonce === 'string' ? BigInt(req.nonce) : req.nonce;
    const conflicts: Conflict[] = [];

    // Extract states from program if provided
    let states = req.states || [];
    let expected = req.expected || [];

    if (req.programHex && this.config.decodeProgram && this.deps.decodeProgram) {
      try {
        const decoded = this.deps.decodeProgram(req.programHex);
        states = decoded.states;
        expected = decoded.expected;
      } catch (e) {
        // Decode failed - proceed with explicit states if provided
      }
    }

    // Check pending index for conflicts
    const pendingCheck = this.deps.pendingIndex.check({
      from: req.from,
      nonce,
      states,
      expected,
      lockWrites: req.lockWrites,
    });

    conflicts.push(...pendingCheck.conflicts);

    // Check hot window for recent commits that might conflict
    if (states.length > 0) {
      const recentTouches = this.deps.hotWindow.getByStates(states, { limit: 10 });
      for (const recent of recentTouches) {
        // If same sender and same/higher nonce, might indicate stale view
        if (recent.from === req.from && recent.nonce >= nonce) {
          conflicts.push({
            type: 'nonce',
            from: req.from,
            expectedNonce: recent.nonce + 1n,
            gotNonce: nonce,
          });
          break;
        }
      }
    }

    // Fetch current state versions for warm stamp
    const statePairs: [string, string][] = [];
    for (const [stateId] of expected) {
      const state = await this.deps.getState(stateId);
      if (state) {
        statePairs.push([stateId, state.version]);
      }
    }

    // Compute warm state stamp
    const tip = this.deps.getTip();
    const warmStateStamp = this.computeWarmStamp(tip.hash, expected, statePairs);

    // Compute confirmation guidance
    const trustScore = req.trustScore ?? 50;
    const actionRisk = req.actionRisk ?? 'medium';
    const requiredTier = getRequiredTier(trustScore, actionRisk, this.confirmConfig.trustThresholds);
    const estimates = estimateConfirmationTimes(this.confirmConfig);

    // Generate lease token if enabled and no conflicts
    let leaseToken: string | undefined;
    if (this.config.enableLeases && conflicts.length === 0) {
      leaseToken = this.generateLease(req.from, nonce, states);
    }

    return {
      ok: conflicts.length === 0,
      conflicts,
      senderNextNonce: pendingCheck.senderNextNonce.toString(),
      warmStateStamp,
      confirmation: {
        estimatedMs: {
          admitted: estimates.admittedMs,
          included: estimates.includedMs,
          kDepth: estimates.kDepthMs,
          crossChain: estimates.crossChainMs,
        },
        tipHeight: tip.height.toString(),
        tipHash: tip.hash,
        pendingBlocks: 0, // TODO: track pending blocks being mined
        suggestedTier: requiredTier,
        requiredTier,
      },
      leaseToken,
    };
  }

  /**
   * Compute warm state stamp
   */
  private computeWarmStamp(
    header: string,
    expected: [string, string][],
    actualPairs: [string, string][]
  ): WarmStateStamp {
    // Hash the expected reads
    const readsData = expected
      .map(([s, v]) => `${s}:${v}`)
      .sort()
      .join('|');
    const readsHash = crypto.createHash('sha256').update(readsData).digest('hex').slice(0, 16);

    // Hash the actual state pairs
    const pairsData = actualPairs
      .map(([s, v]) => `${s}:${v}`)
      .sort()
      .join('|');
    const pairsHash = crypto.createHash('sha256').update(pairsData).digest('hex').slice(0, 16);

    return {
      header,
      readsHash,
      pairsHash,
      ts: Date.now(),
    };
  }

  /**
   * Generate a lease token
   */
  private generateLease(from: string, nonce: bigint, states: string[]): string | undefined {
    // Check per-sender limit
    const senderLeases = this.leasesBySender.get(from);
    if (senderLeases && senderLeases.size >= this.config.maxLeasesPerSender) {
      return undefined;
    }

    // Generate lease ID
    const leaseId = crypto.randomBytes(16).toString('hex');
    const exp = Date.now() + this.config.leaseTtlMs;

    // Store lease
    this.leases.set(leaseId, { from, exp });

    if (!senderLeases) {
      this.leasesBySender.set(from, new Set([leaseId]));
    } else {
      senderLeases.add(leaseId);
    }

    // Return as simple token (not cryptographically signed in v1)
    return Buffer.from(JSON.stringify({
      id: leaseId,
      from,
      nonce: nonce.toString(),
      statesHash: crypto.createHash('sha256')
        .update(states.sort().join('|'))
        .digest('hex')
        .slice(0, 16),
      exp,
    })).toString('base64');
  }

  /**
   * Validate a lease token
   */
  validateLease(token: string): { valid: boolean; from?: string; expired?: boolean } {
    try {
      const data = JSON.parse(Buffer.from(token, 'base64').toString());
      const lease = this.leases.get(data.id);

      if (!lease) {
        return { valid: false };
      }

      if (Date.now() > lease.exp) {
        this.removeLease(data.id, lease.from);
        return { valid: false, from: lease.from, expired: true };
      }

      return { valid: true, from: lease.from };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Remove a lease
   */
  private removeLease(leaseId: string, from: string): void {
    this.leases.delete(leaseId);
    const senderLeases = this.leasesBySender.get(from);
    if (senderLeases) {
      senderLeases.delete(leaseId);
      if (senderLeases.size === 0) {
        this.leasesBySender.delete(from);
      }
    }
  }

  /**
   * Cleanup expired leases
   */
  cleanupLeases(): number {
    const now = Date.now();
    let removed = 0;

    for (const [leaseId, lease] of this.leases.entries()) {
      if (now > lease.exp) {
        this.removeLease(leaseId, lease.from);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get statistics
   */
  getStats(): { activeLeases: number; leasesPerSender: Record<string, number> } {
    const leasesPerSender: Record<string, number> = {};
    for (const [from, leases] of this.leasesBySender.entries()) {
      leasesPerSender[from] = leases.size;
    }

    return {
      activeLeases: this.leases.size,
      leasesPerSender,
    };
  }
}
