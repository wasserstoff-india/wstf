#!/usr/bin/env tsx

/**
 * Generate Test Keys for WSTFChain
 *
 * Creates 100 secure test wallets using enhanced entropy generation
 * for testnet and development purposes.
 */

import fs from 'fs';
import path from 'path';
import { generatePaperWalletBatch, SigAlg } from '../src/sdk/core/signer';

interface TestKeySet {
  metadata: {
    generated: string;
    totalKeys: number;
    entropyMethod: string;
    algorithms: string[];
    purpose: string;
  };
  keys: {
    ed25519: TestWallet[];
    secp256k1: TestWallet[];
  };
  quickAccess: {
    addresses: string[];
    addressToKey: Record<string, TestWallet>;
  };
}

interface TestWallet {
  id: number;
  algorithm: string;
  address: string;
  publicKey: string;
  privateKeyPEM: string;
  privateKeyHex: string;
  entropy: {
    sources: string[];
    totalBits: number;
    method: string;
  };
}

async function generateTestKeys(): Promise<void> {
  console.log('🔐 Generating 100 test keys for WSTFChain testnet...');
  console.log('🎲 Using enhanced entropy with multiplication method');

  // Generate 50 Ed25519 wallets
  console.log('\n📝 Generating 50 Ed25519 wallets...');
  const ed25519Wallets = generatePaperWalletBatch(50, {
    sigAlg: SigAlg.ED25519,
    useEnhancedEntropy: true,
    useMultiplicationMethod: true
  });

  // Generate 50 secp256k1 wallets
  console.log('📝 Generating 50 secp256k1 wallets...');
  const secp256k1Wallets = generatePaperWalletBatch(50, {
    sigAlg: SigAlg.SECP256K1,
    useEnhancedEntropy: true,
    useMultiplicationMethod: true
  });

  // Convert to test wallet format
  const ed25519TestWallets: TestWallet[] = ed25519Wallets.map((wallet, index) => ({
    id: index + 1,
    algorithm: 'ed25519',
    address: wallet.address,
    publicKey: wallet.publicKey,
    privateKeyPEM: wallet.privateKeyPEM,
    privateKeyHex: Buffer.from(wallet.privateKeyRaw).toString('hex'),
    entropy: wallet.entropy
  }));

  const secp256k1TestWallets: TestWallet[] = secp256k1Wallets.map((wallet, index) => ({
    id: index + 51, // Continue numbering
    algorithm: 'secp256k1',
    address: wallet.address,
    publicKey: wallet.publicKey,
    privateKeyPEM: wallet.privateKeyPEM,
    privateKeyHex: Buffer.from(wallet.privateKeyRaw).toString('hex'),
    entropy: wallet.entropy
  }));

  // Create quick access maps
  const allWallets = [...ed25519TestWallets, ...secp256k1TestWallets];
  const addresses = allWallets.map(w => w.address);
  const addressToKey: Record<string, TestWallet> = {};
  allWallets.forEach(wallet => {
    addressToKey[wallet.address] = wallet;
  });

  // Create complete test key set
  const testKeySet: TestKeySet = {
    metadata: {
      generated: new Date().toISOString(),
      totalKeys: 100,
      entropyMethod: 'enhanced-multiplication',
      algorithms: ['ed25519', 'secp256k1'],
      purpose: 'testnet-development'
    },
    keys: {
      ed25519: ed25519TestWallets,
      secp256k1: secp256k1TestWallets
    },
    quickAccess: {
      addresses,
      addressToKey
    }
  };

  // Ensure test directory exists
  const testDir = path.join(__dirname, '../test/keys');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Save complete key set
  const keySetPath = path.join(testDir, 'testnet-keys.json');
  fs.writeFileSync(keySetPath, JSON.stringify(testKeySet, null, 2));
  console.log(`✅ Saved complete key set to: ${keySetPath}`);

  // Generate individual key files for easy access
  const individualsDir = path.join(testDir, 'individual');
  if (!fs.existsSync(individualsDir)) {
    fs.mkdirSync(individualsDir, { recursive: true });
  }

  allWallets.forEach((wallet, index) => {
    const keyFile = {
      id: wallet.id,
      algorithm: wallet.algorithm,
      address: wallet.address,
      publicKey: wallet.publicKey,
      privateKeyPEM: wallet.privateKeyPEM,
      privateKeyHex: wallet.privateKeyHex,
      entropy: wallet.entropy
    };

    const filename = `key-${String(wallet.id).padStart(3, '0')}-${wallet.algorithm}-${wallet.address.slice(0, 8)}.json`;
    fs.writeFileSync(
      path.join(individualsDir, filename),
      JSON.stringify(keyFile, null, 2)
    );
  });
  console.log(`✅ Saved ${allWallets.length} individual key files to: ${individualsDir}`);

  // Generate convenient access formats
  await generateConvenienceFormats(testKeySet, testDir);

  // Generate statistics
  generateStatistics(testKeySet);

  console.log('\n🎉 Test key generation complete!');
  console.log('📂 Files generated:');
  console.log(`   - testnet-keys.json (complete set)`);
  console.log(`   - testnet-addresses.txt (address list)`);
  console.log(`   - testnet-keys.env (environment variables)`);
  console.log(`   - testnet-keys.csv (spreadsheet format)`);
  console.log(`   - individual/*.json (100 individual key files)`);
}

