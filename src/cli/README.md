# @wasserstoff/wstf-cli

Command-line interface for WSTF Chain - run nodes, manage services, and interact with the blockchain.

[![npm version](https://img.shields.io/npm/v/@wasserstoff/wstf-cli.svg)](https://www.npmjs.com/package/@wasserstoff/wstf-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
# Global installation (recommended)
npm install -g @wasserstoff/wstf-cli

# Or use npx
npx @wasserstoff/wstf-cli --help
```

## Quick Start

```bash
# Show help
wstf help

# Show version
wstf version

# List available profiles
wstf profiles

# Start node with default (dev) profile
wstf start

# Start with specific profile
wstf start --profile=testnet
```

## Commands

### `wstf start`

Start the WSTF Chain node with specified configuration.

```bash
wstf start [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--profile=<name>` | Configuration profile | `dev` |
| `--services=<list>` | Comma-separated services to enable | All from profile |
| `--<service>.port=<n>` | Override port for specific service | Profile default |
| `--data-dir=<path>` | Data directory for chain state | `./data` |
| `--log-level=<level>` | Log level (debug, info, warn, error) | `info` |

**Examples:**

```bash
# Start with testnet profile
wstf start --profile=testnet

# Start minimal with custom ports
wstf start --profile=minimal --accounts.port=8001 --validator.port=8002

# Start only specific services
wstf start --services=accounts,validator,explorer

# Start with debug logging
wstf start --log-level=debug
```

### `wstf version`

Display version and build information.

```bash
wstf version
```

Output:
```
WSTF Chain v0.1.0

Node.js:    v20.10.0
Platform:   linux
Arch:       x64

Build Info:
  Package:  @wasserstoff/wstf-sdk
  License:  MIT
  Homepage: https://github.com/wasserstoff-india/wstf
```

### `wstf profiles`

List all available configuration profiles.

```bash
wstf profiles
```

### `wstf help`

Show help message with all available commands and options.

```bash
wstf help
```

## Profiles

| Profile | Description | Services |
|---------|-------------|----------|
| `dev` | Development mode with relaxed limits | All services |
| `testnet` | Production-like with moderate limits | All services |
| `mainnet` | Strict limits, production settings | All services |
| `minimal` | Only essential services | accounts, validator |
| `full` | All features including cross-chain | All + XVAL |

## Services

| Service | Default Port | Description |
|---------|--------------|-------------|
| `accounts` | 7001 | Account management and creation |
| `validator` | 7002 | Transaction validation |
| `explorer` | 7003 | Block/transaction exploration |
| `p2p` | 9001 | Peer-to-peer networking |
| `mempool` | 7004 | Transaction pool management |

## Environment Variables

All CLI options can also be set via environment variables:

| Variable | Description |
|----------|-------------|
| `WSTF_PROFILE` | Default profile |
| `WSTF_DATA_DIR` | Data directory |
| `WSTF_LOG_LEVEL` | Log level |
| `WSTF_ACCOUNTS_PORT` | Accounts service port |
| `WSTF_VALIDATOR_PORT` | Validator service port |
| `WSTF_EXPLORER_PORT` | Explorer service port |
| `WSTF_P2P_PORT` | P2P service port |
| `WSTF_MEMPOOL_PORT` | Mempool service port |

**Example:**

```bash
export WSTF_PROFILE=testnet
export WSTF_LOG_LEVEL=debug
wstf start
```

## Docker Usage

```bash
# Run with Docker
docker run -p 7001-7004:7001-7004 -p 9001:9001 \
  wasserstoff/wstf-node:latest \
  wstf start --profile=testnet

# With environment variables
docker run -e WSTF_PROFILE=mainnet \
  -p 7001-7004:7001-7004 -p 9001:9001 \
  wasserstoff/wstf-node:latest
```

## Configuration Files

The CLI also supports configuration files (coming soon):

```bash
# Use custom config file
wstf start --config=./my-config.json
```

## Related Packages

- [@wasserstoff/wstf-sdk](https://www.npmjs.com/package/@wasserstoff/wstf-sdk) - TypeScript SDK for WSTF Chain

## License

MIT - see [LICENSE](./LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/wasserstoff-india/wstf)
- [Documentation](https://github.com/wasserstoff-india/wstf#readme)
- [Issue Tracker](https://github.com/wasserstoff-india/wstf/issues)
