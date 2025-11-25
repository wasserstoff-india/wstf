#!/usr/bin/env tsx

/**
 * Testnet Utilities for WSTFChain
 *
 * Utilities for working with generated test keys for testnet operations.
 */

import fs from 'fs';
import path from 'path';
import { importSigner, SigAlg, createClient } from '../src/sdk';
import { TestKeySet, TestWallet } from './generate-test-keys';

class TestnetKeyManager {
  private keySet: TestKeySet | null = null;
  private keySetPath: string;

  constructor(keySetPath?: string) {
    this.keySetPath = keySetPath || path.join(__dirname, '../test/keys/testnet-keys.json');
  }

  /**
   * Load the test key set from disk
   */
  loadKeys(): TestKeySet {
    if (this.keySet) {
      return this.keySet;
    }

    if (!fs.existsSync(this.keySetPath)) {
      throw new Error(`Test keys not found at ${this.keySetPath}. Run generate-test-keys.ts first.`);
    }

    this.keySet = JSON.parse(fs.readFileSync(this.keySetPath, 'utf-8'));
    console.log(`✅ Loaded ${this.keySet!.metadata.totalKeys} test keys`);
    return this.keySet!;
  }

  /**
   * Get a specific wallet by ID
   */
  getWallet(id: number): TestWallet {
    const keySet = this.loadKeys();
    const wallet = [...keySet.keys.ed25519, ...keySet.keys.secp256k1]
      .find(w => w.id === id);

    if (!wallet) {
      throw new Error(`Wallet with ID ${id} not found`);
    }

    return wallet;
  }

  /**
   * Get a wallet by address
   */
  getWalletByAddress(address: string): TestWallet {
    const keySet = this.loadKeys();
    const wallet = keySet.quickAccess.addressToKey[address];

    if (!wallet) {
      throw new Error(`Wallet with address ${address} not found`);
    }

    return wallet;
  }

