import crypto from 'crypto';
import { MappingAlgId, SigAlgId } from '../crypto/algorithms';
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { deriveAddress, publicKeyMatchesAddress } from '../crypto/address';
import { emptyPayloadHash, preimageBasic, integrityHash } from '../tx/hash';
import { signPreimage, verifyPreimage } from '../crypto/sign';
import { validateBasicTx } from '../validator/basicValidator';

(async () => {
  console.log('🧪 Starting smoke test...\n');

  // Test 1: Create ed25519 account
  console.log('✓ Test 1: Generating Ed25519 keypair');
  const kp = generateKeypair(SigAlgId.ED25519);
  const pubDER = exportPubDER(kp.publicKey);
  const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
  console.log(`  Address: ${address}`);

  // Test 2: Verify pubkey matches address
  console.log('\n✓ Test 2: Verifying public key matches address');
  if (!publicKeyMatchesAddress(kp.publicKey, address)) {
    throw new Error('pubkey mismatch');
  }
  console.log('  ✅ Public key matches address');

  // Test 3: Create and sign transaction
  console.log('\n✓ Test 3: Creating and signing transaction');
  const nonce = 1n;
  const payloadHash = emptyPayloadHash().toString('hex');
  const pre = preimageBasic(address, nonce, payloadHash);
  const ih = integrityHash(pre).toString('hex');
  const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, pre).toString('hex');
  console.log(`  Nonce: ${nonce}`);
  console.log(`  Integrity Hash: ${ih.slice(0, 16)}...`);
  console.log(`  Signature: ${sig.slice(0, 16)}...`);

  // Test 4: Verify signature directly
  console.log('\n✓ Test 4: Verifying signature');
  const ok = verifyPreimage(SigAlgId.ED25519, kp.publicKey, pre, Buffer.from(sig, 'hex'));
  if (!ok) {
    throw new Error('signature verify failed');
  }
  console.log('  ✅ Signature verification passed');

  // Test 5: Validate via validator
  console.log('\n✓ Test 5: Validating transaction via validator');
  const tx = {
    version: 1 as const,
    from: address,
    nonce,
    payloadHash,
    integrityHash: ih,
    signature: sig,
    publicKey: pubDER.toString('base64')
  };

  const ctx = {
    getAccountState: async (_a: string) => ({
      nonce: 0n,
      publicKey: pubDER.toString('base64'),
      sigAlgId: SigAlgId.ED25519
    })
  };

  const res = await validateBasicTx(tx, ctx);
  if (!res.ok) {
    throw new Error(`validator failed: ${res.code}`);
  }
  console.log('  ✅ Transaction validation passed');

  // Test 6: Test secp256k1
  console.log('\n✓ Test 6: Testing secp256k1 algorithm');
  const kp2 = generateKeypair(SigAlgId.SECP256K1);
  const pubDER2 = exportPubDER(kp2.publicKey);
  const address2 = deriveAddress(pubDER2, MappingAlgId.SIMPLE_HASH, SigAlgId.SECP256K1);
  console.log(`  secp256k1 Address: ${address2}`);

  const pre2 = preimageBasic(address2, 1n, payloadHash);
  const sig2 = signPreimage(SigAlgId.SECP256K1, kp2.privateKey, pre2);
  const ok2 = verifyPreimage(SigAlgId.SECP256K1, kp2.publicKey, pre2, sig2);
  if (!ok2) {
    throw new Error('secp256k1 signature verify failed');
  }
  console.log('  ✅ secp256k1 signature verification passed');

  console.log('\n🎉 All smoke tests passed!');
})().catch(err => {
  console.error('\n❌ Smoke test failed:', err.message);
  process.exit(1);
});
