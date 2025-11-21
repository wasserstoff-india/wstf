/**
 * Fork choice: select best chain tip based on cumulative work
 * Pure library (no I/O)
 */
import { BlockHeader, BlockMeta, computeWork } from '../block/types';
import { ChainStore } from './store';

export interface ForkChoiceResult {
  newTip: string;
  reorg: boolean;
  reorgDepth?: number;
  oldTip?: string;
}

/**
 * Fork choice service
 */
export class ForkChoice {
  constructor(private chainStore: ChainStore) {}

  /**
   * Process a new block and decide if it becomes the new tip
   * Returns fork choice result
   */
  async processBlock(
    blockHash: string,
    header: BlockHeader,
    parentMeta: BlockMeta
  ): Promise<ForkChoiceResult> {
    // Compute this block's metadata
    const work = computeWork(header.target);
    const chainwork = parentMeta.chainwork + work;

    const blockMeta: BlockMeta = {
      hash: blockHash,
      chainwork,
      status: 'valid'
    };

    // Store metadata
    await this.chainStore.getMeta(blockHash); // Ensure it's stored elsewhere first
    // (Assuming validator already stored it)

    // Get current tip
    const currentTip = await this.chainStore.getTip();

    if (!currentTip) {
      // First block (genesis or bootstrap)
      await this.chainStore.setTip(blockHash);
      return {
        newTip: blockHash,
        reorg: false
      };
    }

    // Compare chainwork
    if (chainwork > currentTip.meta.chainwork) {
      // New tip has more work
      const reorgDepth = await this.computeReorgDepth(currentTip.hash, blockHash);

      await this.chainStore.setTip(blockHash);

      return {
        newTip: blockHash,
        reorg: reorgDepth > 0,
        reorgDepth,
        oldTip: currentTip.hash
      };
    }

    // Current tip still has more work
    return {
      newTip: currentTip.hash,
      reorg: false
    };
  }

  /**
   * Compute reorg depth (how many blocks need to be reverted)
   */
  private async computeReorgDepth(oldTipHash: string, newTipHash: string): Promise<number> {
    // Find common ancestor
    let oldChain: string[] = [oldTipHash];
    let newChain: string[] = [newTipHash];

    let oldHeader = await this.chainStore.getHeader(oldTipHash);
    let newHeader = await this.chainStore.getHeader(newTipHash);

    // Walk back old chain
    while (oldHeader && oldHeader.parentHash !== '00'.repeat(32)) {
      oldChain.push(oldHeader.parentHash);
      oldHeader = await this.chainStore.getHeader(oldHeader.parentHash);
    }

    // Walk back new chain
    while (newHeader && newHeader.parentHash !== '00'.repeat(32)) {
      newChain.push(newHeader.parentHash);
      newHeader = await this.chainStore.getHeader(newHeader.parentHash);
    }

    // Find common ancestor
    const oldSet = new Set(oldChain);
    for (let i = 0; i < newChain.length; i++) {
      if (oldSet.has(newChain[i])) {
        // Common ancestor found
        return oldChain.indexOf(newChain[i]);
      }
    }

    // No common ancestor (shouldn't happen in valid chain)
    return oldChain.length;
  }

  /**
   * Get blocks to revert and apply for a reorg
   */
  async getReorgBlocks(oldTipHash: string, newTipHash: string): Promise<{
    toRevert: string[];
    toApply: string[];
  }> {
    const toRevert: string[] = [];
    const toApply: string[] = [];

    // Build old chain
    let oldHeader = await this.chainStore.getHeader(oldTipHash);
    const oldChain: string[] = [oldTipHash];

    while (oldHeader && oldHeader.parentHash !== '00'.repeat(32)) {
      oldChain.push(oldHeader.parentHash);
      oldHeader = await this.chainStore.getHeader(oldHeader.parentHash);
    }

    // Build new chain
    let newHeader = await this.chainStore.getHeader(newTipHash);
    const newChain: string[] = [newTipHash];

    while (newHeader && newHeader.parentHash !== '00'.repeat(32)) {
      newChain.push(newHeader.parentHash);
      newHeader = await this.chainStore.getHeader(newHeader.parentHash);
    }

    // Find common ancestor
    const oldSet = new Set(oldChain);
    let commonAncestorIndex = -1;

    for (let i = 0; i < newChain.length; i++) {
      if (oldSet.has(newChain[i])) {
        commonAncestorIndex = i;
        break;
      }
    }

    if (commonAncestorIndex === -1) {
      // No common ancestor (error case)
      return { toRevert, toApply };
    }

    // Blocks to revert: from old tip back to (but not including) common ancestor
    const commonAncestor = newChain[commonAncestorIndex];
    const revertIndex = oldChain.indexOf(commonAncestor);

    for (let i = 0; i < revertIndex; i++) {
      toRevert.push(oldChain[i]);
    }

    // Blocks to apply: from common ancestor's child up to new tip
    for (let i = commonAncestorIndex - 1; i >= 0; i--) {
      toApply.push(newChain[i]);
    }

    return { toRevert, toApply };
  }

  /**
   * Compare two tips (for debugging)
   */
  async compareTips(hashA: string, hashB: string): Promise<{
    aWork: bigint;
    bWork: bigint;
    winner: string;
  }> {
    const metaA = await this.chainStore.getMeta(hashA);
    const metaB = await this.chainStore.getMeta(hashB);

    if (!metaA || !metaB) {
      throw new Error('Cannot compare: missing metadata');
    }

    return {
      aWork: metaA.chainwork,
      bWork: metaB.chainwork,
      winner: metaA.chainwork > metaB.chainwork ? hashA : hashB
    };
  }
}
