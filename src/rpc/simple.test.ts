/**
 * Simple RPC Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleRPC } from './simple';
import { BlockWithTxs, TransactionInfo, ReceiptInfo } from './types';

describe('SimpleRPC', () => {
  let rpc: SimpleRPC;

  beforeEach(() => {
    rpc = new SimpleRPC();
  });

  describe('Block queries', () => {
    it('should return error for missing block by hash', async () => {
      const result = await rpc.getBlock('abc123');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should return error for missing block by height', async () => {
      const result = await rpc.getBlock(100n);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should return error when no blocks indexed', async () => {
      const result = await rpc.getLatestBlock();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NO_BLOCKS');
    });

    it('should index and retrieve block', async () => {
      const block: BlockWithTxs = {
        header: {
          version: 1,
          height: 0n,
          parentHash: '00'.repeat(32),
          timestamp: BigInt(Date.now()),
          txRoot: '00'.repeat(32),
          effectsRoot: '00'.repeat(32),
          stateRoot: '00'.repeat(32),
          target: '00'.repeat(32),
          nonce: 0n,
        },
        transactions: [],
      };

      rpc.indexBlock(block, 'blockhash123');

      const byHash = await rpc.getBlock('blockhash123');
      expect(byHash.ok).toBe(true);
      expect(byHash.data?.header.height).toBe(0n);

      const byHeight = await rpc.getBlock(0n);
      expect(byHeight.ok).toBe(true);
      expect(byHeight.data?.header.height).toBe(0n);
    });

    it('should track latest block', async () => {
      const block: BlockWithTxs = {
        header: {
          version: 1,
          height: 5n,
          parentHash: '00'.repeat(32),
          timestamp: BigInt(Date.now()),
          txRoot: '00'.repeat(32),
          effectsRoot: '00'.repeat(32),
          stateRoot: '00'.repeat(32),
          target: '00'.repeat(32),
          nonce: 0n,
        },
        transactions: [],
      };

      rpc.indexBlock(block, 'latesthash');

      const latest = await rpc.getLatestBlock();
      expect(latest.ok).toBe(true);
      expect(latest.data?.height).toBe(5n);
      expect(latest.data?.hash).toBe('latesthash');
    });

    it('should paginate blocks', async () => {
      // Index 5 blocks
      for (let i = 0; i < 5; i++) {
        const block: BlockWithTxs = {
          header: {
            version: 1,
            height: BigInt(i),
            parentHash: '00'.repeat(32),
            timestamp: BigInt(Date.now()),
            txRoot: '00'.repeat(32),
            effectsRoot: '00'.repeat(32),
            stateRoot: '00'.repeat(32),
            target: '00'.repeat(32),
            nonce: 0n,
          },
          transactions: [],
        };
        rpc.indexBlock(block, `block${i}`);
      }

      const page1 = await rpc.getBlocks({ limit: 2 });
      expect(page1.ok).toBe(true);
      expect(page1.data?.items.length).toBe(2);
      expect(page1.data?.hasMore).toBe(true);

      const page2 = await rpc.getBlocks({ offset: 2, limit: 2 });
      expect(page2.ok).toBe(true);
      expect(page2.data?.items.length).toBe(2);
    });
  });

  describe('Transaction queries', () => {
    it('should return error for missing transaction', async () => {
      const result = await rpc.getTransaction('txhash123');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should index transactions from block', async () => {
      const tx: TransactionInfo = {
        hash: 'txhash123',
        version: 2,
        from: 'gc1' + '00'.repeat(22),
        nonce: 0n,
      };

      const block: BlockWithTxs = {
        header: {
          version: 1,
          height: 1n,
          parentHash: '00'.repeat(32),
          timestamp: BigInt(Date.now()),
          txRoot: '00'.repeat(32),
          effectsRoot: '00'.repeat(32),
          stateRoot: '00'.repeat(32),
          target: '00'.repeat(32),
          nonce: 0n,
        },
        transactions: [tx],
      };

      rpc.indexBlock(block, 'blockhash');

      const result = await rpc.getTransaction('txhash123');
      expect(result.ok).toBe(true);
      expect(result.data?.hash).toBe('txhash123');
      expect(result.data?.blockHash).toBe('blockhash');
      expect(result.data?.status).toBe('confirmed');
    });
  });

  describe('Receipt queries', () => {
    it('should return error for missing receipt', async () => {
      const result = await rpc.getReceipt('txhash123');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should index receipts from block', async () => {
      const receipt: ReceiptInfo = {
        txHash: 'txhash123',
        blockHash: 'blockhash',
        blockHeight: 1n,
        index: 0,
        success: true,
        gasUsed: 1000n,
        logs: ['log1'],
      };

      const block: BlockWithTxs = {
        header: {
          version: 1,
          height: 1n,
          parentHash: '00'.repeat(32),
          timestamp: BigInt(Date.now()),
          txRoot: '00'.repeat(32),
          effectsRoot: '00'.repeat(32),
          stateRoot: '00'.repeat(32),
          target: '00'.repeat(32),
          nonce: 0n,
        },
        transactions: [],
        receipts: [receipt],
      };

      rpc.indexBlock(block, 'blockhash');

      const result = await rpc.getReceipt('txhash123');
      expect(result.ok).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.gasUsed).toBe(1000n);
    });
  });

  describe('Account queries', () => {
    it('should return default account for unknown address', async () => {
      const result = await rpc.getAccount('gc1unknown');
      expect(result.ok).toBe(true);
      expect(result.data?.balance).toBe(0n);
      expect(result.data?.nonce).toBe(0n);
    });

    it('should return updated account state', async () => {
      rpc.updateAccount({
        address: 'gc1test',
        balance: 1000n,
        nonce: 5n,
      });

      const result = await rpc.getAccount('gc1test');
      expect(result.ok).toBe(true);
      expect(result.data?.balance).toBe(1000n);
      expect(result.data?.nonce).toBe(5n);
    });

    it('should get nonce directly', async () => {
      rpc.updateAccount({
        address: 'gc1test',
        balance: 1000n,
        nonce: 10n,
      });

      const result = await rpc.getNonce('gc1test');
      expect(result.ok).toBe(true);
      expect(result.data).toBe(10n);
    });

    it('should get balance directly', async () => {
      rpc.updateAccount({
        address: 'gc1test',
        balance: 5000n,
        nonce: 0n,
      });

      const result = await rpc.getBalance('gc1test');
      expect(result.ok).toBe(true);
      expect(result.data).toBe(5000n);
    });
  });

  describe('Mempool queries', () => {
    it('should return error when mempool not connected', async () => {
      const result = await rpc.getMempoolTx('txhash');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NO_MEMPOOL');
    });

    it('should query mempool when connected', async () => {
      const mockMempool = {
        get: (hash: string) => ({
          txHash: hash,
          from: 'gc1sender',
          receivedAt: Date.now(),
          sizeBytes: 100,
        }),
        getStats: () => ({ count: 5, bytes: 500 }),
      };

      rpc.setMempool(mockMempool);

      const txResult = await rpc.getMempoolTx('txhash123');
      expect(txResult.ok).toBe(true);
      expect(txResult.data?.txHash).toBe('txhash123');

      const statsResult = await rpc.getMempoolStats();
      expect(statsResult.ok).toBe(true);
      expect(statsResult.data?.count).toBe(5);
    });
  });

  describe('Gas estimation', () => {
    it('should estimate gas for empty tx', async () => {
      const result = await rpc.estimateGas({});
      expect(result.ok).toBe(true);
      expect(result.data?.gasLimit).toBeGreaterThan(0n);
    });

    it('should estimate gas for tx with program', async () => {
      const result = await rpc.estimateGas({
        program: Buffer.from('00'.repeat(100), 'hex'),
      });
      expect(result.ok).toBe(true);
      expect(result.data?.gasLimit).toBeGreaterThan(500n);
    });
  });
});
