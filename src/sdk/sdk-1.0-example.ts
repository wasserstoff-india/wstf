/**
 * SDK 1.0 Example Usage
 *
 * Complete example showing how to use the production-ready WSTFChain SDK
 * for both backend services and frontend applications.
 */

// ============================================================================
// Backend/Node.js Usage (@wstf/sdk)
// ============================================================================

import { WSTFSDK, SigAlg } from './index';
import type { BridgeRouteQuery, RouteSelectionPriority } from './bridge/types';

async function backendExample() {
  console.log('🚀 Backend SDK Example\n');

  // 1. Create SDK instance for devnet
  const sdk = WSTFSDK.create({
    network: 'devnet',  // or 'local', 'testnet', 'mainnet'
    rpcUrls: {
      core: 'https://devnet.rpc.wstf.xyz',
      indexer: 'https://devnet.indexer.wstf.xyz',
      p2p: 'https://devnet.p2p.wstf.xyz',
    },
    signer: WSTFSDK.generateSigner(SigAlg.ED25519),
    timeoutMs: 30000,
  });

  // 2. Network and cluster information
  const clusterInfo = await sdk.network.getClusterInfo();
  console.log('📊 Cluster Info:');
  console.log(`   Network: ${clusterInfo.network}`);
  console.log(`   Height: ${clusterInfo.height}`);
  console.log(`   Peers: ${clusterInfo.peers}`);
  console.log('');

  // 3. Node discovery
  const bridgeNodes = await sdk.nodes.listKnownNodes('bridge');
  console.log('🌉 Bridge Nodes:');
  bridgeNodes.forEach(node => {
    console.log(`   ${node.alias}: ${node.rpcUrl} (trust: ${node.trustScore})`);
  });
  console.log('');

  // 4. Bridge operations
  const routeQuery: BridgeRouteQuery = {
    srcChain: 'bsc',
    dstChain: 'polygon',
    token: 'USDT',
    minAmount: 100n * 1_000_000n, // $100 minimum
  };

  const routes = await sdk.bridge.listRoutes(routeQuery);
  console.log('🛣️  Available Routes:');
  routes.forEach(route => {
    console.log(`   ${route.providerName}: ${route.feeBps / 100}% fee, ${route.estimatedTimeSec}s`);
  });

  // Pick best route by priority
  const bestRoute = sdk.bridge.pickBestRoute(routes, 'balanced' as RouteSelectionPriority);
  if (bestRoute) {
    console.log(`✅ Best route: ${bestRoute.providerName}\n`);

    // Create bridge order
    const bridgeOrder = await sdk.bridge.openOrder({
      routeId: bestRoute.routeId,
      userAddress: sdk.address!,
      srcAmount: 1000n * 1_000_000n, // $1000
      dstAddress: '0x742d35Cc6634C0532925a3b8D0123456789abcdef',
    });

    console.log(`🎉 Bridge order created: ${bridgeOrder.orderId}`);
  }

  // 5. Bridge statistics
  const stats = await sdk.bridge.getBridgeStats();
  console.log('📈 Bridge Statistics:');
  console.log(`   Total Volume: $${stats.totalVolumeUsd.toLocaleString()}`);
  console.log(`   Active Providers: ${stats.activeProviders}`);
  console.log(`   Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
}

// ============================================================================
// Frontend/React Usage (@wasserstoff/wstf-kit)
// ============================================================================

/*
// Example React component using the frontend SDK

import React from 'react';
import {
  WstfProvider,
  NetworkSwitcher,
  BridgeForm,
  ProtectedPage,
  ConnectWallet,
  useBridgeRoutes,
  useWallet,
  useNetwork,
} from '../frontend-sdk';

function App() {
  return (
    <WstfProvider
      network="devnet"
      autoConnect={true}
      onNetworkChange={(network) => console.log('Network switched:', network.label)}
    >
      <div className="min-h-screen bg-gray-50">
        <Header />
        <Main />
      </div>
    </WstfProvider>
  );
}

function Header() {
  return (
    <div className="bg-white shadow-sm px-6 py-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">WSTFChain Bridge</h1>
        <div className="flex items-center gap-4">
          <NetworkSwitcher showLabel={true} showChainId={true} />
          <ConnectWallet />
        </div>
      </div>
    </div>
  );
}

function Main() {
  const { account } = useWallet();

  return (
    <div className="container mx-auto px-6 py-8">
      {account ? (
        <>
          <BridgeInterface />
          <ProtectedDashboard />
        </>
      ) : (
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Connect your wallet to get started
          </h2>
          <ConnectWallet buttonText="Connect Wallet" />
        </div>
      )}
    </div>
  );
}

function BridgeInterface() {
  const handleBridge = async (bridgeData) => {
    console.log('Creating bridge:', bridgeData);
    // Bridge logic here
  };

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4">Cross-Chain Bridge</h2>
      <BridgeForm
        supportedSrcChains={['bsc', 'polygon', 'eth']}
        supportedDstChains={['bsc', 'polygon', 'eth']}
        supportedTokens={['USDT', 'USDC', 'ETH']}
        defaultPriority="balanced"
        onBridgeSubmit={handleBridge}
      />
    </div>
  );
}

function ProtectedDashboard() {
  return (
    <ProtectedPage
      orgId="bridge.dashboard"
      permission="dashboard.view"
      fallback={
        <div className="text-center py-8 text-gray-500">
          You need dashboard permissions to view analytics.
        </div>
      }
    >
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">Bridge Analytics</h3>
        <BridgeStats />
      </div>
    </ProtectedPage>
  );
}

function BridgeStats() {
  const { data: routes } = useBridgeRoutes({
    srcChain: 'bsc',
    dstChain: 'polygon',
    token: 'USDT'
  });

  return (
    <div>
      <p>Available routes: {routes?.length || 0}</p>
    </div>
  );
}

export default App;
*/

// ============================================================================
// Usage Examples Summary
// ============================================================================

export const SDK_EXAMPLES = {
  // Backend: Bridge node monitoring
  bridgeNode: `
const sdk = WSTFSDK.createForNetwork('mainnet', signer);
const routes = await sdk.bridge.listRoutes({ srcChain: 'bsc', dstChain: 'polygon', token: 'USDT' });
const order = await sdk.bridge.openOrder({ routeId: routes[0].routeId, ... });
  `,

  // Backend: Indexer service
  indexer: `
const sdk = WSTFSDK.create({ network: 'mainnet', rpcUrls: { core: '...' } });
const stats = await sdk.bridge.getBridgeStats();
const providers = await sdk.bridge.listProviders();
  `,

  // Frontend: Wallet integration
  wallet: `
<WstfProvider network="mainnet">
  <ConnectWallet />
  <BridgeForm onBridgeSubmit={handleBridge} />
</WstfProvider>
  `,

  // Frontend: Gated dashboard
  dashboard: `
<ProtectedPage orgId="my.org" permission="admin.view">
  <AdminDashboard />
</ProtectedPage>
  `,
};

if (require.main === module) {
  backendExample().catch(console.error);
}