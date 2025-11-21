/**
 * Merkle tree utilities for tx and effects roots
 */
import crypto from 'crypto';

/**
 * Compute SHA256 hash
 */
function sha256(data: Buffer): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * Compute Merkle root from leaf hashes
 * Empty list → all zeros
 * Single item → hash(hash(item))
 * Multiple items → binary Merkle tree
 */
export function computeMerkleRoot(leaves: Buffer[]): string {
  if (leaves.length === 0) {
    return '00'.repeat(32);
  }

  // Hash each leaf (double SHA256)
  let level = leaves.map(leaf => sha256(sha256(leaf)));

  // Build tree bottom-up
  while (level.length > 1) {
    const nextLevel: Buffer[] = [];

    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        // Pair exists
        const combined = Buffer.concat([level[i], level[i + 1]]);
        nextLevel.push(sha256(combined));
      } else {
        // Odd one out - hash with itself
        const combined = Buffer.concat([level[i], level[i]]);
        nextLevel.push(sha256(combined));
      }
    }

    level = nextLevel;
  }

  return level[0].toString('hex');
}

/**
 * Compute transaction root from transactions
 */
export function computeTxRoot(transactions: any[]): string {
  if (transactions.length === 0) {
    return '00'.repeat(32);
  }

  const leaves = transactions.map(tx => {
    const txStr = JSON.stringify(tx);
    return Buffer.from(txStr, 'utf8');
  });

  return computeMerkleRoot(leaves);
}

/**
 * Compute effects root from effect records
 */
export function computeEffectsRoot(effects: Array<{ txId: string; success: boolean; writes: any[]; logs: string[] }>): string {
  if (effects.length === 0) {
    return '00'.repeat(32);
  }

  const leaves = effects.map(effect => {
    // Canonical encoding: txId + success + writes + logs
    const canonical = JSON.stringify({
      txId: effect.txId,
      success: effect.success,
      writes: effect.writes,
      logs: effect.logs
    });
    return Buffer.from(canonical, 'utf8');
  });

  return computeMerkleRoot(leaves);
}
