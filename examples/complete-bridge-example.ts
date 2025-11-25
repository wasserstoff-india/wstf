/**
 * Complete Bridge System Example
 *
 * Demonstrates the full chain-of-chains bridge system with:
 * 1. WSTFChain as the coordination layer
 * 2. Bridge provider registration and routing
 * 3. Cross-chain bridge execution
 * 4. Access-gated frontend with WSTFAuth
 * 5. Unified SDK usage
 */

import { WSTFSDK, generateKeypair, SigAlg } from '../src/sdk';
import { wstfAuth } from '../src/auth/wstf-auth';
import { bridgeRegistry } from '../src/service/bridge-registry/registry';
import { BridgeRunner } from '../src/service/bridge-runner/runner';

/**
 * Example 1: Bridge Provider Setup
 * Shows how a bridge provider registers and starts serving
 */
async function exampleBridgeProvider() {
  console.log('🌉 Setting up Bridge Provider...\n');

  // 1. Create provider identity
  const providerKeypair = generateKeypair(SigAlg.ED25519);
  console.log(`Provider Address: ${providerKeypair.address}`);

  // 2. Create SDK instance
  const sdk = WSTFSDK.create({
    rpc: 'http://localhost:8545',
    signer: providerKeypair,
    bridgeRegistryUrl: 'http://localhost:8545/bridge',
    authApiUrl: 'http://localhost:8545/auth'
  });

  // 3. Register as bridge provider
  console.log('Registering as bridge provider...');
  const providerResult = await sdk.bridge.registerAsProvider({
    name: 'Lightning Bridge Co.',
    description: 'Fast and reliable cross-chain bridges',
    website: 'https://lightningbridge.io',
    supportedChains: ['bsc', 'polygon', 'ethereum'],
    contactInfo: {
      email: 'support@lightningbridge.io',
      telegram: '@lightningbridge'
    },
    emergencyContact: providerKeypair.address,
    slaCommitments: {
      maxConfirmationTime: 300, // 5 minutes
      uptimeGuarantee: 99.5,
      refundPolicy: 'Full refund for failed transactions within 24 hours'
    }
  });

  if (providerResult.success) {
    console.log('✅ Provider registered successfully');
  } else {
    console.error('❌ Provider registration failed:', providerResult);
    return;
  }

  // 4. Register bridge routes
  console.log('Registering bridge routes...');

  // BSC USDT -> Polygon USDT route
  const routeResult = await sdk.bridge.registerRoute({
    routeId: 'bsc_usdt_polygon_usdt_v1',
    srcChainId: 'bsc',
    srcToken: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
    srcTokenStandard: 'erc20',
    dstChainId: 'polygon',
    dstToken: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon USDT
    dstTokenStandard: 'erc20',
    providerName: 'Lightning Bridge Co.',
    minAmount: 100n * 1000000n, // $100 minimum
    maxAmount: 100000n * 1000000n, // $100k maximum
    dailyLimit: 1000000n * 1000000n, // $1M daily limit
    feeBps: 30, // 0.3% fee
    gasEstimate: 25n * 1000000000000000n, // ~0.025 ETH gas cost
    avgConfirmationTime: 180, // 3 minutes average
    requiredConfirmations: 15,
    trustScore: 850,
    isActive: true
  });

  if (routeResult.success) {
    console.log(`✅ Route registered: ${routeResult.routeId}`);
  } else {
    console.error('❌ Route registration failed:', routeResult);
    return;
  }

  // 5. Start bridge runner (off-chain service)
  console.log('Starting bridge runner service...');

  const bridgeRunner = new BridgeRunner({
    wstfRpcUrl: 'http://localhost:8545',
    wstfSigner: providerKeypair,
    chainConnections: {
      bsc: {
        rpcUrl: 'https://bsc-dataseed1.binance.org',
        privateKey: '0x' + Buffer.from(providerKeypair.privateKey).toString('hex'),
        walletAddress: '0x...' // Provider's BSC wallet
      },
      polygon: {
        rpcUrl: 'https://polygon-rpc.com',
        privateKey: '0x' + Buffer.from(providerKeypair.privateKey).toString('hex'),
        walletAddress: '0x...' // Provider's Polygon wallet
      }
    },
    providerName: 'Lightning Bridge Co.',
    supportedRoutes: ['bsc_usdt_polygon_usdt_v1'],
    maxConcurrentBridges: 10,
    maxAmountPerBridge: 100000n * 1000000n,
    dailyVolumeLimit: 10000000n * 1000000n,
    requiredConfirmations: {
      bsc: 15,
      polygon: 20
    },
    enabledChains: ['bsc', 'polygon'],
    emergencyStop: false
  });

  await bridgeRunner.start();
  console.log('✅ Bridge runner started and monitoring for requests\n');
}

