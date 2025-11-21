/**
 * Milestone 3 Smoke Tests: P2P, Mempool, Gossip
 */
import { P2PService } from '../p2p/service';
import { MempoolService } from '../mempool/service';
import {
  encodeMessage,
  decodeMessage,
  createPeerHello,
  createPing,
  createInv,
  MessageType
} from '../p2p/messages';
import { DEFAULT_CONFIG } from '../config/types';

(async () => {
  console.log('🧪 Starting Milestone 3 smoke tests...\n');

  // Test 1: Message encoding/decoding
  console.log('✓ Test 1: P2P message encoding/decoding');
  const hello = createPeerHello('node1', '1.0.0', ['p2p', 'validator']);
  const encoded = encodeMessage(hello);
  const { message: decoded } = decodeMessage(encoded);

  if (decoded.type !== MessageType.PEER_HELLO) {
    throw new Error('Message type mismatch');
  }

  if (decoded.peerId !== 'node1') {
    throw new Error('Peer ID mismatch');
  }

  console.log(`  Encoded: ${encoded.length} bytes`);
  console.log(`  Decoded type: ${decoded.type}, peer: ${decoded.peerId}`);
  console.log('  ✅ Message roundtrip successful\n');

  // Test 2: Mempool policy enforcement
  console.log('✓ Test 2: Mempool policy enforcement');
  const mempoolService = new MempoolService(DEFAULT_CONFIG.services.mempool);

  // Add a valid transaction
  const tx1 = {
    version: 1,
    from: 'gc1test1',
    nonce: 1,
    payloadHash: '00'.repeat(32),
    signatureHex: 'aabb'
  };

  const result1 = await mempoolService.submit(tx1, false); // Skip validation for smoke test
  if (!result1.ok) {
    throw new Error(`Failed to add tx1: ${result1.reason}`);
  }

  console.log(`  Added tx1: ${result1.id}`);

  // Try to add the same transaction (duplicate suppression)
  const result2 = await mempoolService.submit(tx1, false);
  if (result2.ok) {
    throw new Error('Expected duplicate rejection');
  }

  if (result2.code !== 'DUPLICATE_TX') {
    throw new Error(`Expected DUPLICATE_TX, got ${result2.code}`);
  }

  console.log(`  Duplicate rejected: ${result2.code}`);

  // Add multiple txs from same sender (test per-sender limit)
  const senderLimit = DEFAULT_CONFIG.services.mempool.policy.maxTxPerSender;
  let addedCount = 1; // Already added tx1

  for (let i = 2; i <= senderLimit + 5; i++) {
    const tx = {
      version: 1,
      from: 'gc1test1',
      nonce: i,
      payloadHash: '00'.repeat(32),
      signatureHex: `aa${i}`
    };

    const result = await mempoolService.submit(tx, false);
    if (result.ok) {
      addedCount++;
    } else if (result.code === 'SENDER_LIMIT_EXCEEDED') {
      console.log(`  Sender limit enforced at ${addedCount} txs (limit: ${senderLimit})`);
      break;
    }
  }

  if (addedCount > senderLimit) {
    throw new Error(`Sender limit not enforced: added ${addedCount}, limit ${senderLimit}`);
  }

  console.log('  ✅ Mempool policy enforcement working\n');

  // Test 3: Mempool stats
  console.log('✓ Test 3: Mempool stats');
  const stats = mempoolService.getStats();
  console.log(`  Total txs: ${stats.totalTxs}`);
  console.log(`  Total bytes: ${stats.totalBytes}`);
  console.log(`  Txs by sender:`, stats.txsBySender);

  if (stats.totalTxs === 0) {
    throw new Error('Expected non-zero transactions in mempool');
  }

  console.log('  ✅ Mempool stats working\n');

  // Test 4: P2P service initialization (no network)
  console.log('✓ Test 4: P2P service initialization');
  const p2pConfig = {
    ...DEFAULT_CONFIG.services.p2p,
    enabled: true,
    port: 19001 // Use high port to avoid conflicts
  };

  const p2pService = new P2PService(p2pConfig);
  await p2pService.start();

  const peers = p2pService.getPeers();
  console.log(`  P2P service started, connected peers: ${peers.length}`);

  await p2pService.stop();
  console.log('  ✅ P2P service lifecycle working\n');

  // Test 5: Inv message creation
  console.log('✓ Test 5: Gossip messages (Inv)');
  const inv = createInv('tx', ['hash1', 'hash2', 'hash3']);
  const invEncoded = encodeMessage(inv);
  const { message: invDecoded } = decodeMessage(invEncoded);

  if (invDecoded.type !== MessageType.INV) {
    throw new Error('Expected INV message');
  }

  if (invDecoded.invType !== 'tx') {
    throw new Error('Expected invType=tx');
  }

  if (invDecoded.ids.length !== 3) {
    throw new Error('Expected 3 IDs');
  }

  console.log(`  Inv message: type=${invDecoded.invType}, ids=${invDecoded.ids.length}`);
  console.log('  ✅ Gossip messages working\n');

  // Test 6: Rate limiter (deterministic)
  console.log('✓ Test 6: Rate limiter');
  const { RateLimiter } = await import('../p2p/rateLimit');
  const limiter = new RateLimiter({
    messagesPerSecond: 10,
    bytesPerSecond: 1000,
    windowMs: 1000
  });

  // Should allow first 10 messages
  for (let i = 0; i < 10; i++) {
    const result = limiter.checkLimit('peer1', 50);
    if (!result.allowed) {
      throw new Error(`Expected message ${i} to be allowed`);
    }
  }

  // 11th message should be blocked
  const blocked = limiter.checkLimit('peer1', 50);
  if (blocked.allowed) {
    throw new Error('Expected 11th message to be blocked');
  }

  console.log(`  Rate limit enforced: ${blocked.reason}`);
  console.log('  ✅ Rate limiter working\n');

  console.log('🎉 All Milestone 3 smoke tests passed!');
})().catch(err => {
  console.error('\n❌ Smoke test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