async function generateConvenienceFormats(testKeySet: TestKeySet, testDir: string): Promise<void> {
  // Address list
  const addressListPath = path.join(testDir, 'testnet-addresses.txt');
  const addressList = testKeySet.quickAccess.addresses.join('\n');
  fs.writeFileSync(addressListPath, addressList);
  console.log(`✅ Saved address list to: ${addressListPath}`);

  // Environment variables format
  const envPath = path.join(testDir, 'testnet-keys.env');
  const envContent = [
    '# WSTFChain Testnet Keys',
    '# Generated: ' + testKeySet.metadata.generated,
    '',
    ...testKeySet.keys.ed25519.slice(0, 10).map((wallet, i) =>
      `ED25519_KEY_${i + 1}_ADDRESS=${wallet.address}\nED25519_KEY_${i + 1}_PRIVATE=${wallet.privateKeyHex}`
    ).join('\n').split('\n'),
    '',
    ...testKeySet.keys.secp256k1.slice(0, 10).map((wallet, i) =>
      `SECP256K1_KEY_${i + 1}_ADDRESS=${wallet.address}\nSECP256K1_KEY_${i + 1}_PRIVATE=${wallet.privateKeyHex}`
    ).join('\n').split('\n')
  ].join('\n');
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Saved environment format to: ${envPath}`);

  // CSV format
  const csvPath = path.join(testDir, 'testnet-keys.csv');
  const csvHeaders = 'ID,Algorithm,Address,PublicKey,PrivateKeyHex,EntropyBits,EntropySources';
  const csvRows = [...testKeySet.keys.ed25519, ...testKeySet.keys.secp256k1]
    .map(wallet => [
      wallet.id,
      wallet.algorithm,
      wallet.address,
      wallet.publicKey,
      wallet.privateKeyHex,
      wallet.entropy.totalBits,
      wallet.entropy.sources.join(';')
    ].join(','));
  const csvContent = [csvHeaders, ...csvRows].join('\n');
  fs.writeFileSync(csvPath, csvContent);
  console.log(`✅ Saved CSV format to: ${csvPath}`);
}

function generateStatistics(testKeySet: TestKeySet): void {
  console.log('\n📊 Generation Statistics:');
  console.log(`   Total keys: ${testKeySet.metadata.totalKeys}`);
  console.log(`   Ed25519 keys: ${testKeySet.keys.ed25519.length}`);
  console.log(`   secp256k1 keys: ${testKeySet.keys.secp256k1.length}`);
  console.log(`   Entropy method: ${testKeySet.metadata.entropyMethod}`);

  // Analyze entropy distribution
  const entropyStats = [...testKeySet.keys.ed25519, ...testKeySet.keys.secp256k1]
    .reduce((acc, wallet) => {
      const method = wallet.entropy.method;
      acc[method] = (acc[method] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  console.log('   Entropy distribution:');
  Object.entries(entropyStats).forEach(([method, count]) => {
    console.log(`     ${method}: ${count} keys`);
  });

  // Sample addresses for verification
  console.log('\n🔍 Sample addresses (for verification):');
  testKeySet.quickAccess.addresses.slice(0, 5).forEach((addr, i) => {
    const wallet = testKeySet.quickAccess.addressToKey[addr];
    console.log(`   ${i + 1}. ${addr} (${wallet.algorithm})`);
  });
}

// Run the script
if (require.main === module) {
  generateTestKeys().catch(error => {
    console.error('❌ Error generating test keys:', error);
    process.exit(1);
  });
}

export { generateTestKeys, TestKeySet, TestWallet };