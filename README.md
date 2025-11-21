# WSTF Chain

[![CI](https://github.com/wasserstoff-india/wstf/actions/workflows/ci.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/ci.yml)
[![Benchmark](https://github.com/wasserstoff-india/wstf/actions/workflows/benchmark.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/benchmark.yml)
[![Check](https://github.com/wasserstoff-india/wstf/actions/workflows/check.yml/badge.svg)](https://github.com/wasserstoff-india/wstf/actions/workflows/check.yml)

A high-performance, modular blockchain implementation with deterministic execution, binary instruction format, and identity-native addressing.

## Features

- **Multi-Algorithm Cryptography**: Ed25519 and secp256k1 signature support
- **Identity-Native Addresses**: 22-byte payload with Base58Check encoding (`gc` prefix)
- **Binary Instruction Format**: Compact ULEB128 + canonical CBOR encoding
- **Deterministic Execution**: Pure functions, no I/O, reproducible state transitions
- **7 SYS Opcodes**: REG, INIT, UPDATE, SIGN, VERIFY, RENT, XVAL
- **P2P Gossip Network**: CBOR-encoded messages with rate limiting
- **Mempool Policies**: Size limits, per-sender caps, duplicate suppression
- **PoW Consensus**: Double SHA256, difficulty adjustment, fork choice

## Quick Start

```bash
# Clone the repository
git clone https://github.com/wasserstoff-india/wstf.git
cd wstf

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm run test:all
```

## Milestones

| Milestone | Description | Status |
|-----------|-------------|--------|
| M1 | Core Foundation (crypto, addresses, tx v1, accounts) | Complete |
| M2 | Instruction Layer (binary IR, executor, SYS module, tx v2) | Complete |
| M3 | Networking & Mempool (P2P gossip, rate limiting, policies) | Complete |
| M4 | Block Production (PoW, chain store, fork choice, builder) | Complete |

## Architecture

```
src/
├── crypto/          # Ed25519, secp256k1, address derivation
├── transactions/    # Tx v1 (basic) and v2 (instructions)
├── instructions/    # Binary IR, ABI encoding
├── executor/        # Deterministic execution engine
│   └── modules/     # SYS module (7 opcodes)
├── accounts/        # Account state management
├── services/        # Unified service layer
├── p2p/             # Gossip protocol, peer management
├── mempool/         # Transaction pool with policies
├── block/           # Block types, PoW, Merkle roots
├── chain/           # Chain store, fork choice, block builder
├── config/          # Feature flags, configuration
├── bench/           # TPS/latency benchmarking
├── common/          # Shared types, errors, constants
└── test/            # Smoke tests (M1-M4)

test/
├── unit/            # Unit tests (ABI, vectors)
├── differential/    # Determinism tests
└── vectors/         # Golden test vectors
```

## Services

### Start All Services

```bash
# M1/M2 Services (Accounts, Validator, Explorer)
npm start

# Or with custom ports
node dist/runner/run.js --services=accounts,validator --accounts-port=7001 --validator-port=7002

# M3+ Services (with P2P and Mempool)
npm run start:m3 -- --services=accounts,validator,explorer,p2p,mempool
```

### Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Accounts | 7001 | Account creation, metadata, username binding |
| Validator | 7002 | Transaction validation (v1 and v2) |
| Explorer | 7003 | Account lookup, tx decoding, INS queries |
| Mempool | 7004 | Transaction pool management |
| P2P TCP | 9001 | Gossip protocol |
| P2P HTTP | 9101 | Peer management API |

### API Endpoints

**Accounts Service (7001)**
- `POST /accounts` - Create new account
- `GET /addresses/:addr/decode` - Decode address
- `POST /usernames/bind` - Bind username to address
- `GET /accounts/:addr/meta` - Get account metadata

**Validator Service (7002)**
- `POST /validate/basic` - Validate transaction (v1)
- `POST /validate/tx2` - Validate transaction (v2)

**Explorer Service (7003)**
- `GET /account/:addr` - Get account info
- `POST /decode/tx/basic` - Decode transaction
- `POST /decode/ir` - Decode instruction program
- `GET /ins/:creator/:moduleId` - Lookup INS entry

**Mempool Service (7004)**
- `POST /mempool/submit` - Submit transaction
- `GET /mempool/tx/:id` - Get transaction by ID
- `GET /mempool/stats` - Get mempool statistics

**P2P Service (9101)**
- `GET /p2p/peers` - List connected peers
- `POST /p2p/connect` - Connect to a peer

## Testing

```bash
# Run all smoke tests
npm run test:all

# Run unit tests
npm run test:unit

# Run specific milestone tests
npm run test:m1
npm run test:m2
npm run test:m3
npm run test:m4

# Run determinism tests
npm run test:determinism

# Run golden vector tests
npm run test:vectors
```

## Benchmarks

```bash
# Basic v1 transactions (signature check only)
npm run bench:basic-v1

# Small v2 transactions (1-3 SYS instructions)
npm run bench:v2-small

# Heavy v2 transactions (10-50 instructions)
npm run bench:v2-heavy

# Production mix (70% v1, 20% v2-small, 10% v2-heavy)
npm run bench:mix
```

### Target SLOs

| Scenario | Target TPS | p99 Latency |
|----------|-----------|-------------|
| basic-v1 | >= 5,000 | < 20ms |
| v2-small | >= 3,000 | < 30ms |
| mix-70-20-10 | >= 2,000 | < 50ms |

## Wire Format

### Address (35 bytes encoded)

```
[mappingAlg: 1] [sigAlg: 1] [pkHash: 20] = 22 bytes payload
Base58Check(0x00 || payload) -> "gc..." (35 chars)
```

### Transaction v1 (variable)

```
[version: 1] [sender: 35] [nonce: 8] [fee: 8] [ttl: 8]
[payloadLen: 4] [payload: var] [signature: 64]
```

### Instruction (variable)

```
[moduleId: ULEB128] [selector: ULEB128] [argsLen: ULEB128] [args: CBOR]
```

### Block Header (184 bytes)

```
[version: 4] [prevHash: 32] [merkleRoot: 32] [timestamp: 8]
[height: 8] [difficulty: 32] [nonce: 8] [txCount: 4] [reserved: 56]
```

## Error Codes

All errors use stable codes for deterministic behavior:

| Code | Name | Description |
|------|------|-------------|
| E1001 | INVALID_SIGNATURE | Signature verification failed |
| E1002 | INVALID_ADDRESS | Malformed address |
| E2001 | INSUFFICIENT_BALANCE | Not enough funds |
| E2002 | NONCE_MISMATCH | Transaction nonce != account nonce |
| E3001 | DECODE_ERROR | ABI decoding failed |
| E3002 | INVALID_MODULE | Unknown module ID |
| E4001 | GAS_EXHAUSTED | Execution ran out of gas |

See [src/common/errors.ts](src/common/errors.ts) for full catalog.

## Documentation

- [Milestone1.md](Milestone1.md) - Core foundation specification
- [Milestone2.md](Milestone2.md) - Instruction layer specification
- [Milestone3.md](Milestone3.md) - P2P and mempool architecture
- [M4-SUMMARY.md](M4-SUMMARY.md) - Block production implementation
- [M2-HARDENING.md](M2-HARDENING.md) - Test baseline and determinism guarantees
- [PHASE1-ROADMAP.md](PHASE1-ROADMAP.md) - Phase 1 completion roadmap
- [PROJECT-STATUS.md](PROJECT-STATUS.md) - Current project status

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm run test:all`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Development Guidelines

- All code must pass `npm run lint`
- All tests must pass (`npm run test:all`)
- Determinism tests must pass (`npm run test:determinism`)
- Golden vectors must not change without explicit approval
- New features require corresponding tests

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/wasserstoff-india/wstf)
- [Issue Tracker](https://github.com/wasserstoff-india/wstf/issues)

---

Built with TypeScript by [Wasserstoff India](https://wasserstoff.in)