/**
 * Example 2: User Bridge Request
 * Shows how a user discovers routes and requests a bridge
 */
async function exampleUserBridge() {
  console.log('💸 User Bridge Request Example...\n');

  // 1. Create user identity
  const userKeypair = generateKeypair(SigAlg.ED25519);
  console.log(`User Address: ${userKeypair.address}`);

  // 2. Create SDK instance
  const sdk = WSTFSDK.create({
    rpc: 'http://localhost:8545',
    signer: userKeypair
  });

  // 3. Discover available routes
  console.log('Discovering bridge routes...');
  const routes = await sdk.bridge.discoverRoutes(
    'bsc',
    'polygon',
    '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon USDT
    1000n * 1000000n, // $1000
    { priority: 'cost' }
  );

  if (routes.length === 0) {
    console.error('❌ No routes available for this bridge');
    return;
  }

  console.log(`✅ Found ${routes.length} available route(s)`);
  const bestRoute = routes[0];
  console.log(`   Best route: ${bestRoute.route.routeId}`);
  console.log(`   Provider: ${bestRoute.provider.name}`);
  console.log(`   Fee: ${bestRoute.route.feeBps / 100}%`);
  console.log(`   Estimated time: ${bestRoute.estimatedTime} seconds`);

  // 4. Estimate bridge cost
  const estimate = await sdk.bridge.estimateBridge(
    'bsc',
    'polygon',
    '0x55d398326f99059fF775485246999027B3197955',
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    1000n * 1000000n
  );

  if (estimate.available) {
    console.log(`   Total cost: ${estimate.estimatedFee.toString()} wei`);
    console.log(`   Confidence: ${estimate.confidence}%`);
  }

  // 5. Submit bridge request
  console.log('Submitting bridge request...');
  const bridgeResult = await sdk.bridge.requestBridge(
    'bsc',
    'polygon',
    '0x55d398326f99059fF775485246999027B3197955',
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    1000n * 1000000n,
    {
      dstRecipient: '0x742d35Cc6634C0532925a3b8D0001234567890ab', // User's Polygon address
      maxFeeBps: 50, // Accept up to 0.5% fee
      priorityLevel: 'standard'
    }
  );

  console.log(`✅ Bridge request submitted!`);
  console.log(`   Request ID: ${bridgeResult.requestId}`);
  console.log(`   TX Hash: ${bridgeResult.txHash}`);
  console.log(`   Estimated completion: ${bridgeResult.estimatedTime} seconds`);

  // 6. Monitor bridge progress
  console.log('Monitoring bridge progress...');
  const finalResult = await sdk.bridge.monitorBridgeRequest(bridgeResult.requestId, {
    pollInterval: 5000,
    maxDuration: 10 * 60 * 1000, // 10 minutes
    onStatusUpdate: (status, result) => {
      console.log(`   Status: ${status}`);
      if (result?.srcTxHash) {
        console.log(`   Source TX: ${result.srcTxHash}`);
      }
      if (result?.dstTxHash) {
        console.log(`   Destination TX: ${result.dstTxHash}`);
      }
    }
  });

  if (finalResult.status === 'fulfilled') {
    console.log('✅ Bridge completed successfully!');
    console.log(`   Final amount: ${finalResult.actualDstAmount?.toString()}`);
  } else {
    console.log(`❌ Bridge failed: ${finalResult.reason}`);
  }

  console.log('');
}

