# WSTF Chain

[![CI](https://github.com/wasserstoff-india/wstf/actions/workflows/ci.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/ci.yml)
[![Benchmark](https://github.com/wasserstoff-india/wstf/actions/workflows/benchmark.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/benchmark.yml)
[![Check](https://github.com/wasserstoff-india/wstf/actions/workflows/check.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/check.yml)

> **A deterministic, modular wallet-chain—sign anywhere, verify anywhere, orchestrate multi-chain actions, and keep an auditable state ledger.**

## The Problem

Multi-chain applications need a coordination layer that can:
- Verify signatures from any chain without trusting external RPCs
- Execute deterministic logic that produces identical results on every node
- Maintain auditable state with optimistic concurrency
- Compose services independently (run what you need, nothing more)

## The Solution

WSTFChain is a **programmable instruction plane** for the multi-chain world:

- **Language-agnostic**: Binary IR (ULEB128 + canonical CBOR) works with any client
- **Deterministic**: Pure execution—same inputs always produce same outputs
- **Composable**: Every service runs standalone with `/capabilities` introspection
- **Auditable**: Git-like state versioning with Merkle proofs

---

## What It Can Do Today

| Capability | Description |
|------------|-------------|
| **Create identities** | Generate Ed25519/secp256k1 keys, derive addresses, bind usernames |
| **Authorize actions** | Sign tx v1 (transfers) or tx v2 (instruction programs) with preimage verification |
| **Manage state** | REG/INIT/UPDATE with optimistic concurrency and deterministic merges |
| **Record signatures** | SIGN opcode anchors signatures (auditable, hashed into state) |
| **Verify signatures** | VERIFY opcode validates signatures inside programs (consensus-critical) |
| **Accept attestations** | XVAL opcode for cross-chain receipts with proof bundles (stub) |
| **Gossip transactions** | P2P dedup + rate limiting; mempool policies by size/sender |
| **Produce blocks** | Builder mines at configurable target; validator re-executes and checks roots |
| **Fork choice** | Cumulative-work tip selection with reorg handling |
| **Compose nodes** | Run any combination: accounts, validator, mempool, p2p, builder, explorer |

---

## Quick Start

```bash
# Clone
git clone https://github.com/wasserstoff-india/wstf.git
cd wstf

# Install & build
npm install && npm run build

# Run all tests (32 green)
npm run test:all

# Start services
npm start                    # accounts + validator + explorer
npm run start:m3             # + p2p + mempool
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Applications                            │
├─────────────────────────────────────────────────────────────────┤
│  Compiler API    │   Identity RPC   │   Explorer / Indexer      │
├──────────────────┴──────────────────┴───────────────────────────┤
│                      Service Layer                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Accounts │ │ Validator│ │ Mempool  │ │ Builder  │           │
│  │  :7001   │ │  :7002   │ │  :7004   │ │  :7005   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                      Core Engine                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Executor (deterministic)  │  Instruction ABI (CBOR)     │  │
│  ├────────────────────────────┼─────────────────────────────┤  │
│  │  SYS Module (7 opcodes)    │  INS Registry               │  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      Consensus Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Block Types  │  │  PoW Mining  │  │ Fork Choice  │          │
│  │ (184B header)│  │ (2xSHA256)   │  │ (cum. work)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                      Network Layer                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  P2P Gossip (CBOR)  │  Rate Limiting  │  Peer Management │  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      Storage Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Chain Store  │  │ State Store  │  │ Account Store│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── crypto/          # Ed25519, secp256k1, address derivation
├── tx/              # Tx v1 (basic) and v2 (instructions)
├── instructions/    # Binary IR, ABI, compiler, decoder
├── executor/        # Deterministic execution engine
│   └── modules/     # SYS module (7 opcodes)
├── accounts/        # Account state management
├── validator/       # Transaction validation
├── p2p/             # Gossip protocol, peer management
├── mempool/         # Transaction pool with policies
├── block/           # Block types, PoW, Merkle roots
├── chain/           # Chain store, fork choice, block builder
├── registry/        # INS module registry
├── explorer/        # Query service
├── config/          # Feature flags, configuration
├── bench/           # TPS/latency benchmarking (scaffolded)
├── runner/          # Service orchestration
├── common/          # Shared types, errors, constants
└── test/            # Smoke tests (M1-M4)

test/
├── unit/            # Unit tests (ABI, vectors)
├── differential/    # 2-node determinism tests
└── vectors/         # Golden test vectors
```

---

## System Opcodes

The **SYS module** provides 7 built-in opcodes:

| Opcode | Selector | Description |
|--------|----------|-------------|
| `REG` | 0x01 | Register a new state object (type, owner, writer) |
| `INIT` | 0x02 | Initialize state data (version check, full replacement) |
| `UPDATE` | 0x03 | Patch state data (optimistic concurrency, merge operations) |
| `SIGN` | 0x04 | Anchor a signature into state (auditable record) |
| `VERIFY` | 0x05 | Verify a signature inside execution (consensus-critical) |
| `RENT` | 0x06 | Pay rent for state storage (stub—always succeeds) |
| `XVAL` | 0x07 | Accept external attestation/proof bundle (stub) |

### Example: Compile and Execute

```typescript
import { compileProgram } from './src/instructions/compiler';
import { executeProgram } from './src/executor/engine';

// JSON DSL
const program = [
  { creator: 'sys', moduleId: 'SYS', method: 'REG',
    args: { stateId: '0x...', type: 'account', owner: 'gc1...' } },
  { creator: 'sys', moduleId: 'SYS', method: 'INIT',
    args: { stateId: '0x...', expectedVersion: '0x00...', data: { balance: 1000 } } }
];

// Compile to binary IR
const ir = compileProgram(program); // → Buffer

// Execute deterministically
const result = await executeProgram({
  txFrom: 'gc1...',
  program: ir,
  reads: [],
  locks: [],
  getState: async (id) => stateStore.get(id)
});
// result: { success: true, writes: [...], logs: [...] }
```

---

## Performance

### Design Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Submit TPS | >= 1,000 | Mempool admission rate |
| Validate TPS | >= 500 | Signature + ABI checks |
| Commit TPS | >= 100 | Block inclusion (devnet) |
| Submit → Accept p95 | < 100ms | Node CPU bound |
| Submit → Committed p95 | ~2-4s | Constrained by block time |

### Commit TPS Formula

```
Commit TPS = maxTxPerBlock / blockTimeSec

Example: 200 tx/block ÷ 2s = 100 TPS
Example: 400 tx/block ÷ 2s = 200 TPS
```

### Recommended Devnet Settings

```bash
--block.timeTargetSec=2
--limits.maxTxPerBlock=300
--validator.workers=<CPU-1>
--validator.cache.programs=true
--mempool.queue.perSender=true
--p2p.blocksync=true
```

---

## Wire Formats

### Address (35 characters encoded)

```
Payload: [mappingAlg: 1] [sigAlg: 1] [pkHash: 20] = 22 bytes
Encoded: Base58Check(0x00 || payload) → "gc1..." (35 chars)
```

### Transaction v1

```
[version: 1] [sender: 35] [nonce: 8] [fee: 8] [ttl: 8]
[payloadLen: 4] [payload: var] [signature: 64]
```

### Transaction v2

```
[version: 1] [sender: 35] [nonce: 8] [fee: 8] [ttl: 8]
[programLen: 4] [program: var]         # Binary IR
[readsLen: 2] [reads: var]             # StateRead[]
[locksLen: 2] [locks: var]             # StateLock[]
[signature: 64]
```

### Instruction (Binary IR)

```
[creatorPkHash: 20] [moduleId: 16] [selector: ULEB128]
[argsLen: ULEB128] [args: canonical CBOR]
```

### Block Header (184 bytes)

```
[version: 4] [prevHash: 32] [txRoot: 32] [effectsRoot: 32]
[stateRoot: 32] [timestamp: 8] [height: 8] [target: 32]
[nonce: 8] [txCount: 4] [reserved: 12]
```

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

## Testing

```bash
# All tests (32 passing)
npm run test:all

# By milestone
npm run test:m1    # Crypto, addresses, tx v1
npm run test:m2    # Instructions, executor, INS
npm run test:m3    # P2P, mempool, rate limiting
npm run test:m4    # Blocks, PoW, fork choice

# Quality gates
npm run test:unit           # 10 unit tests (ABI, vectors)
npm run test:determinism    # 2-node differential tests
npm run test:vectors        # Golden vector validation
```

---

## Milestones

| Phase | Milestone | Status | Description |
|-------|-----------|--------|-------------|
| **1** | M1: Core | Done | Crypto, addresses, tx v1, accounts, validation |
| **1** | M2: Instructions | Done | Binary IR, executor, SYS opcodes, tx v2, INS registry |
| **1** | M3: Network | Done | P2P gossip, mempool, rate limiting, service composition |
| **1** | M4: Blocks | Done | PoW, chain store, fork choice, block builder/validator |
| **1** | M5: Fast-Path | Done | Trust tiers, Hot Window, Pending Index, Preflight, SSE, Journal |
| **1** | Bench | Scaffolded | Loadgen, metrics, reporter, scenarios |
| **2** | Block Sync | Planned | Headers-first sync, orphan queue |
| **2** | Indexer | Planned | RocksDB prefixes for fast queries |
| **2** | Economics | Planned | Gas metering, fees, rent collector |

---

## Roadmap: Phase-1 Completion

### Priority 1A (Done)
- [x] Trust-based confirmation tiers (5 levels)
- [x] Hot Window (1M tx ring buffer)
- [x] Pending Index (conflict detection)
- [x] Preflight API (pre-sign conflict check)
- [x] SSE Events (real-time tier notifications)
- [x] Journal Collector (cross-chain finality)

### Priority 1B (Next)
- [ ] Wire `/metrics` to all services
- [ ] Wire SSE/Preflight to HTTP endpoints
- [ ] P2P block sync (headers-first, orphan queue)
- [ ] Mempool reconciliation (remove-on-commit, reorg re-insert)

### Priority 1C (Planned)
- [ ] Indexer with RocksDB (address/state/receipt search)
- [ ] Validator worker threads for parallel sig checks
- [ ] Program cache (memoize decoded IR by txId)
- [ ] Per-sender fair queuing

### Priority 1D (Polish)
- [ ] Runner profiles (devnet, follower, validator-only)
- [ ] `/healthz`, `/readyz` endpoints
- [ ] Structured logging with correlation IDs
- [ ] Identity RPC (address & signature queries)
- [ ] Compiler API service
- [ ] Warm Mirror with RocksDB (zone stickiness)
- [ ] Ethereum/Celestia journal adapters

### Phase-1 Ship Criteria
- Deterministic headers-first sync
- Reorg-safe mempool
- Fast address/state/receipt searches
- Bench SLOs met (or documented gaps)
- Metrics + health endpoints everywhere
- Any service can run standalone

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

## Documentation

| Document | Description |
|----------|-------------|
| [Milestone1.md](Milestone1.md) | Core foundation specification |
| [Milestone2.md](Milestone2.md) | Instruction layer specification |
| [Milestone3.md](Milestone3.md) | P2P and mempool architecture |
| [M4-SUMMARY.md](M4-SUMMARY.md) | Block production implementation |
| [FASTPATH-SUMMARY.md](FASTPATH-SUMMARY.md) | Fast-path architecture (M5) |
| [M2-HARDENING.md](M2-HARDENING.md) | Test baseline and determinism guarantees |
| [PHASE1-ROADMAP.md](PHASE1-ROADMAP.md) | Phase-1 completion plan |
| [PROJECT-STATUS.md](PROJECT-STATUS.md) | Current project status |

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm run test:all`)
4. Ensure determinism tests pass (`npm run test:determinism`)
5. Commit your changes
6. Push and open a Pull Request

### Guidelines

- All code must pass `npm run lint`
- All 32 tests must pass
- Golden vectors must not change without approval
- New features require corresponding tests
- Deterministic code only—no external I/O in executor

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built with TypeScript by [Wasserstoff India](https://wasserstoff.in)**

[GitHub](https://github.com/wasserstoff-india/wstf) | [Issues](https://github.com/wasserstoff-india/wstf/issues)