  /**
   * Get multiple random wallets
   */
  getRandomWallets(count: number = 5): TestWallet[] {
    const keySet = this.loadKeys();
    const allWallets = [...keySet.keys.ed25519, ...keySet.keys.secp256k1];

    const shuffled = allWallets.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Get wallets by algorithm
   */
  getWalletsByAlgorithm(algorithm: 'ed25519' | 'secp256k1'): TestWallet[] {
    const keySet = this.loadKeys();
    return keySet.keys[algorithm];
  }

  /**
   * Create a signer from a test wallet
   */
  createSigner(wallet: TestWallet) {
    const sigAlg = wallet.algorithm === 'secp256k1' ? SigAlg.SECP256K1 : SigAlg.ED25519;
    return importSigner(wallet.privateKeyPEM, sigAlg);
  }

  /**
   * Get all addresses for easy copying
   */
  getAllAddresses(): string[] {
    const keySet = this.loadKeys();
    return keySet.quickAccess.addresses;
  }

  /**
   * Display wallet information
   */
  displayWallet(wallet: TestWallet): void {
    console.log(`\n📱 Wallet #${wallet.id}`);
    console.log(`   Algorithm: ${wallet.algorithm}`);
    console.log(`   Address: ${wallet.address}`);
    console.log(`   Public Key: ${wallet.publicKey.slice(0, 32)}...`);
    console.log(`   Private Key (hex): ${wallet.privateKeyHex.slice(0, 16)}...`);
    console.log(`   Entropy: ${wallet.entropy.totalBits} bits from ${wallet.entropy.sources.join(', ')}`);
  }

  /**
   * Register multiple wallets with the accounts service
   */
  async registerWalletsWithAccountsService(
    count: number = 10,
    baseUrl: string = 'http://localhost:7001'
  ): Promise<void> {
    const keySet = this.loadKeys();
    const wallets = [...keySet.keys.ed25519, ...keySet.keys.secp256k1].slice(0, count);

    console.log(`\n🔄 Registering ${wallets.length} wallets with accounts service...`);

    for (const wallet of wallets) {
      try {
        const response = await fetch(`${baseUrl}/accounts/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            address: wallet.address,
            publicKeyBase64: wallet.publicKey,
            sigAlg: wallet.algorithm,
            username: `testuser${wallet.id}`
          }),
        });

        const result = await response.json();
        if (result.ok) {
          console.log(`   ✅ Registered wallet #${wallet.id}: ${wallet.address}`);
        } else {
          console.log(`   ❌ Failed to register wallet #${wallet.id}: ${result.error}`);
        }
      } catch (error) {
        console.log(`   ❌ Network error registering wallet #${wallet.id}: ${error}`);
      }
    }
  }

  /**
   * Create funded test accounts (for testnet)
   */
  async createFundedTestAccounts(
    rpcUrl: string = 'http://localhost:7002',
    count: number = 5
  ): Promise<void> {
    console.log(`\n💰 Creating ${count} funded test accounts...`);

    const client = createClient({ baseURL: rpcUrl });
    const wallets = this.getRandomWallets(count);

    for (const wallet of wallets) {
      const signer = this.createSigner(wallet);

      try {
        // In a real testnet, you might have a faucet endpoint
        // For now, just display the setup
        console.log(`   💳 Account #${wallet.id}:`);
        console.log(`      Address: ${wallet.address}`);
        console.log(`      Algorithm: ${wallet.algorithm}`);
        console.log(`      Ready for funding from testnet faucet`);
      } catch (error) {
        console.log(`   ❌ Error setting up account #${wallet.id}: ${error}`);
      }
    }
  }

  /**
   * Generate a shell script for easy testnet operations
   */
  generateTestnetScript(): void {
    const keySet = this.loadKeys();
    const scriptPath = path.join(__dirname, '../test/keys/testnet-operations.sh');

    const scriptContent = `#!/bin/bash

# WSTFChain Testnet Operations Script
# Generated: ${new Date().toISOString()}

set -e

# Configuration
ACCOUNTS_SERVICE="http://localhost:7001"
VALIDATOR_SERVICE="http://localhost:7002"
EXPLORER_SERVICE="http://localhost:7003"

# Color output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

echo -e "\${GREEN}🚀 WSTFChain Testnet Operations\${NC}"

# Function to register a wallet
register_wallet() {
    local id=$1
    local address=$2
    local pubkey=$3
    local algorithm=$4

    echo -e "\${YELLOW}Registering wallet #\${id} (\${algorithm}): \${address}\${NC}"

    curl -s -X POST "\${ACCOUNTS_SERVICE}/accounts/register" \\
         -H "Content-Type: application/json" \\
         -d "{
           \\"address\\": \\"\${address}\\",
           \\"publicKeyBase64\\": \\"\${pubkey}\\",
           \\"sigAlg\\": \\"\${algorithm}\\",
           \\"username\\": \\"testuser\${id}\\"
         }" | jq '.'
}

# Register first 10 wallets
echo -e "\${GREEN}📝 Registering wallets with accounts service...\${NC}"

${keySet.keys.ed25519.slice(0, 5).map(wallet =>
  `register_wallet ${wallet.id} "${wallet.address}" "${wallet.publicKey}" "ed25519"`
).join('\n')}

${keySet.keys.secp256k1.slice(0, 5).map(wallet =>
  `register_wallet ${wallet.id} "${wallet.address}" "${wallet.publicKey}" "secp256k1"`
).join('\n')}

echo -e "\${GREEN}✅ Testnet setup complete!\${NC}"
echo -e "\${YELLOW}📊 View explorer at: \${EXPLORER_SERVICE}\${NC}"

# Export sample addresses for easy access
export TESTNET_ADDR_1="${keySet.keys.ed25519[0]?.address || ''}"
export TESTNET_ADDR_2="${keySet.keys.ed25519[1]?.address || ''}"
export TESTNET_ADDR_3="${keySet.keys.secp256k1[0]?.address || ''}"
export TESTNET_ADDR_4="${keySet.keys.secp256k1[1]?.address || ''}"

echo -e "\${YELLOW}Environment variables set:\${NC}"
echo "TESTNET_ADDR_1=\${TESTNET_ADDR_1}"
echo "TESTNET_ADDR_2=\${TESTNET_ADDR_2}"
echo "TESTNET_ADDR_3=\${TESTNET_ADDR_3}"
echo "TESTNET_ADDR_4=\${TESTNET_ADDR_4}"
`;

    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, 0o755); // Make executable
    console.log(`✅ Generated testnet operations script: ${scriptPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new TestnetKeyManager();

  try {
    switch (command) {
      case 'load':
        const keySet = manager.loadKeys();
        console.log(`Loaded ${keySet.metadata.totalKeys} keys generated on ${keySet.metadata.generated}`);
        break;

      case 'show':
        const id = parseInt(args[1]);
        if (isNaN(id)) {
          console.error('Usage: show <wallet_id>');
          process.exit(1);
        }
        const wallet = manager.getWallet(id);
        manager.displayWallet(wallet);
        break;

      case 'random':
        const count = parseInt(args[1]) || 5;
        const randomWallets = manager.getRandomWallets(count);
        console.log(`\n🎲 ${count} random wallets:`);
        randomWallets.forEach(w => {
          console.log(`   #${w.id}: ${w.address} (${w.algorithm})`);
        });
        break;

      case 'addresses':
        const addresses = manager.getAllAddresses();
        console.log('📋 All testnet addresses:');
        addresses.forEach((addr, i) => {
          console.log(`${i + 1}. ${addr}`);
        });
        break;

      case 'register':
        const registerCount = parseInt(args[1]) || 10;
        const baseUrl = args[2] || 'http://localhost:7001';
        await manager.registerWalletsWithAccountsService(registerCount, baseUrl);
        break;

      case 'script':
        manager.generateTestnetScript();
        break;

      case 'fund':
        const fundCount = parseInt(args[1]) || 5;
        const rpcUrl = args[2] || 'http://localhost:7002';
        await manager.createFundedTestAccounts(rpcUrl, fundCount);
        break;

      default:
        console.log('🔧 WSTFChain Testnet Utilities');
        console.log('');
        console.log('Commands:');
        console.log('  load                    - Load test keys');
        console.log('  show <id>              - Show specific wallet');
        console.log('  random [count]         - Show random wallets');
        console.log('  addresses              - List all addresses');
        console.log('  register [count] [url] - Register wallets with accounts service');
        console.log('  script                 - Generate testnet operations script');
        console.log('  fund [count] [rpcUrl]  - Setup funded test accounts');
        console.log('');
        console.log('Examples:');
        console.log('  tsx testnet-utils.ts show 1');
        console.log('  tsx testnet-utils.ts random 3');
        console.log('  tsx testnet-utils.ts register 20');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { TestnetKeyManager };