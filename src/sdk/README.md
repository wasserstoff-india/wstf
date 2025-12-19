# @wasserstoff/wstf-sdk

[![npm version](https://img.shields.io/npm/v/@wasserstoff/wstf-sdk.svg?style=flat-square)](https://www.npmjs.com/package/@wasserstoff/wstf-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@wasserstoff/wstf-sdk.svg?style=flat-square)](https://www.npmjs.com/package/@wasserstoff/wstf-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/actions/workflow/status/wasserstoff-india/wstf/ci.yml?branch=main&style=flat-square)](https://github.com/wasserstoff-india/wstf/actions)
[![Test Coverage](https://img.shields.io/badge/tests-1369%20passing-brightgreen.svg?style=flat-square)](https://github.com/wasserstoff-india/wstf)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@wasserstoff/wstf-sdk?style=flat-square)](https://bundlephobia.com/package/@wasserstoff/wstf-sdk)

Type-safe TypeScript/JavaScript SDK for building on **WSTF Chain** - a deterministic, instruction-based multi-chain coordination layer by [Wasserstoff](https://wasserstoff.io).

This SDK wraps the WSTF Chain RPC / services and gives you:

- **Strict Branded Types** - Compile-time type safety for addresses, IDs, and hashes
- **Identities & Auth** - WSTFAuth token builder, Ed25519/secp256k1 signers (Zero Trust)
- **Tokens** - FT / NFT / SFT deployment & transfers
- **State (Vars)** - Authenticated key/value store with namespaces & RBAC
- **Markets** - On-chain orderbooks, LP grids (arith/geom spreads), trading
- **Exhaustive Error Handling** - Structured errors with full context

> Under the hood, everything ultimately talks to the WSTF Chain validator / explorer / enhanced RPC.
> The SDK doesn't bypass consensus - it just makes it much nicer to speak the chain's language.

---

## Installation

```bash
# via npm
npm install @wasserstoff/wstf-sdk

# via yarn
yarn add @wasserstoff/wstf-sdk

# via pnpm
pnpm add @wasserstoff/wstf-sdk
```

You'll also need a running WSTF Chain node (or devnet):

```bash
# From the main wstf repo
npm install
npm run build
npm start
```

---

## Quick Start

```ts
import { WSTFSDK, SigAlg, Side } from '@wasserstoff/wstf-sdk';

async function main() {
  // 1. Generate a signer
  const signer = WSTFSDK.generateSigner(SigAlg.ED25519);
  console.log('Address:', signer.address);

  // 2. Create SDK instance (for testing with in-memory RPC)
  const sdk = WSTFSDK.createForTesting(rpcService, signer);

  // Or create with real RPC endpoint:
  // const sdk = WSTFSDK.create({
  //   rpc: 'http://localhost:9101',
  //   signer,
  // });

  // 3. Use the tokens API
  const balance = await sdk.tokens.getBalance('tok_btc');
  console.log('Balance:', balance);

  // 4. Use the markets API
  const orderResult = await sdk.markets.placeOrder({
    marketId: 'mkt_btc_usdt' as any,
    side: Side.BID,
    price: 50000_00n,
    size: 100000n,
  });

  // 5. Use the vars API
  await sdk.vars.setMyJson('settings', { theme: 'dark' });
}

main().catch(console.error);
```

---

## SDK Architecture

The SDK mirrors the chain's architecture, but stays client-side:

```
@wasserstoff/wstf-sdk
  ├── core/           # Types, RPC client, signer, WSTFAuth
  │   ├── types.ts    # Branded types, validators, error codes
  │   ├── client.ts   # RPC client wrapper
  │   ├── signer.ts   # Keypair signer & WSTFAuth builder
  │   ├── tokens.ts   # Token operations (FT/NFT/SFT)
  │   ├── markets.ts  # Orderbook operations
  │   └── vars.ts     # Key/value storage
  ├── highlevel/
  │   ├── lp.ts       # LP helpers (presets, rebalancing)
  │   └── trading.ts  # Smart order helpers (TWAP, iceberg)
  └── index.ts        # WSTFSDK main entrypoint
```

Nothing in the SDK touches the consensus engine or storage directly - everything goes through the public WSTF Chain RPC.

---

## Core Concepts

### 1. Strict Branded Types

WSTF SDK uses **branded types** for compile-time type safety. This prevents accidentally mixing different ID types (e.g., passing an `OrderId` where a `MarketId` is expected).

#### Type Constructors (Validated)

```ts
import {
  asAddress,    // Throws TypeValidationError if invalid
  asTokenId,
  asMarketId,
  asOrderId,
  asGridId,
  asTradeId,
  asHex32,
} from '@wasserstoff/wstf-sdk';

// Create validated types
const addr = asAddress('gc1abc123def456...');      // Address
const token = asTokenId('tok_btc');                // TokenId
const market = asMarketId('mkt_abc123');           // MarketId
const order = asOrderId('ord_123abc');             // OrderId

// TypeValidationError if invalid
try {
  const bad = asAddress('invalid');
} catch (e) {
  console.log(e.typeName);  // "Address"
  console.log(e.reason);    // "must start with 'gc'..."
}
```

#### Safe Try Functions

```ts
import { tryAddress, tryTokenId, tryMarketId } from '@wasserstoff/wstf-sdk';

// Returns null instead of throwing
const addr = tryAddress('maybe_valid');
if (addr) {
  // addr is now Address type
}
```

#### Type Guards

```ts
import { isAddress, isTokenId, isMarketId } from '@wasserstoff/wstf-sdk';

const value: unknown = 'gc1abc...';
if (isAddress(value)) {
  // value is narrowed to Address type
  console.log('Valid address:', value);
}
```

#### Unsafe Casts (Internal Use)

For internal/testing code where you know the value is valid:

```ts
import { unsafe } from '@wasserstoff/wstf-sdk';

// Skips validation - use with caution!
const addr = unsafe.address('gc1...');
const token = unsafe.tokenId('tok_btc');
```

---

### 2. Client & Signer

#### Create a client

```ts
import { WSTFSDK } from '@wasserstoff/wstf-sdk';

const sdk = WSTFSDK.create({
  rpc: 'http://localhost:9101',
  signer: WSTFSDK.generateSigner(),
});
```

#### Create / import a signer

```ts
import { SigAlg, createSigner, importSigner } from '@wasserstoff/wstf-sdk';

// Generate new keypair
const signer = createSigner(SigAlg.ED25519);

// Or import from private key
const imported = importSigner(privateKeyPem, SigAlg.ED25519);

console.log('Address:', signer.address);
console.log('Signature Algorithm:', signer.sigAlg);
```

Signers are used for:
- Signing **transactions**
- Signing **WSTFAuth tokens** for HTTP / connector flows

> [!IMPORTANT]
> **Zero Trust Architecture**: All private keys are generated and held exclusively by the client via the `Signer`. The `Accounts` service only receives and stores the public key and derived address.

---

### 3. WSTFAuth: Authenticated Requests

```ts
// Simple auth token
const token = sdk.createAuthToken('markets-program');

// Scoped token with specific permissions
const scopedToken = sdk.createScopedToken('markets-program', [
  'order:place',
  'order:cancel',
]);

// Use in HTTP headers
const headers = {
  Authorization: `Bearer ${token}`,
};
```

#### Fluent API for token building

```ts
import { buildAuthToken } from '@wasserstoff/wstf-sdk';

const token = buildAuthToken(signer)
  .audience('markets-program')
  .scopes('order:place', 'order:cancel')
  .ttl(600)  // 10 minutes
  .jti()     // auto-generate unique ID
  .claim('custom', 'value')
  .sign(signer);
```

#### Token utilities

```ts
import { parseAuthToken, isAuthTokenExpired, getAuthTokenTTL } from '@wasserstoff/wstf-sdk';

const parsed = parseAuthToken(token);
console.log('Subject:', parsed?.sub);
console.log('Audience:', parsed?.aud);
console.log('Scopes:', parsed?.scp);

console.log('Expired:', isAuthTokenExpired(token));
console.log('TTL remaining:', getAuthTokenTTL(token), 'seconds');
```

---

### 4. Tokens: FT / NFT / SFT

#### Query balance

```ts
const result = await sdk.tokens.getBalance('tok_btc');
if (result.success && result.data) {
  console.log('Available:', result.data.available);
  console.log('Locked:', result.data.locked);
  console.log('Total:', result.data.total);
}
```

#### Transfer tokens

```ts
const result = await sdk.tokens.transfer({
  tokenId: 'tok_btc' as any,
  to: 'gc1recipient...',
  amount: 1000000n,
});
```

#### Format amounts

```ts
// Format bigint to human-readable string
const formatted = sdk.tokens.formatAmount(123456789n, 6);
// "123.456789"

// Parse human-readable string to bigint
const parsed = sdk.tokens.parseAmount('123.456789', 6);
// 123456789n
```

---

### 5. Vars: Namespaced Key/Value Store

Vars give you authenticated, RBAC-aware storage.

#### Namespaces

```ts
// Account namespace (your private storage)
const myNs = sdk.vars.myNamespace();
// "account:gc1..."

// Organization namespace
const orgNs = sdk.vars.orgNamespace('acme');
// "org:acme"

// App namespace
const appNs = sdk.vars.appNamespace('my-app');
// "app:my-app"

// Global namespace (admin only)
const globalNs = sdk.vars.globalNamespace();
// "global"
```

#### Set & get variables

```ts
// Typed setters
await sdk.vars.setMyString('name', 'Alice');
await sdk.vars.setMyNumber('score', 42);
await sdk.vars.setMyJson('config', { theme: 'dark', notifications: true });

// Get values
const config = await sdk.vars.getMyVar<{ theme: string }>('config');
if (config.success && config.data) {
  console.log('Theme:', config.data.value.theme);
}

// Check existence
const exists = await sdk.vars.exists(sdk.vars.myNamespace(), 'config');

// List variables
const list = await sdk.vars.listMyVars({ keyPrefix: 'config.' });
```

#### Optimistic concurrency

```ts
// Get current version
const current = await sdk.vars.getMyVar('counter');
const version = current.data?.version;

// Update with expected version (fails if changed)
await sdk.vars.setMyNumber('counter', 43, {
  expectedVersion: version,
});
```

---

### 6. Markets: Orderbooks, LP Grids, Trading

#### Query market state

```ts
// Get market info
const market = await sdk.markets.getMarket('mkt_btc_usdt' as any);

// Get top of book
const tob = await sdk.markets.getTopOfBook('mkt_btc_usdt' as any);
if (tob.success && tob.data) {
  console.log('Best Bid:', tob.data.bestBid);
  console.log('Best Ask:', tob.data.bestAsk);
  console.log('Spread:', tob.data.spread);
}

// Get full orderbook
const book = await sdk.markets.getOrderbook('mkt_btc_usdt' as any, 20);
```

#### Place orders

```ts
import { Side, OrderFlag } from '@wasserstoff/wstf-sdk';

// Limit order
const order = await sdk.markets.placeOrder({
  marketId: 'mkt_btc_usdt' as any,
  side: Side.BID,
  price: 50000_00n,
  size: 100000n,
  flags: [OrderFlag.POST_ONLY],
});

// Market order (IOC at extreme price)
const marketOrder = await sdk.markets.placeMarketOrder(
  'mkt_btc_usdt' as any,
  Side.BID,
  100000n
);
```

#### Cancel orders

```ts
// Cancel single order
await sdk.markets.cancelOrder(orderId);

// Cancel multiple orders
await sdk.markets.cancelOrders([orderId1, orderId2]);

// Cancel all orders in a market
await sdk.markets.cancelAllOrders('mkt_btc_usdt' as any);
```

#### LP Grids

```ts
import { SpreadMode, SideBias } from '@wasserstoff/wstf-sdk';

// Create a liquidity grid
const grid = await sdk.markets.createGrid({
  marketId: 'mkt_btc_usdt' as any,
  centerPrice: 50000_00n,
  halfWidth: 5000_00n,        // +/- 10%
  levelsPerSide: 20,
  mode: SpreadMode.ARITHMETIC,
  totalBaseSize: 1_000_000n,
  sideBias: SideBias.BOTH,
});

// Calculate grid levels before creating
const levels = sdk.markets.calculateGridLevels({
  marketId: 'mkt_btc_usdt' as any,
  centerPrice: 50000_00n,
  halfWidth: 5000_00n,
  levelsPerSide: 10,
  mode: SpreadMode.ARITHMETIC,
  totalBaseSize: 100_000n,
  sideBias: SideBias.BOTH,
});
console.log('Grid levels:', levels);
```

#### Utility methods

```ts
// Calculate escrow required for an order
const escrow = sdk.markets.calculateOrderEscrow(
  Side.BID,
  50000_00n,  // price
  100000n,    // size
  30          // feeBps
);
console.log('Quote needed:', escrow.quoteAmount);

// Align price to tick size
const aligned = sdk.markets.alignToTick(12345n, 100n);
// 12300n
```

---

### 7. LP Helper: Grid Strategies

The high-level LP helper provides preset strategies and utilities.

```ts
import { createLPHelper, GRID_PRESETS, SpreadMode } from '@wasserstoff/wstf-sdk';

const lp = createLPHelper(sdk.markets, sdk.tokens);

// Use a preset strategy
await lp.createGridFromPreset(
  'mkt_btc_usdt' as any,
  'MAJOR_PAIR',
  50000_00n,      // center price
  1_000_000n      // total base size
);

// Available presets:
// - STABLE_PAIR:   Tight spread (0.1%) for stablecoin pairs
// - MAJOR_PAIR:    Medium spread (0.5%) for major pairs
// - VOLATILE_PAIR: Wide spread (2%) with geometric spacing
// - ACCUMULATE:    Bid-only for accumulating base token
// - DISTRIBUTE:    Ask-only for distributing base token
```

#### Position tracking

```ts
// Get all LP positions
const positions = await lp.getMyPositions();

// Get specific position
const position = await lp.getPosition(gridId);
if (position.success && position.data) {
  console.log('Base in orders:', position.data.baseInOrders);
  console.log('Active orders:', position.data.activeOrders);
}
```

#### Rebalancing

```ts
// Check if grid needs rebalancing
const suggestion = await lp.getRebalanceSuggestion(gridId, currentPrice);
if (suggestion.success && suggestion.data) {
  console.log('Reason:', suggestion.data.reason);
  console.log('Suggested center:', suggestion.data.suggestedCenterPrice);
  console.log('Current utilization:', suggestion.data.currentUtilization, '%');
}
```

#### Fee estimation

```ts
const fees = lp.estimateFees(
  1_000_000n,  // grid value
  30,          // market fee (bps)
  2            // expected turnover per day
);

console.log('Daily fees:', fees.dailyFees);
console.log('Weekly fees:', fees.weeklyFees);
console.log('APY (bps):', fees.apyBps);
```

---

### 8. Trading Helper: Smart Orders

```ts
import { createTradingHelper, Side } from '@wasserstoff/wstf-sdk';

const trading = createTradingHelper(sdk.markets, sdk.tokens);

// Simple market orders
await trading.marketBuy('mkt_btc_usdt' as any, 100000n);
await trading.marketSell('mkt_btc_usdt' as any, 100000n);

// Limit orders
await trading.limitBuy('mkt_btc_usdt' as any, 50000_00n, 100000n);
await trading.limitSell('mkt_btc_usdt' as any, 51000_00n, 100000n);

// Post-only order
await trading.postOnly('mkt_btc_usdt' as any, Side.BID, 50000_00n, 100000n);
```

#### TWAP (Time-Weighted Average Price)

```ts
// Execute large order in slices over time
const result = await trading.executeTWAP(
  'mkt_btc_usdt' as any,
  Side.BID,
  {
    totalSize: 1_000_000n,
    slices: 10,
    intervalMs: 60000,     // 1 minute between slices
    maxSlippage: 100,      // Cancel if > 1% slippage
  }
);

console.log('Executed:', result.data?.executedSize);
console.log('Avg price:', result.data?.avgPrice);
console.log('Total fees:', result.data?.totalFees);
```

#### Iceberg orders

```ts
// Large order with visible tip
const result = await trading.executeIceberg(
  'mkt_btc_usdt' as any,
  Side.BID,
  {
    totalSize: 1_000_000n,
    visibleSize: 50_000n,
    price: 50000_00n,
  }
);
```

#### Market analysis

```ts
// Get spread info
const spread = await trading.getSpread('mkt_btc_usdt' as any);
console.log('Spread (bps):', spread.data?.spreadBps);
console.log('Mid price:', spread.data?.midPrice);

// Estimate slippage for a size
const slippage = await trading.estimateSlippage(
  'mkt_btc_usdt' as any,
  Side.BID,
  100000n
);
console.log('Estimated price:', slippage.data?.estimatedPrice);
console.log('Slippage (bps):', slippage.data?.slippageBps);
```

---

## Error Handling

All SDK methods return `SdkResult<T>` with structured errors:

```ts
import { SdkResult, SdkError, SdkErrorCode } from '@wasserstoff/wstf-sdk';

interface SdkResult<T> {
  success: boolean;
  data?: T;
  error?: SdkError;     // Structured error with full context
  code?: string;        // Deprecated - use error.code
}

interface SdkError {
  code: SdkErrorCode;   // Enum for exhaustive handling
  message: string;      // Human-readable message
  chainCode?: string;   // Underlying chain error code
  chainMessage?: string;
  details?: Record<string, unknown>;
}
```

#### Exhaustive Error Handling

```ts
import { SdkErrorCode } from '@wasserstoff/wstf-sdk';

const result = await sdk.tokens.transfer({
  tokenId: asTokenId('tok_btc'),
  to: asAddress('gc1recipient...'),
  amount: 1000n,
});

if (!result.success && result.error) {
  // TypeScript ensures all cases are handled
  switch (result.error.code) {
    // Authentication Errors
    case SdkErrorCode.AUTH_INVALID:
    case SdkErrorCode.AUTH_EXPIRED:
      console.log('Please re-authenticate');
      break;
    case SdkErrorCode.AUTH_PERMISSION_DENIED:
      console.log('Insufficient permissions');
      break;

    // Chain/State Errors
    case SdkErrorCode.CHAIN_INSUFFICIENT_BALANCE:
      console.log('Not enough tokens');
      break;
    case SdkErrorCode.CHAIN_TOKEN_NOT_FOUND:
      console.log('Token does not exist');
      break;
    case SdkErrorCode.CHAIN_MARKET_PAUSED:
      console.log('Market is paused');
      break;

    // Validation Errors
    case SdkErrorCode.VALIDATION_INVALID_INPUT:
    case SdkErrorCode.VALIDATION_TYPE_ERROR:
      console.log('Invalid input:', result.error.details);
      break;

    // Transaction Errors
    case SdkErrorCode.TX_REVERTED:
      console.log('Transaction reverted:', result.error.chainMessage);
      break;

    default:
      console.error('Unexpected error:', result.error.message);
  }
}
```

#### Error Code Categories

| Category | Prefix | Description |
|----------|--------|-------------|
| Authentication | `AUTH_*` | Token/signature issues |
| Network | `NETWORK_*` | RPC/connection errors |
| Validation | `VALIDATION_*` | Input validation failures |
| Chain/State | `CHAIN_*` | On-chain state errors |
| Transaction | `TX_*` | Transaction execution errors |
| Business | (none) | `NOT_FOUND`, `NOT_IMPLEMENTED`, etc. |

#### Type Guard for Errors

```ts
import { isSdkError, SdkError } from '@wasserstoff/wstf-sdk';

function handleError(err: unknown) {
  if (isSdkError(err)) {
    // err is now SdkError type
    console.log('SDK Error:', err.code, err.message);
  }
}
```

#### Map Chain Errors

```ts
import { mapChainError } from '@wasserstoff/wstf-sdk';

// Convert raw chain error to SdkError
const sdkError = mapChainError('INSUFFICIENT_BALANCE', 'Not enough BTC');
console.log(sdkError.code); // SdkErrorCode.CHAIN_INSUFFICIENT_BALANCE
```

---

## Types & Constants

### Enums

```ts
import {
  SigAlg,        // ED25519, SECP256K1
  TrustTier,     // PREFLIGHT, ADMITTED, INCLUDED, K_DEPTH, CROSS_CHAIN
  Side,          // BID, ASK
  MarketStatus,  // ACTIVE, PAUSED, CLOSED
  OrderStatus,   // OPEN, PARTIAL, FILLED, CANCELLED
  OrderFlag,     // POST_ONLY, IOC, FOK
  SpreadMode,    // ARITHMETIC, GEOMETRIC
  SideBias,      // BOTH, BID_ONLY, ASK_ONLY
  SdkErrorCode,  // Exhaustive error codes
} from '@wasserstoff/wstf-sdk';
```

### Constants

```ts
import {
  MAX_LEVELS_PER_SIDE,    // 64 - max grid levels per side
  MAX_MATCHES_PER_CALL,   // 100 - max matches per execution
  GEOM_RATIO_SCALE,       // 1_000_000n - scale for geometric ratio
} from '@wasserstoff/wstf-sdk';
```

### Branded Types

```ts
import type {
  Address,       // "gc..." addresses (branded)
  Hex32,         // 32-byte hex strings (branded)
  TokenId,       // Token identifiers (branded)
  MarketId,      // Market identifiers (branded)
  OrderId,       // Order identifiers (branded)
  GridId,        // Grid identifiers (branded)
  TradeId,       // Trade identifiers (branded)
} from '@wasserstoff/wstf-sdk';
```

### Type Constructors

```ts
import {
  // Validated constructors (throw on invalid input)
  asAddress, asHex32, asTokenId, asMarketId, asOrderId, asGridId, asTradeId,

  // Safe try functions (return null on invalid)
  tryAddress, tryHex32, tryTokenId, tryMarketId, tryOrderId, tryGridId, tryTradeId,

  // Type guards
  isAddress, isHex32, isTokenId, isMarketId, isOrderId, isGridId, isTradeId,

  // Unsafe casts (skip validation)
  unsafe,

  // Validation error
  TypeValidationError,
} from '@wasserstoff/wstf-sdk';
```

---

## Hello World: Simple Market Maker Bot

Here's a complete example of a simple market maker using the SDK:

```ts
import {
  WSTFSDK,
  SigAlg,
  Side,
  SpreadMode,
  SideBias,
  createLPHelper,
  createTradingHelper,
  GRID_PRESETS,
  asMarketId,
  SdkErrorCode,
} from '@wasserstoff/wstf-sdk';

const MARKET_ID = 'mkt_btc_usdt';
const REBALANCE_THRESHOLD = 80; // Rebalance when 80% utilized

async function main() {
  // Setup
  const signer = WSTFSDK.generateSigner(SigAlg.ED25519);
  const sdk = WSTFSDK.create({
    rpc: process.env.RPC_URL || 'http://localhost:9101',
    signer,
  });

  const lp = createLPHelper(sdk.markets, sdk.tokens);
  const trading = createTradingHelper(sdk.markets, sdk.tokens);

  console.log('Market Maker Bot starting...');
  console.log('Address:', sdk.address);

  // Get current market price
  const tob = await sdk.markets.getTopOfBook(MARKET_ID as any);
  if (!tob.success || !tob.data?.lastPrice) {
    console.log('No price data, waiting...');
    return;
  }

  const currentPrice = tob.data.lastPrice;
  console.log('Current price:', currentPrice);

  // Create initial grid using MAJOR_PAIR preset
  console.log('Creating LP grid...');
  const gridResult = await lp.createGridFromPreset(
    MARKET_ID as any,
    'MAJOR_PAIR',
    currentPrice,
    1_000_000n  // 1M base tokens
  );

  if (!gridResult.success || !gridResult.data) {
    console.error('Failed to create grid:', gridResult.error);
    return;
  }

  const gridId = gridResult.data.gridId;
  console.log('Grid created:', gridId);
  console.log('Orders placed:', gridResult.data.levelsCreated);

  // Monitor and rebalance loop
  while (true) {
    await sleep(60000); // Check every minute

    // Get current price
    const newTob = await sdk.markets.getTopOfBook(MARKET_ID as any);
    if (!newTob.success || !newTob.data?.lastPrice) continue;

    const newPrice = newTob.data.lastPrice;

    // Check if rebalancing is needed
    const suggestion = await lp.getRebalanceSuggestion(gridId, newPrice);

    if (suggestion.success && suggestion.data) {
      if (suggestion.data.currentUtilization >= REBALANCE_THRESHOLD) {
        console.log('Rebalancing needed:', suggestion.data.reason);

        // Cancel current grid
        await sdk.markets.cancelGrid(gridId);

        // Create new grid at current price
        await lp.createGridFromPreset(
          MARKET_ID as any,
          'MAJOR_PAIR',
          newPrice,
          1_000_000n
        );

        console.log('Rebalanced to price:', newPrice);
      }
    }

    // Log status
    const position = await lp.getPosition(gridId);
    if (position.success && position.data) {
      console.log(`Status: ${position.data.activeOrders} orders active`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
```

---

## Testing

Run SDK tests:

```bash
# SDK unit tests only
npx vitest run src/sdk/sdk.test.ts

# All tests including SDK
npx vitest run
```

Test coverage includes:
- Signer generation and signing (Ed25519, SECP256K1)
- WSTFAuth token creation and parsing
- SDK initialization
- Token formatting utilities
- Market calculation utilities
- LP helper validation
- Trading helper creation

---

## Contributing

1. Fork the repo
2. Implement feature in `src/sdk/...`
3. Add tests in `src/sdk/sdk.test.ts`
4. Run:
   ```bash
   npm run build
   npx vitest run src/sdk/
   ```
5. Open a PR

---

## License

MIT