/**
 * Example 3: Access-Gated Bridge Frontend
 * Shows how to create a gated frontend for bridge access
 */
async function exampleGatedFrontend() {
  console.log('🔐 Access-Gated Frontend Example...\n');

  // 1. Create frontend owner
  const ownerKeypair = generateKeypair(SigAlg.ED25519);
  console.log(`Frontend Owner: ${ownerKeypair.address}`);

  // 2. Create SDK instance
  const sdk = WSTFSDK.create({
    rpc: 'http://localhost:8545',
    signer: ownerKeypair
  });

  // 3. Create gated bridge resource
  console.log('Creating access-controlled bridge frontend...');

  const resourceResult = await sdk.auth.createResource(
    'premium_bridge_frontend',
    'Premium Bridge Frontend',
    {
      description: 'Advanced bridge interface with premium features',
      defaultLevel: 'read',
      allowSelfRegistration: false,
      initialEntries: [
        {
          publicKey: ownerKeypair.address,
          label: 'Frontend Owner',
          level: 'admin',
          scopes: ['*']
        }
      ]
    }
  );

  if (resourceResult.success) {
    console.log('✅ Gated resource created');
  } else {
    console.error('❌ Resource creation failed:', resourceResult.error);
    return;
  }

  // 4. Grant access to premium users
  const premiumUsers = [
    { address: 'gc_premium_user_1', name: 'Premium User 1' },
    { address: 'gc_premium_user_2', name: 'Premium User 2' },
    { address: 'gc_vip_user_1', name: 'VIP User 1' }
  ];

  console.log('Granting access to premium users...');
  for (const user of premiumUsers) {
    await sdk.auth.grantAccess('premium_bridge_frontend', user.address, {
      label: user.name,
      level: user.name.includes('VIP') ? 'write' : 'read',
      scopes: user.name.includes('VIP')
        ? ['bridge_read', 'bridge_execute', 'premium_features']
        : ['bridge_read', 'premium_features'],
      expiresAt: BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
  }

  console.log(`✅ Access granted to ${premiumUsers.length} premium users`);

  // 5. Create gated URL for frontend
  const userKeypair = generateKeypair(SigAlg.ED25519);
  const userSDK = WSTFSDK.create({
    rpc: 'http://localhost:8545',
    signer: userKeypair
  });

  // Simulate user authentication
  const authResult = await userSDK.auth.authenticate('premium_bridge_frontend');
  if (authResult.success && authResult.token) {
    const gatedURLResult = await userSDK.auth.createGatedURL(
      'premium_bridge_frontend',
      'https://bridge.example.com'
    );

    if (gatedURLResult.success) {
      console.log(`✅ Gated URL created: ${gatedURLResult.gatedURL}`);
      console.log(`   Expires: ${new Date(gatedURLResult.expiresAt!)}`);
    }
  }

  console.log('');
}

/**
 * Example 4: Complete Integration
 * Shows the full flow from setup to bridge execution
 */
async function exampleCompleteIntegration() {
  console.log('🚀 Complete Integration Example...\n');

  // 1. Setup stakeholders
  const providerKeypair = generateKeypair(SigAlg.ED25519);
  const userKeypair = generateKeypair(SigAlg.ED25519);
  const frontendOwnerKeypair = generateKeypair(SigAlg.ED25519);

  console.log('Stakeholders:');
  console.log(`  Bridge Provider: ${providerKeypair.address}`);
  console.log(`  User: ${userKeypair.address}`);
  console.log(`  Frontend Owner: ${frontendOwnerKeypair.address}`);
  console.log('');

  // 2. Create unified access control for bridge ecosystem
  const frontendSDK = WSTFSDK.create({
    rpc: 'http://localhost:8545',
    signer: frontendOwnerKeypair
  });

  console.log('Setting up bridge ecosystem access control...');

  // Create main bridge access resource
  await frontendSDK.auth.createResource('bridge_ecosystem', 'Bridge Ecosystem', {
    description: 'Complete cross-chain bridge platform',
    defaultLevel: 'read',
    allowSelfRegistration: false
  });

  // Grant provider admin access
  await frontendSDK.auth.grantAccess('bridge_ecosystem', providerKeypair.address, {
    label: 'Lightning Bridge Provider',
    level: 'admin',
    scopes: ['*']
  });

  // Grant user bridge access
  await frontendSDK.auth.grantAccess('bridge_ecosystem', userKeypair.address, {
    label: 'Bridge User',
    level: 'write',
    scopes: ['bridge_read', 'bridge_execute']
  });

  console.log('✅ Access control configured');

  // 3. Provider registers and starts service (authenticated)
  const providerSDK = WSTFSDK.create({
    rpc: 'http://localhost:8545',
    signer: providerKeypair
  });

  // Authenticate provider
  const providerAuth = await providerSDK.auth.authenticate('bridge_ecosystem');
  if (providerAuth.success) {
    console.log('✅ Provider authenticated');

    // Register route with authentication
    await providerSDK.bridge.registerRoute({
      routeId: 'authenticated_bridge_route',
      srcChainId: 'bsc',
      srcToken: '0x55d398326f99059fF775485246999027B3197955',
      srcTokenStandard: 'erc20',
      dstChainId: 'polygon',
      dstToken: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      dstTokenStandard: 'erc20',
      providerName: 'Authenticated Lightning Bridge',
      minAmount: 50n * 1000000n,
      maxAmount: 50000n * 1000000n,
      dailyLimit: 500000n * 1000000n,
      feeBps: 25,
      gasEstimate: 20n * 1000000000000000n,
      avgConfirmationTime: 120,
      requiredConfirmations: 10,
      trustScore: 900,
      isActive: true
    });

    console.log('✅ Authenticated route registered');
  }

  // 4. User accesses gated frontend and bridges
  const userSDK = WSTFSDK.create({
    rpc: 'http://localhost:8545',
    signer: userKeypair
  });

  // Authenticate user
  const userAuth = await userSDK.auth.authenticate('bridge_ecosystem');
  if (userAuth.success) {
    console.log('✅ User authenticated');

    // Use the quick bridge method (combines auth + bridge)
    const quickBridgeResult = await userSDK.quickBridge({
      resourceId: 'bridge_ecosystem',
      srcChainId: 'bsc',
      dstChainId: 'polygon',
      srcToken: '0x55d398326f99059fF775485246999027B3197955',
      dstToken: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      amount: 500n * 1000000n, // $500
      dstRecipient: '0x742d35Cc6634C0532925a3b8D0001234567890ab',
      priorityLevel: 'fast',
      monitor: false // Don't wait for completion in demo
    });

    if (quickBridgeResult.success) {
      console.log('✅ Quick bridge request submitted');
      console.log(`   Request ID: ${quickBridgeResult.requestId}`);
      console.log(`   TX Hash: ${quickBridgeResult.txHash}`);
    }
  }

  // 5. Generate access summary
  const accessSummary = await userSDK.getBridgeAccessSummary();
  console.log('\nUser Bridge Access Summary:');
  console.log(`  Can Read: ${accessSummary.canRead}`);
  console.log(`  Can Execute: ${accessSummary.canExecute}`);
  console.log(`  Available Routes: ${accessSummary.availableRoutes}`);
  console.log(`  Access Resources: ${accessSummary.accessResources.length}`);

  console.log('\n🎉 Complete integration example finished!');
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('='.repeat(60));
  console.log('🌉 WSTF Chain-of-Chains Bridge System Demo');
  console.log('='.repeat(60));
  console.log('');

  try {
    await exampleBridgeProvider();
    await exampleUserBridge();
    await exampleGatedFrontend();
    await exampleCompleteIntegration();

  } catch (error) {
    console.error('❌ Example failed:', error);
  }

  console.log('='.repeat(60));
  console.log('Demo completed!');
  console.log('='.repeat(60));
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  exampleBridgeProvider,
  exampleUserBridge,
  exampleGatedFrontend,
  exampleCompleteIntegration,
  runExamples
};