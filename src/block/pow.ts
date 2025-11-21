/**
 * Proof-of-Work utilities
 */
import { BlockHeader, computeBlockId, meetsTarget } from './types';

export interface PoWConfig {
  mode: 'fixed' | 'retarget';
  fixedTarget?: string;
  blockTimeTargetSec?: number;
  retargetInterval?: number; // Every N blocks
}

export const DEFAULT_POW_CONFIG: PoWConfig = {
  mode: 'fixed',
  fixedTarget: '00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // Easy for dev
  blockTimeTargetSec: 10,
  retargetInterval: 60
};

/**
 * Mine a block header (find nonce that meets target)
 * Returns the header with valid nonce, or null if maxIterations reached
 */
export function mineHeader(
  header: BlockHeader,
  maxIterations = 1_000_000
): { header: BlockHeader; hash: string; iterations: number } | null {
  let nonce = 0n;
  let iterations = 0;

  while (iterations < maxIterations) {
    header.nonce = nonce;
    const hash = computeBlockId(header);

    if (meetsTarget(hash, header.target)) {
      return { header, hash, iterations };
    }

    nonce++;
    iterations++;
  }

  return null; // Max iterations reached
}

/**
 * Verify PoW for a block
 */
export function verifyPoW(header: BlockHeader): { valid: boolean; hash: string } {
  const hash = computeBlockId(header);
  const valid = meetsTarget(hash, header.target);
  return { valid, hash };
}

/**
 * Calculate new target using difficulty retargeting
 * newTarget = oldTarget * (observedInterval / expectedInterval)
 * Clamped to [0.25x, 4x] per period
 */
export function calculateNewTarget(
  oldTargetHex: string,
  observedIntervalSec: number,
  expectedIntervalSec: number
): string {
  const oldTarget = BigInt('0x' + oldTargetHex);

  // Calculate adjustment ratio (fixed point with 1000x scale to avoid floats)
  const ratio = (BigInt(observedIntervalSec) * 1000n) / BigInt(expectedIntervalSec);

  // Clamp to [250, 4000] (0.25x to 4x)
  const clampedRatio = ratio < 250n ? 250n : ratio > 4000n ? 4000n : ratio;

  // Apply adjustment
  const newTarget = (oldTarget * clampedRatio) / 1000n;

  // Ensure target doesn't exceed max (2^256 - 1)
  const max = BigInt('0x' + 'f'.repeat(64));
  const finalTarget = newTarget > max ? max : newTarget;

  // Convert back to hex (pad to 64 chars)
  return finalTarget.toString(16).padStart(64, '0');
}

/**
 * Get median timestamp from last N blocks
 */
export function getMedianTimePast(recentHeaders: BlockHeader[], count = 11): bigint {
  if (recentHeaders.length === 0) {
    return 0n;
  }

  const times = recentHeaders.slice(-count).map(h => h.time).sort((a, b) => Number(a - b));
  const mid = Math.floor(times.length / 2);
  return times[mid] || 0n;
}

/**
 * Validate block time
 * - Must be >= median of last 11 blocks
 * - Must be <= now + skewLimit
 */
export function validateBlockTime(
  header: BlockHeader,
  recentHeaders: BlockHeader[],
  skewLimitSec = 15
): { valid: boolean; reason?: string } {
  const medianPast = getMedianTimePast(recentHeaders);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const maxTime = now + BigInt(skewLimitSec);

  if (header.time < medianPast) {
    return { valid: false, reason: `Time ${header.time} < median past ${medianPast}` };
  }

  if (header.time > maxTime) {
    return { valid: false, reason: `Time ${header.time} > max allowed ${maxTime}` };
  }

  return { valid: true };
}
