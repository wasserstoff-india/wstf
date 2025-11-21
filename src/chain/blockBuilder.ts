/**
 * Block builder: assemble and mine blocks from mempool
 */
import crypto from 'crypto';
import { Block, BlockHeader, createGenesisBlock, computeBlockId } from '../block/types';
import { mineHeader } from '../block/pow';
import { computeTxRoot, computeEffectsRoot } from '../block/merkle';
import { ChainStore } from './store';

export interface BlockBuilderConfig {
  target: string; // PoW target
  maxTxPerBlock?: number;
  blockTimeTargetSec?: number;
}

export const DEFAULT_BUILDER_CONFIG: BlockBuilderConfig = {
  target: '00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  maxTxPerBlock: 5000,
  blockTimeTargetSec: 10
};

/**
 * Block builder service
 */
export class BlockBuilder {
  constructor(
    private chainStore: ChainStore,
    private config: BlockBuilderConfig = DEFAULT_BUILDER_CONFIG
  ) {}

  /**
   * Build and mine a block from transactions
   */
  async buildBlock(transactions: any[]): Promise<{ block: Block; hash: string; iterations: number } | null> {
    // Get current tip
    const tip = await this.chainStore.getTip();
    let parentHash: string;
    let height: bigint;

    if (!tip) {
      // No tip - need genesis
      parentHash = '00'.repeat(32);
      height = 1n;
    } else {
      parentHash = tip.hash;
      height = tip.header.height + 1n;
    }

    // Limit transactions
    const maxTx = this.config.maxTxPerBlock || 5000;
    const txs = transactions.slice(0, maxTx);

    // Sort transactions in canonical order (by from + nonce)
    const sortedTxs = txs.sort((a, b) => {
      if (a.from !== b.from) {
        return a.from.localeCompare(b.from);
      }
      return Number(a.nonce) - Number(b.nonce);
    });

    // For now, we'll use simplified effects (no actual execution)
    // In production, this would execute each tx and collect effects
    const effects = sortedTxs.map(tx => ({
      txId: tx.integrityHash || crypto.randomBytes(32).toString('hex'),
      success: true,
      writes: [],
      logs: []
    }));

    // Compute roots
    const txRoot = computeTxRoot(sortedTxs);
    const effectsRoot = computeEffectsRoot(effects);
    const stateRoot = '00'.repeat(32); // Simplified for now

    // Build header
    const header: BlockHeader = {
      version: 1,
      height,
      parentHash,
      time: BigInt(Math.floor(Date.now() / 1000)),
      txRoot,
      effectsRoot,
      stateRoot,
      target: this.config.target,
      nonce: 0n
    };

    // Mine (find valid nonce)
    console.log(`[block-builder] Mining block at height ${height} with ${sortedTxs.length} txs...`);
    const startTime = Date.now();

    const mineResult = mineHeader(header, 10_000_000); // Max 10M iterations

    if (!mineResult) {
      console.log('[block-builder] Mining failed: max iterations reached');
      return null;
    }

    const duration = Date.now() - startTime;
    console.log(`[block-builder] Block mined in ${duration}ms (${mineResult.iterations} iterations)`);

    const block: Block = {
      header: mineResult.header,
      body: {
        transactions: sortedTxs,
        effects
      }
    };

    return {
      block,
      hash: mineResult.hash,
      iterations: mineResult.iterations
    };
  }

  /**
   * Initialize chain with genesis block
   */
  async initGenesis(): Promise<{ block: Block; hash: string }> {
    const genesis = createGenesisBlock();
    const hash = computeBlockId(genesis.header);

    await this.chainStore.putBlock(hash, genesis, {
      hash,
      chainwork: 0n,
      status: 'valid'
    });

    await this.chainStore.setTip(hash);

    console.log(`[block-builder] Genesis block created: ${hash}`);

    return { block: genesis, hash };
  }
}
