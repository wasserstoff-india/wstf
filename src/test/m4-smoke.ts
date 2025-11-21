/**
 * Milestone 4 Smoke Tests: Block Builder, Chain Store, Fork Choice
 */
import { InMemoryChainStore, ChainStore } from '../chain/store';
import { ForkChoice } from '../chain/forkChoice';
import { BlockBuilder, DEFAULT_BUILDER_CONFIG } from '../chain/blockBuilder';
import { BlockValidator } from '../chain/blockValidator';
import { computeBlockId, computeWork, createGenesisBlock } from '../block/types';
import { verifyPoW } from '../block/pow';

(async () => {
  console.log('🧪 Starting Milestone 4 smoke tests...\n');

  // Test 1: Create and store genesis block
  console.log('✓ Test 1: Genesis block creation');
  const adapter = new InMemoryChainStore();
  const chainStore = new ChainStore(adapter);
  const builder = new BlockBuilder(chainStore, DEFAULT_BUILDER_CONFIG);

  const { block: genesis, hash: genesisHash } = await builder.initGenesis();

  console.log(`  Genesis hash: ${genesisHash.substring(0, 16)}...`);
  console.log(`  Height: ${genesis.header.height}`);
  console.log(`  Target: ${genesis.header.target.substring(0, 16)}...`);

  const storedGenesis = await chainStore.getBlock(genesisHash);
  if (!storedGenesis) {
    throw new Error('Genesis block not stored');
  }

  console.log('  ✅ Genesis block created and stored\n');

  // Test 2: Build and mine a block
  console.log('✓ Test 2: Build and mine a block');

  // Create some mock transactions
  const mockTxs = [
    {
      version: 1,
      from: 'gc1alice',
      nonce: 1,
      payloadHash: '00'.repeat(32),
      signatureHex: 'aabb',
      integrityHash: 'tx1hash'
    },
    {
      version: 1,
      from: 'gc1bob',
      nonce: 1,
      payloadHash: '00'.repeat(32),
      signatureHex: 'ccdd',
      integrityHash: 'tx2hash'
    }
  ];

  const buildResult = await builder.buildBlock(mockTxs);
  if (!buildResult) {
    throw new Error('Block building failed');
  }

  const { block: block1, hash: hash1, iterations } = buildResult;

  console.log(`  Block hash: ${hash1.substring(0, 16)}...`);
  console.log(`  Height: ${block1.header.height}`);
  console.log(`  Txs: ${block1.body.transactions.length}`);
  console.log(`  Mining iterations: ${iterations}`);

  // Verify PoW
  const powCheck = verifyPoW(block1.header);
  if (!powCheck.valid) {
    throw new Error('PoW verification failed');
  }

  console.log('  ✅ Block mined successfully\n');

  // Test 3: Fork choice (single chain)
  console.log('✓ Test 3: Fork choice with single chain');

  const forkChoice = new ForkChoice(chainStore);

  // Store block1
  const work1 = computeWork(block1.header.target);
  const genesisWork = 0n;

  await chainStore.putBlock(hash1, block1, {
    hash: hash1,
    chainwork: genesisWork + work1,
    status: 'valid'
  });

  const genesisMeta = await chainStore.getMeta(genesisHash);
  if (!genesisMeta) {
    throw new Error('Genesis meta not found');
  }

  const forkResult = await forkChoice.processBlock(hash1, block1.header, genesisMeta);

  console.log(`  New tip: ${forkResult.newTip.substring(0, 16)}...`);
  console.log(`  Reorg: ${forkResult.reorg}`);

  if (forkResult.newTip !== hash1) {
    throw new Error('Fork choice did not select new block as tip');
  }

  if (forkResult.reorg) {
    throw new Error('Expected no reorg for single chain');
  }

  console.log('  ✅ Fork choice working\n');

  // Test 4: Chain store queries
  console.log('✓ Test 4: Chain store queries');

  const tip = await chainStore.getTip();
  if (!tip || tip.hash !== hash1) {
    throw new Error('Tip not set correctly');
  }

  console.log(`  Tip hash: ${tip.hash.substring(0, 16)}...`);
  console.log(`  Tip height: ${tip.header.height}`);
  console.log(`  Chainwork: ${tip.meta.chainwork}`);

  const blockAtHeight1 = await chainStore.getBlockAtHeight(1n);
  if (!blockAtHeight1 || computeBlockId(blockAtHeight1.header) !== hash1) {
    throw new Error('getBlockAtHeight failed');
  }

  console.log('  ✅ Chain store queries working\n');

  // Test 5: Build second block
  console.log('✓ Test 5: Build second block on top of first');

  const buildResult2 = await builder.buildBlock([
    {
      version: 1,
      from: 'gc1charlie',
      nonce: 1,
      payloadHash: '00'.repeat(32),
      signatureHex: 'eeff',
      integrityHash: 'tx3hash'
    }
  ]);

  if (!buildResult2) {
    throw new Error('Block 2 building failed');
  }

  const { block: block2, hash: hash2 } = buildResult2;

  console.log(`  Block 2 hash: ${hash2.substring(0, 16)}...`);
  console.log(`  Height: ${block2.header.height}`);
  console.log(`  Parent: ${block2.header.parentHash.substring(0, 16)}...`);

  if (block2.header.parentHash !== hash1) {
    throw new Error('Block 2 parent hash incorrect');
  }

  if (block2.header.height !== 2n) {
    throw new Error('Block 2 height incorrect');
  }

  console.log('  ✅ Second block built successfully\n');

  // Test 6: Work computation
  console.log('✓ Test 6: Work computation');

  const work = computeWork(DEFAULT_BUILDER_CONFIG.target);
  console.log(`  Work per block: ${work}`);

  if (work <= 0n) {
    throw new Error('Work computation failed');
  }

  console.log('  ✅ Work computation correct\n');

  console.log('🎉 All Milestone 4 smoke tests passed!');
})().catch(err => {
  console.error('\n❌ Smoke test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
