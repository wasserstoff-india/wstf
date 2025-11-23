/**
 * WSTF Chain CLI
 *
 * Main command-line interface for running the WSTF Chain node.
 * Provides commands for starting services, checking status, and configuration.
 *
 * Note: Shebang is added by esbuild during build process.
 */

import { VERSION } from './version';
import { PROFILES, ProfileName, getProfile, listProfiles, mergeConfig, loadProfileFromArgs } from './profiles';

// ============================================================
// CLI Configuration
// ============================================================

const CLI_NAME = 'wstf';
const CLI_DESCRIPTION = 'WSTF Chain - Deterministic instruction-based blockchain';

// ============================================================
// Environment Variable Support
// ============================================================

function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue?: number): number | undefined {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultValue : num;
}

function getEnvBool(key: string, defaultValue?: boolean): boolean | undefined {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
}

// ============================================================
// Help Text
// ============================================================

function printHelp(): void {
  console.log(`
${CLI_NAME} - ${CLI_DESCRIPTION}

USAGE:
  ${CLI_NAME} <command> [options]

COMMANDS:
  start         Start the WSTF chain node
  version       Show version information
  profiles      List available profiles
  help          Show this help message

START OPTIONS:
  --profile=<name>       Profile to use (default: dev)
                         Available: dev, testnet, mainnet, minimal, full

  --services=<list>      Comma-separated services to enable
                         Available: accounts,validator,explorer,p2p,mempool

  --<service>.port=<n>   Override port for a specific service
                         Example: --validator.port=8002

  --data-dir=<path>      Data directory for chain state (default: ./data)
  --log-level=<level>    Log level: debug, info, warn, error (default: info)

ENVIRONMENT VARIABLES:
  WSTF_PROFILE           Default profile (overridden by --profile)
  WSTF_DATA_DIR          Data directory
  WSTF_LOG_LEVEL         Log level
  WSTF_ACCOUNTS_PORT     Accounts service port
  WSTF_VALIDATOR_PORT    Validator service port
  WSTF_EXPLORER_PORT     Explorer service port
  WSTF_P2P_PORT          P2P service port
  WSTF_MEMPOOL_PORT      Mempool service port

PROFILES:
  dev       Development mode - all services, relaxed limits
  testnet   Testnet mode - production-like with moderate limits
  mainnet   Mainnet mode - strict limits, production settings
  minimal   Minimal mode - only accounts and validator
  full      Full mode - all services with cross-chain features

EXAMPLES:
  # Start with default dev profile
  ${CLI_NAME} start

  # Start with testnet profile
  ${CLI_NAME} start --profile=testnet

  # Start minimal with custom ports
  ${CLI_NAME} start --profile=minimal --accounts.port=8001 --validator.port=8002

  # Start specific services only
  ${CLI_NAME} start --services=accounts,validator

  # Using environment variables
  WSTF_PROFILE=mainnet ${CLI_NAME} start

For more information, visit: https://github.com/wasserstoff-india/wstf
`);
}

function printVersion(): void {
  console.log(`
WSTF Chain v${VERSION}

Node.js:    ${process.version}
Platform:   ${process.platform}
Arch:       ${process.arch}

Build Info:
  Package:  @wasserstoff/wstf-sdk
  License:  MIT
  Homepage: https://github.com/wasserstoff-india/wstf
`);
}

function printProfiles(): void {
  console.log('\nAvailable Profiles:\n');

  for (const profile of listProfiles()) {
    const services = Object.entries(profile.config.services)
      .filter(([_, cfg]) => (cfg as any).enabled)
      .map(([name]) => name);

    console.log(`  ${profile.name.padEnd(10)} - ${profile.description}`);
    console.log(`              Services: ${services.join(', ')}`);
    console.log('');
  }
}

function printStartBanner(profileName: string, services: string[]): void {
  console.log(`
================================================================================
  WSTF Chain Node v${VERSION}
================================================================================
  Profile:    ${profileName}
  Services:   ${services.join(', ')}
  Started:    ${new Date().toISOString()}
================================================================================
`);
}

