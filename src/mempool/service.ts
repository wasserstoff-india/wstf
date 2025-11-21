/**
 * Mempool service with validator integration
 */
import Fastify from 'fastify';
import { MempoolStore } from './store';
import { MempoolConfig } from '../config/types';
import { P2PService } from '../p2p/service';
import { createInv, createData } from '../p2p/messages';
import crypto from 'crypto';

export interface MempoolDependencies {
  validator?: {
    validateBasicTx?: (tx: any, ctx: any) => Promise<any>;
    validateTxV2?: (tx: any, ctx: any) => Promise<any>;
  };
  p2p?: P2PService;
  validatorContext?: any; // Validator context (accounts, state)
}

export class MempoolService {
  private store: MempoolStore;
  private config: MempoolConfig;
  private deps: MempoolDependencies;

  constructor(config: MempoolConfig, deps: MempoolDependencies = {}) {
    this.config = config;
    this.store = new MempoolStore(config.policy);
    this.deps = deps;
  }

  /**
   * Submit a transaction to the mempool
   * Optionally validates before adding
   */
  async submit(tx: any, validate = true): Promise<{ ok: boolean; code?: string; reason?: string; id?: string }> {
    // Optional validation
    if (validate && this.deps.validator && this.deps.validatorContext) {
      const version = tx.version || 1;
      let result;

      if (version === 1 && this.deps.validator.validateBasicTx) {
        result = await this.deps.validator.validateBasicTx(tx, this.deps.validatorContext);
      } else if (version === 2 && this.deps.validator.validateTxV2) {
        result = await this.deps.validator.validateTxV2(tx, this.deps.validatorContext);
      }

      if (result && !result.ok) {
        return { ok: false, code: result.code || 'VALIDATION_FAILED', reason: result.message };
      }
    }

    // Add to mempool
    const addResult = this.store.add(tx);

    if (addResult.ok && this.deps.p2p && addResult.id) {
      // Gossip to peers
      this.deps.p2p.broadcast(createInv('tx', [addResult.id]));
    }

    return addResult;
  }

  /**
   * Get a transaction by ID
   */
  get(id: string): any {
    const mempoolTx = this.store.get(id);
    return mempoolTx ? mempoolTx.tx : undefined;
  }

  /**
   * Remove a transaction (e.g., after block inclusion)
   */
  remove(id: string): boolean {
    return this.store.remove(id);
  }

  /**
   * Get all transactions
   */
  getAll(): any[] {
    return this.store.getAll().map(mtx => mtx.tx);
  }

  /**
   * Get mempool stats
   */
  getStats() {
    return this.store.getStats();
  }

  /**
   * Check if transaction is in mempool
   */
  has(id: string): boolean {
    return this.store.has(id);
  }
}

/**
 * Start mempool HTTP service
 */
export async function startMempoolService(
  port: number,
  mempool: MempoolService
) {
  const app = Fastify();

  // Submit transaction
  app.post('/mempool/submit', async (req: any) => {
    const tx = req.body?.tx;
    if (!tx) {
      return { ok: false, code: 'MISSING_TX', reason: 'Transaction required' };
    }

    const result = await mempool.submit(tx);
    return result;
  });

  // Get transaction
  app.get('/mempool/tx/:id', async (req: any) => {
    const tx = mempool.get(req.params.id);
    if (!tx) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    return { ok: true, tx };
  });

  // Get mempool stats
  app.get('/mempool/stats', async () => {
    return {
      ok: true,
      stats: mempool.getStats()
    };
  });

  // Get all transactions
  app.get('/mempool/txs', async () => {
    return {
      ok: true,
      txs: mempool.getAll()
    };
  });

  // Capabilities endpoint
  app.get('/capabilities', async () => {
    return {
      service: 'mempool',
      version: '1.0.0',
      modules: ['tx-pool', 'policy-enforcement', 'validator-integration'],
      endpoints: [
        { method: 'POST', path: '/mempool/submit', description: 'Submit transaction to mempool' },
        { method: 'GET', path: '/mempool/tx/:id', description: 'Get transaction by ID' },
        { method: 'GET', path: '/mempool/stats', description: 'Get mempool statistics' },
        { method: 'GET', path: '/mempool/txs', description: 'List all transactions' }
      ],
      policies: mempool.getStats()
    };
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[mempool] listening on ${port}`);
  return app;
}
