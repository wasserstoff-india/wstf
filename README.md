# WSTF Chain

<!-- CI & Build Status -->
[![CI](https://github.com/wasserstoff-india/wstf/actions/workflows/ci.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/ci.yml)
[![Benchmark](https://github.com/wasserstoff-india/wstf/actions/workflows/benchmark.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/benchmark.yml)
[![Check](https://github.com/wasserstoff-india/wstf/actions/workflows/check.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/check.yml)

<!-- Test Coverage -->
![Tests](https://img.shields.io/badge/tests-607%20passing-brightgreen?style=flat-square&logo=vitest)
![Coverage](https://img.shields.io/badge/coverage-22%20test%20files-blue?style=flat-square)
![Unit Tests](https://img.shields.io/badge/unit%20tests-496-green?style=flat-square)
![Chaos Tests](https://img.shields.io/badge/chaos%20tests-111-orange?style=flat-square)

<!-- Security & Auth -->
![WSTFAuth](https://img.shields.io/badge/WSTFAuth-Enabled-success?style=flat-square&logo=shield)
![DDoS Protection](https://img.shields.io/badge/DDoS-Protected-success?style=flat-square&logo=cloudflare)
![Rate Limiting](https://img.shields.io/badge/Rate%20Limiting-Enabled-success?style=flat-square)
![Chaos Tested](https://img.shields.io/badge/Chaos-Tested-blueviolet?style=flat-square)

<!-- Architecture -->
![Deterministic](https://img.shields.io/badge/Execution-Deterministic-blueviolet?style=flat-square)
![Event Sourced](https://img.shields.io/badge/Events-Structured%20Logs-blue?style=flat-square)
![Service Connectors](https://img.shields.io/badge/Connectors-SDK%20Ready-green?style=flat-square)

<!-- Tech Stack -->
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-20+-green?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

> **A deterministic, modular wallet-chain with native authentication, structured events, and service connector SDK. Sign anywhere, verify anywhere, orchestrate multi-chain actions.**

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [What It Can Do Today](#what-it-can-do-today)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [WSTFAuth System](#wstfauth-system)
- [Service Connector SDK](#service-connector-sdk)
- [Event System](#event-system)
- [System Opcodes](#system-opcodes)
- [Testing](#testing)
- [Test Results Summary](#test-results-summary)
- [Services](#services)
- [Wire Formats](#wire-formats)
- [Milestones](#milestones)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## The Problem

Multi-chain applications need a coordination layer that can:
- Verify signatures from any chain without trusting external RPCs
- Execute deterministic logic that produces identical results on every node
- Maintain auditable state with optimistic concurrency
- Authenticate requests with cryptographic proof of identity
- Compose services independently (run what you need, nothing more)

## The Solution

WSTFChain is a **programmable instruction plane** for the multi-chain world:

- **Language-agnostic**: Binary IR (ULEB128 + canonical CBOR) works with any client
- **Deterministic**: Pure execution—same inputs always produce same outputs
- **Authenticated**: Native WSTFAuth tokens with Ed25519/secp256k1 signatures
- **Event-sourced**: Structured logs with indexed topics for efficient queries
- **Composable**: Service connector SDK for building integrations
- **Auditable**: Git-like state versioning with Merkle proofs

---

## What It Can Do Today

| Capability | Description |
|------------|-------------|
| **Create identities** | Generate Ed25519/secp256k1 keys, derive addresses, bind usernames |
| **Authorize actions** | WSTFAuth tokens with audience binding, expiry, and signature verification |
| **Manage state** | REG/INIT/UPDATE with optimistic concurrency and deterministic merges |
| **Record signatures** | SIGN opcode anchors signatures (auditable, hashed into state) |
| **Verify signatures** | VERIFY opcode validates signatures inside programs (consensus-critical) |
| **Accept attestations** | XVAL opcode for cross-chain receipts with proof bundles (stub) |
| **Emit events** | Structured event logs with indexed topics (up to 4 per event) |
| **Register programs** | On-chain program registry with policies, access control, and stats |
| **Connect services** | SDK for building external service integrations with auth flow |
| **Anti-spam protection** | Rate limiting, trust tiers, and paymaster sponsorship |
| **Gossip transactions** | P2P dedup + rate limiting; mempool policies by size/sender |
| **Produce blocks** | Builder mines at configurable target; validator re-executes and checks roots |
| **Fork choice** | Cumulative-work tip selection with reorg handling |

---

## Quick Start

```bash
# Clone
git clone https://github.com/wasserstoff-india/wstf.git
cd wstf

# Install & build
npm install && npm run build

# Run all tests (607 passing)
npm run test:full

# Start services
npm start                    # accounts + validator + explorer
npm run start:m3             # + p2p + mempool
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Applications                                │
├─────────────────────────────────────────────────────────────────────┤
│  Compiler API    │   Identity RPC   │   Explorer / Indexer          │
├──────────────────┴──────────────────┴───────────────────────────────┤
│                       Service Layer                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Accounts │ │ Validator│ │ Mempool  │ │ Builder  │ │Connectors│  │
│  │  :7001   │ │  :7002   │ │  :7004   │ │  :7005   │ │   SDK    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                       Auth Layer (WSTFAuth)                          │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Token Format: <base64url(json)>.<signatureHex>                │ │
│  │  Claims: sub, aud, iat, exp, jti, method, path, scope          │ │
│  │  Algorithms: Ed25519, secp256k1                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                       Core Engine                                    │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Executor (deterministic)  │  Instruction Runner │  Event Logs │ │
│  ├────────────────────────────┼─────────────────────┼─────────────┤ │
│  │  SYS Module (9 opcodes)    │  PROG Module        │  Indexed    │ │
│  └────────────────────────────┴─────────────────────┴─────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                       Consensus Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Block Types  │  │  PoW Mining  │  │ Fork Choice  │              │
│  │ (184B header)│  │ (2xSHA256)   │  │ (cum. work)  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
├─────────────────────────────────────────────────────────────────────┤
│                       Network Layer                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  P2P Gossip (CBOR)  │  Rate Limiting  │  Peer Management       │ │
│  └────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                       Storage Layer                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Chain Store  │  │ State Store  │  │ Account Store│              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── crypto/              # Ed25519, secp256k1, address derivation
├── auth/                # WSTFAuth token signing/validation
│   ├── wstf.ts          # Core auth implementation
│   ├── wstf.test.ts     # Unit tests (27 tests)
│   └── wstf.chaos.test.ts # Chaos tests (49 tests)
├── tx/                  # Tx v1 (basic) and v2 (instructions)
├── instructions/        # Binary IR, ABI, compiler, decoder
├── executor/            # Deterministic execution engine
│   └── modules/         # SYS, PROG modules
├── events/              # Structured event logging
│   └── logs/            # Indexed event logs with topics
├── programs/            # Program registry and policies
├── service/             # Service connector SDK
│   └── connector/       # Auth flow, mood game harness
├── trust/               # Trust tiers, confirmation tracking
├── fastpath/            # Hot Window, Preflight, Journal
├── economics/           # Gas metering, fees, rent, balances
├── paymaster/           # Sponsorship, vouchers
├── rpc/                 # RPC services (simple + enhanced)
├── accounts/            # Account state management
├── validator/           # Transaction validation
├── p2p/                 # Gossip protocol, peer management
├── mempool/             # Transaction pool with policies
├── block/               # Block types, PoW, Merkle roots
├── chain/               # Chain store, fork choice, block builder
├── storage/             # KVStore abstraction, memory adapter
├── observability/       # Health endpoints, metrics
├── registry/            # INS module registry
├── explorer/            # Query service
├── config/              # Feature flags, configuration
├── runner/              # Service orchestration
├── integration/         # E2E and determinism tests
└── test/                # Smoke tests

test/
├── unit/                # Unit tests
├── differential/        # 2-node determinism tests
└── vectors/             # Golden test vectors
```

---

## How It Works

### 1. Transaction Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Client  │───>│ WSTFAuth │───>│ Mempool  │───>│ Builder  │───>│  Block   │
│          │    │  Verify  │    │  Admit   │    │  Include │    │  Commit  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     │  Sign Token   │  Validate     │  Rate Limit   │  Execute      │  State
     │  with Key     │  Signature    │  + Prioritize │  Instructions │  Update
     └───────────────┴───────────────┴───────────────┴───────────────┘
```

### 2. Instruction Execution

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Instruction Runner                               │
├─────────────────────────────────────────────────────────────────────┤
│  1. Decode IR (ULEB128 + CBOR)                                      │
│  2. Validate module/method exists                                   │
│  3. Check caller permissions                                        │
│  4. Execute with gas metering                                       │
│  5. Collect effects (writes, events, logs)                          │
│  6. Return deterministic result                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. Event Emission

```typescript
// Emit structured event with indexed topics
emitEvent({
  module: 'SYS.PROG',
  key: eventKeyFromString('PROGRAM_REGISTERED'),
  topics: [
    topicFromString(programId),    // Topic 0: Program ID
    topicFromAddress(owner),       // Topic 1: Owner address
  ],
  data: encodeEventData({ name, version })
});
```

---

## WSTFAuth System

### Token Format

```
<base64url(JSON payload)>.<signature hex>
```

### Payload Claims

| Claim | Type | Required | Description |
|-------|------|----------|-------------|
| `sub` | string | Yes | Subject (gc1... address) |
| `aud` | string | Yes | Audience (program ID) |
| `iat` | number | Yes | Issued at (Unix timestamp) |
| `exp` | number | Yes | Expiry (Unix timestamp) |
| `jti` | string | No | Unique token ID (replay protection) |
| `method` | string | No | HTTP method binding |
| `path` | string | No | Path binding |
| `scope` | string[] | No | Permission scopes |

### Example Usage

```typescript
import { signToken, validateToken } from './auth/wstf';
import { generateKeypair } from './crypto/keys';
import { deriveAddress } from './crypto/address';

// Generate identity
const keypair = generateKeypair(SigAlgId.ED25519);
const address = deriveAddress(exportPubDER(keypair.publicKey), ...);

// Sign token
const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
  sub: address,
  aud: 'my.program/v1',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300, // 5 min
});

// Validate token
const result = validateToken(token, keypair.publicKey, SigAlgId.ED25519, 'my.program/v1');
// result: { valid: true, payload: {...}, caller: 'gc1...' }
```

### Security Features

- **Signature verification**: Ed25519/secp256k1 cryptographic signatures
- **Audience binding**: Token only valid for intended program
- **Expiry enforcement**: Automatic rejection of expired tokens
- **Clock skew tolerance**: 30-second grace period
- **Replay protection**: Optional JTI claim for uniqueness
- **Address binding**: Subject must match derived address from public key

---

## Service Connector SDK

Build external services that integrate with WSTFChain:

```typescript
import { authorizeRequest, extractRequestContext } from './service/connector';

// In your service handler
async function handleRequest(req: Request) {
  const context = extractRequestContext(req.headers);

  const auth = await authorizeRequest(context, {
    programId: 'my.service/v1',
    resolvePublicKey: async (addr) => lookupKey(addr),
  });

  if (!auth.authorized) {
    return { status: 401, error: auth.code };
  }

  // Proceed with authenticated caller
  const caller = auth.caller;
  // ...
}
```

### Mood Game Test Harness

A complete example service that demonstrates the full auth + trust + balance + external service flow:

```typescript
import { moodHandler, MoodRequest, MoodGameDeps } from './service/connector/moodGame';

const response = await moodHandler(request, deps, config);
// Returns: { mood: 'happy' | 'sad' | 'angry', status: number, code?: string }
```

| Scenario | Auth | Trust | Balance | External | Mood | Status |
|----------|------|-------|---------|----------|------|--------|
| Happy path | OK | OK | OK | OK | happy | 200 |
| Bad signature | FAIL | - | - | - | sad | 401 |
| Tier too low | OK | FAIL | - | - | sad | 403 |
| No balance | OK | OK | FAIL | - | angry | 402 |
| Upstream down | OK | OK | OK | FAIL | angry | 502 |
| Rate limited | OK | OK | OK | - | angry | 429 |

---

## Event System

### Event Structure

```typescript
interface EventLog {
  module: string;              // e.g., 'SYS.PROG'
  key: EventKey;               // 32-byte event identifier
  topics: Topic[];             // Up to 4 indexed topics (32 bytes each)
  data: EventData;             // Arbitrary hex-encoded data
}
```

### Event Keys (Predefined)

| Key | Module | Description |
|-----|--------|-------------|
| `PROGRAM_REGISTERED` | SYS.PROG | New program registered |
| `PROGRAM_UPDATED` | SYS.PROG | Program metadata/policy updated |
| `PROGRAM_STATUS_CHANGED` | SYS.PROG | Status changed (active/paused/etc) |
| `CALL_LOCAL` | RUNNER | Instruction call started |
| `CALL_RESULT` | RUNNER | Instruction call completed |
| `CALL_FAILED` | RUNNER | Instruction call failed |

### Querying Events

```typescript
import { filterLogs, hasTopicPrefix } from './events/logs';

// Find all events for a specific program
const logs = filterLogs(allLogs, {
  module: 'SYS.PROG',
  key: EVENT_KEY_PROGRAM_REGISTERED,
});

// Check if event has a topic
const matches = hasTopicPrefix(log, topicFromString('my.program/v1'));
```

---

## System Opcodes

The **SYS module** provides built-in opcodes:

| Opcode | Selector | Description |
|--------|----------|-------------|
| `REG` | 0x01 | Register a new state object (type, owner, writer) |
| `INIT` | 0x02 | Initialize state data (version check, full replacement) |
| `UPDATE` | 0x03 | Patch state data (optimistic concurrency, merge operations) |
| `SIGN` | 0x04 | Anchor a signature into state (auditable record) |
| `VERIFY` | 0x05 | Verify a signature inside execution (consensus-critical) |
| `RENT` | 0x06 | Pay rent for state storage |
| `XVAL` | 0x07 | Accept external attestation/proof bundle (stub) |

The **SYS.PROG module** provides program registry opcodes:

| Opcode | Description |
|--------|-------------|
| `PROG_REGISTER` | Register a new program with metadata and policy |
| `PROG_UPDATE` | Update program metadata, policy, or status |
| `PROG_QUERY` | Query program registration (read-only) |
| `PROG_CHECK_ACCESS` | Check if caller can access program |
| `PROG_RECORD_CALL` | Record program call for statistics |

---

## Testing

**607 tests passing** across 22 comprehensive test suites:

```bash
# All tests (607 passing)
npm run test:full

# Unit tests by module
npx vitest run                        # All unit tests
npx vitest run src/crypto/            # Crypto & addresses
npx vitest run src/auth/              # WSTFAuth (76 tests)
npx vitest run src/service/connector/ # Service connectors (84 tests)
npx vitest run src/events/            # Event logs
npx vitest run src/programs/          # Program registry
```

---

## Test Results Summary

### Complete Test Matrix

| Test File | Tests | Category | What It Tests |
|-----------|-------|----------|---------------|
| `crypto.test.ts` | 38 | Unit | Ed25519, secp256k1, Base58Check, address derivation |
| `tx.test.ts` | 42 | Unit | Transaction v1/v2/v2F structure, preimage, hashing |
| `instructions.test.ts` | 29 | Unit | IR encoding, CBOR, compiler, decoder |
| `wstf.test.ts` | 27 | Unit | Token signing, parsing, validation, claims |
| `wstf.chaos.test.ts` | 49 | Chaos | Malformed tokens, tampering, encoding edge cases |
| `connector.test.ts` | 22 | Unit | Authorization flow, header extraction |
| `connector.chaos.test.ts` | 32 | Chaos | Header chaos, public key resolution, fuzz |
| `moodGame.test.ts` | 30 | Integration | End-to-end auth + trust + balance + external |
| `trust.test.ts` | 40 | Unit | Trust tiers, confirmation tracker, policy engine |
| `hotwindow.test.ts` | 26 | Unit | Ring buffer, pending index, preflight |
| `economics.test.ts` | 30 | Unit | Fee calculation, balance operations |
| `meter.test.ts` | 11 | Unit | Gas metering, limits |
| `validator.test.ts` | 31 | Unit | Paymaster sponsorship, vouchers |
| `logs.test.ts` | 34 | Unit | Event emission, filtering, topics |
| `runner.test.ts` | 31 | Unit | Instruction runner, call tracking |
| `programs.test.ts` (types) | 20 | Unit | Program validation, policies |
| `programs.test.ts` (rpc) | 25 | Unit | Program catalog RPC, queries |
| `simple.test.ts` | 18 | Unit | Simple RPC queries |
| `memory.test.ts` | 11 | Unit | Memory store, snapshots |
| `health.test.ts` | 9 | Unit | Health endpoints, metrics |
| `determinism.test.ts` | 20 | Integration | Same inputs -> same outputs |
| `edge-cases.test.ts` | 32 | Integration | Boundary conditions, error handling |
| **Total** | **607** | | |

### Chaos Test Coverage

| Layer | Tests | What It Covers |
|-------|-------|----------------|
| Token Shape/Encoding | 15 | Empty strings, null, missing dots, invalid base64, non-JSON |
| Claims Validation | 12 | Wrong audience, expiry, clock skew, timestamp ordering |
| Signature Tampering | 10 | Payload modification, bit flips, wrong keys, algorithm confusion |
| Replay Protection | 2 | JTI uniqueness, inclusion in signed payload |
| Unicode/Edge Cases | 6 | Unicode claims, large payloads, special characters |
| Fuzz Testing | 4 | 100+ random mutations, never crashes |
| **Total Chaos** | **49** | WSTFAuth chaos tests |
| Header Extraction | 6 | Empty/null headers, mixed case, unusual characters |
| Authorization Flow | 20 | Missing auth, malformed tokens, expiry, unknown addresses |
| Public Key Resolution | 4 | Throwing resolvers, undefined returns, slow resolvers |
| Connector Fuzz | 2 | 50+ random header combinations |
| **Total Connector Chaos** | **32** | Service connector chaos tests |

### Example Test Queries & Expected Results

| Query | Expected | Result |
|-------|----------|--------|
| Parse empty token `''` | Returns `null` | PASS |
| Parse token without dot `'abc123'` | Returns `null` | PASS |
| Validate expired token (exp < now - 30s) | `{ valid: false, code: 'EXPIRED' }` | PASS |
| Validate wrong audience | `{ valid: false, code: 'WRONG_AUDIENCE' }` | PASS |
| Validate tampered signature | `{ valid: false, code: 'SIGNATURE_INVALID' }` | PASS |
| Authorize with no token | `{ authorized: false, code: 'NO_TOKEN' }` | PASS |
| Mood: all checks pass | `{ mood: 'happy', status: 200 }` | PASS |
| Mood: bad signature | `{ mood: 'sad', status: 401 }` | PASS |
| Mood: insufficient balance | `{ mood: 'angry', status: 402 }` | PASS |
| 100 random mutations | Never crashes, returns null or object | PASS |

---

## Services

| Service | Port | Endpoints |
|---------|------|-----------|
| **Accounts** | 7001 | `POST /accounts`, `GET /addresses/:addr/decode`, `POST /usernames/bind` |
| **Validator** | 7002 | `POST /validate/basic`, `POST /validate/tx2` |
| **Explorer** | 7003 | `GET /account/:addr`, `POST /decode/ir`, `GET /ins/:creator/:moduleId` |
| **Mempool** | 7004 | `POST /mempool/submit`, `GET /mempool/tx/:id`, `GET /mempool/stats` |
| **P2P HTTP** | 9101 | `GET /p2p/peers`, `POST /p2p/connect` |
| **P2P TCP** | 9001 | Binary gossip protocol |

Every service exposes `GET /capabilities` for introspection.

---

## Wire Formats

### Address (35 characters encoded)

```
Payload: [mappingAlg: 1] [sigAlg: 1] [pkHash: 20] = 22 bytes
Encoded: Base58Check(0x00 || payload) -> "gc1..." (35 chars)
```

### WSTFAuth Token

```
<base64url(JSON payload)>.<signature hex>

Example:
eyJzdWIiOiJnYzFhbGljZSIsImF1ZCI6Im15LnByb2dyYW0vdjEiLCJpYXQiOjE3MDA...
.
d2e2f021415f613d8a9b7c...
```

### Transaction v2

```
[version: 1] [sender: 35] [nonce: 8] [fee: 8] [ttl: 8]
[programLen: 4] [program: var]         # Binary IR
[readsLen: 2] [reads: var]             # StateRead[]
[locksLen: 2] [locks: var]             # StateLock[]
[signature: 64]
```

### Block Header (184 bytes)

```
[version: 4] [prevHash: 32] [txRoot: 32] [effectsRoot: 32]
[stateRoot: 32] [timestamp: 8] [height: 8] [target: 32]
[nonce: 8] [txCount: 4] [reserved: 12]
```

---

## Performance

### Design Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Submit TPS | >= 1,000 | Mempool admission rate |
| Validate TPS | >= 500 | Signature + ABI checks |
| Commit TPS | >= 100 | Block inclusion (devnet) |
| Submit -> Accept p95 | < 100ms | Node CPU bound |
| Submit -> Committed p95 | ~2-4s | Constrained by block time |

---

## Milestones

| Phase | Milestone | Status | Description |
|-------|-----------|--------|-------------|
| **1** | M1: Core | Done | Crypto, addresses, tx v1, accounts, validation |
| **1** | M2: Instructions | Done | Binary IR, executor, SYS opcodes, tx v2, INS registry |
| **1** | M3: Network | Done | P2P gossip, mempool, rate limiting, service composition |
| **1** | M4: Blocks | Done | PoW, chain store, fork choice, block builder/validator |
| **1** | M5: Fast-Path | Done | Trust tiers, Hot Window, Pending Index, Preflight, SSE, Journal |
| **1C** | Runner Profiles | Done | Dev/testnet/mainnet presets, unified runner |
| **1C** | Observability | Done | Health/readyz/livez endpoints, metrics registry |
| **1C** | Storage | Done | KVStore abstraction, memory + RocksDB adapters, snapshots |
| **2** | Economics | Done | Tx v2F fees, gas metering, rent collector |
| **2** | RPC Surface | Done | Simple + Enhanced RPC services, query indexes |
| **2** | Paymaster | Done | Intrinsic sponsorship, vouchers, validation |
| **2** | M6: Events | Done | Structured event logs, indexed topics, filtering |
| **2** | M7: WSTFAuth | Done | Token auth, service connectors, chaos tests |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Milestone1.md](Milestone1.md) | Core foundation specification |
| [Milestone2.md](Milestone2.md) | Instruction layer specification |
| [Milestone3.md](Milestone3.md) | P2P and mempool architecture |
| [M4-SUMMARY.md](M4-SUMMARY.md) | Block production implementation |
| [FASTPATH-SUMMARY.md](FASTPATH-SUMMARY.md) | Fast-path architecture (M5) |
| [M2-HARDENING.md](M2-HARDENING.md) | Test baseline and determinism guarantees |

---

## Error Codes

Stable error codes for deterministic behavior:

| Code | Name | Description |
|------|------|-------------|
| E1001 | INVALID_SIGNATURE | Signature verification failed |
| E1002 | INVALID_ADDRESS | Malformed address format |
| E2001 | INSUFFICIENT_BALANCE | Not enough funds |
| E2002 | NONCE_MISMATCH | Tx nonce != account nonce |
| E3001 | DECODE_ERROR | ABI/CBOR decoding failed |
| E3002 | INVALID_MODULE | Unknown module ID |
| E3003 | INVALID_SELECTOR | Unknown selector for module |
| E4001 | GAS_EXHAUSTED | Execution ran out of gas |
| E5001 | VERSION_MISMATCH | Optimistic concurrency conflict |

See [src/common/errors.ts](src/common/errors.ts) for full catalog (30+ codes).

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm run test:full`)
4. Ensure determinism tests pass
5. Commit your changes
6. Push and open a Pull Request

### Guidelines

- All code must pass `npm run lint`
- All 607 tests must pass
- Golden vectors must not change without approval
- New features require corresponding tests
- Deterministic code only—no external I/O in executor
- Security-critical paths require comprehensive chaos tests
- WSTFAuth changes require chaos test coverage

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built with TypeScript by [Wasserstoff India](https://wasserstoff.in)**

[GitHub](https://github.com/wasserstoff-india/wstf) | [Issues](https://github.com/wasserstoff-india/wstf/issues)