// ============================================================
// Command Handlers
// ============================================================

interface StartOptions {
  profile: string;
  services?: string[];
  dataDir: string;
  logLevel: string;
  portOverrides: Record<string, number>;
}

function parseStartOptions(args: string[]): StartOptions {
  const options: StartOptions = {
    profile: getEnv('WSTF_PROFILE', 'dev')!,
    dataDir: getEnv('WSTF_DATA_DIR', './data')!,
    logLevel: getEnv('WSTF_LOG_LEVEL', 'info')!,
    portOverrides: {},
  };

  // Parse environment variable port overrides
  const envPorts: Record<string, string> = {
    accounts: 'WSTF_ACCOUNTS_PORT',
    validator: 'WSTF_VALIDATOR_PORT',
    explorer: 'WSTF_EXPLORER_PORT',
    p2p: 'WSTF_P2P_PORT',
    mempool: 'WSTF_MEMPOOL_PORT',
  };

  for (const [service, envKey] of Object.entries(envPorts)) {
    const port = getEnvNumber(envKey);
    if (port !== undefined) {
      options.portOverrides[service] = port;
    }
  }

  // Parse CLI arguments (override env vars)
  for (const arg of args) {
    if (arg.startsWith('--profile=')) {
      options.profile = arg.split('=')[1];
    } else if (arg.startsWith('--services=')) {
      options.services = arg.split('=')[1].split(',').map(s => s.trim());
    } else if (arg.startsWith('--data-dir=')) {
      options.dataDir = arg.split('=')[1];
    } else if (arg.startsWith('--log-level=')) {
      options.logLevel = arg.split('=')[1];
    } else {
      // Check for port overrides
      const portMatch = arg.match(/^--(\w+)\.port=(\d+)$/);
      if (portMatch) {
        options.portOverrides[portMatch[1]] = parseInt(portMatch[2], 10);
      }
    }
  }

  return options;
}

async function runStart(args: string[]): Promise<void> {
  const options = parseStartOptions(args);

  // Validate profile
  const profile = getProfile(options.profile);
  if (!profile) {
    console.error(`Error: Unknown profile '${options.profile}'`);
    console.error(`Available profiles: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(1);
  }

  // Build configuration
  const overrides: any = { services: {} };

  // Apply service selection
  if (options.services) {
    for (const key of ['accounts', 'validator', 'explorer', 'p2p', 'mempool']) {
      overrides.services[key] = { enabled: options.services.includes(key) };
    }
  }

  // Apply port overrides
  for (const [service, port] of Object.entries(options.portOverrides)) {
    if (!overrides.services[service]) {
      overrides.services[service] = {};
    }
    overrides.services[service].port = port;
  }

  const config = mergeConfig(profile.config, overrides);

  // Determine enabled services
  const enabledServices = Object.entries(config.services)
    .filter(([_, cfg]) => (cfg as any).enabled)
    .map(([name]) => name);

  // Print startup banner
  printStartBanner(profile.name, enabledServices);

  // Import and start the unified runner
  try {
    const { startRunner } = await import('./unified');
    await startRunner(process.argv.slice(2));
  } catch (error: any) {
    console.error(`\nError starting node: ${error.message}`);
    if (options.logLevel === 'debug') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// ============================================================
// Main Entry Point
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle no arguments or help
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  // Handle version
  if (command === 'version' || command === '--version' || command === '-v') {
    printVersion();
    process.exit(0);
  }

  // Handle profiles
  if (command === 'profiles') {
    printProfiles();
    process.exit(0);
  }

  // Handle start
  if (command === 'start') {
    await runStart(args.slice(1));
    return;
  }

  // Handle legacy invocation (no command, just --profile=...)
  if (command.startsWith('--')) {
    // Treat as start command with options
    await runStart(args);
    return;
  }

  // Unknown command
  console.error(`Unknown command: ${command}`);
  console.error('Run "wstf help" for usage information.');
  process.exit(1);
}

// Run CLI
main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
