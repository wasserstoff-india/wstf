/**
 * Block validator: verify blocks and integrate with chain
 */
import { Block, BlockHeader, BlockMeta, computeBlockId, computeWork } from '../block/types';
import { verifyPoW, validateBlockTime } from '../block/pow';
import { computeTxRoot, computeEffectsRoot } from '../block/merkle';
import { ChainStore } from './store';
import { ForkChoice } from './forkChoice';
import { executeProgram } from '../executor/engine';
import { ExecutionContext } from '../executor/types';
import { validateTxV2 } from '../validator/txV2Validator';
import { validateBasicTx } from '../validator/basicValidator';
import * as errors from '../common/errors';

export interface BlockValidatorDeps {
  chainStore: ChainStore;
  forkChoice: ForkChoice;
  validatorContext: any; // Tx validator context
  stateStore: Map<string, any>; // State store
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
  blockHash?: string;
  forkChoice?: {
    newTip: string;
    reorg: boolean;
    reorgDepth?: number;
  };
}

/**
 * Block validator service
 */
export class BlockValidator {
  constructor(private deps: BlockValidatorDeps) {}

  /**
   * Validate a complete block
   */
  async validateBlock(block: Block): Promise<ValidationResult> {
    const { header, body } = block;

    // 1. Header checks
    const headerCheck = await this.validateHeader(header);
    if (!headerCheck.ok) {
      return headerCheck;
    }

    // 2. Body checks (re-execute and compare roots)
    const bodyCheck = await this.validateBody(header, body);
    if (!bodyCheck.ok) {
      return bodyCheck;
    }

    // 3. Store block
    const blockHash = computeBlockId(header);
    const parentMeta = await this.deps.chainStore.getMeta(header.parentHash);

    if (!parentMeta) {
      return {
        ok: false,
        code: 'PARENT_NOT_FOUND',
        message: `Parent ${header.parentHash} not found`
      };
    }

    const work = computeWork(header.target);
    const chainwork = parentMeta.chainwork + work;

    const blockMeta: BlockMeta = {
      hash: blockHash,
      chainwork,
      status: 'valid'
    };

    await this.deps.chainStore.putBlock(blockHash, block, blockMeta);

    // 4. Fork choice
    const forkChoiceResult = await this.deps.forkChoice.processBlock(
      blockHash,
      header,
      parentMeta
    );

    return {
      ok: true,
      blockHash,
      forkChoice: forkChoiceResult
    };
  }

  /**
   * Validate block header
   */
  private async validateHeader(header: BlockHeader): Promise<ValidationResult> {
    // Check parent exists
    const parent = await this.deps.chainStore.getHeader(header.parentHash);
    if (!parent && header.parentHash !== '00'.repeat(32)) {
      return {
        ok: false,
        code: 'PARENT_NOT_FOUND',
        message: `Parent ${header.parentHash} not found`
      };
    }

    // Check height
    if (parent && header.height !== parent.height + 1n) {
      return {
        ok: false,
        code: errors.BAD_VERSION,
        message: `Height ${header.height} != parent.height + 1`
      };
    }

    // Check PoW
    const powCheck = verifyPoW(header);
    if (!powCheck.valid) {
      return {
        ok: false,
        code: 'INVALID_POW',
        message: `Block hash ${powCheck.hash} > target ${header.target}`
      };
    }

    // Check time
    const recentHeaders = await this.deps.chainStore.getRecentHeaders(11);
    const timeCheck = validateBlockTime(header, recentHeaders);
    if (!timeCheck.valid) {
      return {
        ok: false,
        code: 'INVALID_TIME',
        message: timeCheck.reason
      };
    }

    return { ok: true };
  }

  /**
   * Validate block body (re-execute and compare roots)
   */
  private async validateBody(header: BlockHeader, body: any): Promise<ValidationResult> {
    // 1. Verify txRoot
    const computedTxRoot = computeTxRoot(body.transactions);
    if (computedTxRoot !== header.txRoot) {
      return {
        ok: false,
        code: errors.BAD_INTEGRITY_HASH,
        message: `txRoot mismatch: expected ${header.txRoot}, got ${computedTxRoot}`
      };
    }

    // 2. Re-execute transactions and collect effects
    const effects: any[] = [];

    for (const tx of body.transactions) {
      // Validate tx first
      const version = tx.version || 1;
      let validationResult;

      if (version === 1) {
        validationResult = await validateBasicTx(tx, this.deps.validatorContext);
      } else if (version === 2) {
        validationResult = await validateTxV2(tx, this.deps.validatorContext);
      } else {
        return {
          ok: false,
          code: errors.BAD_VERSION,
          message: `Unknown tx version: ${version}`
        };
      }

      if (!validationResult.ok) {
        return {
          ok: false,
          code: 'TX_VALIDATION_FAILED',
          message: `Tx validation failed: ${validationResult.message}`
        };
      }

      // Execute (for v2 only)
      if (version === 2 && tx.programHex) {
        const ctx: ExecutionContext = {
          txFrom: tx.from,
          program: Buffer.from(tx.programHex, 'hex'),
          reads: tx.reads || [],
          locks: tx.locks || [],
          getState: async (id: string) => this.deps.stateStore.get(id)
        };

        const execResult = await executeProgram(ctx);

        effects.push({
          txId: tx.integrityHash || 'unknown',
          success: execResult.success,
          writes: execResult.writes,
          logs: execResult.logs,
          error: execResult.error
        });

        // Apply writes to state
        if (execResult.success) {
          for (const write of execResult.writes) {
            this.deps.stateStore.set(write.stateId, write.value);
          }
        }
      } else {
        // V1 tx: no effects (just balance transfer, not implemented yet)
        effects.push({
          txId: tx.integrityHash || 'unknown',
          success: true,
          writes: [],
          logs: []
        });
      }
    }

    // 3. Verify effectsRoot
    const computedEffectsRoot = computeEffectsRoot(effects);
    if (computedEffectsRoot !== header.effectsRoot) {
      return {
        ok: false,
        code: 'EFFECTS_ROOT_MISMATCH',
        message: `effectsRoot mismatch: expected ${header.effectsRoot}, got ${computedEffectsRoot}`
      };
    }

    // 4. Verify stateRoot (TODO: implement state root computation)
    // For now, we skip this check

    return { ok: true };
  }
}
