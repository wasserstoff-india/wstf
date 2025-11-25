# 🚀 WSTFChain Quickstart Guide

Get up and running with WSTFChain in under 5 minutes.

## Prerequisites

- **Node.js 18+** (or let wstfctl install it automatically)
- **Git** for cloning the repository

## 1. Clone & Setup

```bash
# Clone the repository
git clone https://github.com/wasserstoff-india/wstfchain.git
cd wstfchain

# One-command setup (installs Node.js if needed)
./scripts/wstfctl.sh setup
```

The setup script will:
- ✅ Check/install Node.js 18+ via nvm if needed
- ✅ Install all dependencies
- ✅ Build the project

## 2. Start Services

### Interactive Mode (Recommended)
```bash
./scripts/wstfctl.sh run --interactive
```

Choose from these options:
- **Local devnet** - Full development stack with all services
- **Testnet follower** - Explorer + indexer only
- **Bridge node** - Cross-chain bridge coordination
- **Custom** - Select specific services

### Direct Command Mode
```bash
# Full local development stack
./scripts/wstfctl.sh run --profile local --services accounts,validator,explorer,mempool,p2p,bridge,indexer

# Bridge node only
./scripts/wstfctl.sh run --profile testnet --services bridge

# Testnet follower
./scripts/wstfctl.sh run --profile testnet --services explorer,indexer
```

## 3. Verify Services are Running

```bash
# Check service health
./scripts/wstfctl.sh health

# Or manually test endpoints
curl http://localhost:7001/capabilities  # Accounts service
curl http://localhost:7002/capabilities  # Validator service
curl http://localhost:7003/capabilities  # Explorer service
```

## 4. Test the System

### Run the Complete Test Suite
```bash
npm run test:full
```

Expected result: **1215 tests passing** 🎉

### Run Specific Test Categories
```bash
# Core functionality
npm run test:crypto
npm run test:instructions
npm run test:auth

# Integration tests
npm run test:integration
npm run test:determinism

# Chaos testing
npm run test:chaos
```

## 5. SDK Integration

### Backend/Node SDK

Install in your Node.js project:
```bash
npm install @wstf/sdk
```

Basic usage:
```typescript
import { WSTFSDK } from '@wstf/sdk';

// Connect to your local devnet
const sdk = WSTFSDK.createForNetwork('local');

// Query network info
const info = await sdk.network.getClusterInfo();
console.log('Chain ID:', info.chainId);

// Bridge operations
const routes = await sdk.bridge.listRoutes({
  srcChain: 'bsc',
  dstChain: 'polygon',
  token: 'USDT'
});
```

### Frontend/React SDK

Install in your React app:
```bash
npm install @wasserstoff/wstf-kit
```

Basic setup:
```tsx
import { WstfProvider, BridgeForm, NetworkSwitcher } from '@wasserstoff/wstf-kit';

function App() {
  return (
    <WstfProvider network="local" autoConnect={true}>
      <div>
        <NetworkSwitcher showLabel={true} />
        <BridgeForm
          supportedChains={['bsc', 'polygon', 'eth']}
          onBridgeSubmit={handleBridge}
        />
      </div>
    </WstfProvider>
  );
}
```

## 6. Build Your First Bridge App

Create a new directory for your app:
```bash
mkdir my-bridge-app && cd my-bridge-app
npm init -y
npm install @wstf/sdk
```

Create a simple bridge script:
```typescript
// bridge-example.ts
import { WSTFSDK, createSigner } from '@wstf/sdk';

async function main() {
  // Connect to local devnet
  const signer = createSigner('ed25519');
  const sdk = WSTFSDK.createForNetwork('local', signer);

  // Register account if needed
  await sdk.accounts.ensureRegistered();

  // Find best bridge route
  const routes = await sdk.bridge.listRoutes({
    srcChain: 'bsc',
    dstChain: 'polygon',
    token: 'USDT'
  });

  if (routes.length > 0) {
    console.log('Best route:', routes[0]);

    // Create bridge order
    const order = await sdk.bridge.openOrder({
      routeId: routes[0].routeId,
      userAddress: sdk.address,
      srcAmount: 1000_000000n, // 1000 USDT
      dstAddress: '0x742d35Cc6B6B58c0532C8b5F50C3AC2F76a2D1c5'
    });

    console.log('Bridge order created:', order.orderId);
  }
}

main().catch(console.error);
```

Run it:
```bash
npx ts-node bridge-example.ts
```

## 7. Network Profiles

| Profile | Use Case | Services | Ports |
|---------|----------|----------|-------|
| **local** | Development | All services | 7001-7003 |
| **testnet** | Testing | Bridge, explorer | Public testnet |
| **devnet** | Staging | Full stack | Devnet endpoints |

## 8. Next Steps

### Explore the Features
- **Bridge System** - Cross-chain asset transfers with route optimization
- **Access Control** - Gated UIs and organization-based permissions
- **Markets** - On-chain orderbook with LP grids
- **Token System** - FT/NFT/SFT with metadata and royalties

### Development Workflows
```bash
# Development mode with hot reload
npm run start:dev

# Production build and test
npm run build && npm run test:full

# Performance benchmarking
npm run bench:eval
```

### Documentation
- [Architecture Overview](README.md#architecture)
- [API Reference](README.md#sdk--frontend-integration)
- [Testing Guide](README.md#testing--verification)
- [Contributing Guidelines](README.md#contributing)

---

## Troubleshooting

### Node.js Issues
```bash
# Check Node version
node --version  # Should be 18+

# Manual nvm installation
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install --lts
```

### Service Port Conflicts
```bash
# Check what's using the ports
lsof -i :7001
lsof -i :7002
lsof -i :7003

# Kill conflicting processes if needed
killall node
```

### Build Issues
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Test Failures
```bash
# Run with verbose output
npm run test:full -- --reporter=verbose

# Check specific failing tests
npm run test:unit:watch
```

---

**🎉 Congratulations!** You now have a fully functional WSTFChain development environment.

Start building cross-chain applications with deterministic execution, bridge coordination, and access control.

**Questions?** Check the [full documentation](README.md) or [open an issue](https://github.com/wasserstoff-india/wstfchain/issues).