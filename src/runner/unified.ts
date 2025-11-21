/**
 * Unified Runner - Single entry point for all WSTFChain services
 *
 * Usage:
 *   ts-node src/runner/unified.ts --profile=dev
 *   ts-node src/runner/unified.ts --profile=testnet --services=accounts,validator
 *   ts-node src/runner/unified.ts --profile=mainnet --validator.port=8002
 */
import { startAccountsService } from '../accounts/service';
import { startValidatorService } from '../validator/service';
import { startExplorerService } from '../explorer/service';
import { InMemoryINS } from '../registry/insStore';
import { P2PService, startP2PAPI } from '../p2p/service';
import { MempoolService, startMempoolService } from '../mempool/service';
import { EnhancedRPC, createEnhancedRPC } from '../rpc/enhanced';
import { PaymasterValidator, createPaymasterValidator } from '../paymaster/validator';
import {
  loadProfileFromArgs,
  mergeConfig,
  printProfileInfo,
  Profile
} from './profiles';
import { printCompositionMatrix } from '../config/loader';
import { WSTFConfig } from '../config/types';

/**
 * Runner context - holds all started services
 */
export interface RunnerContext {
  config: WSTFConfig;
  profile: Profile;
  services: {
    accounts?: { accounts: any; users: any };
    validator?: { app: any; stateStore: any; context: any };
    explorer?: { app: any; ins: InMemoryINS };
    p2p?: P2PService;
    mempool?: MempoolService;
    rpc?: EnhancedRPC;
    paymaster?: PaymasterValidator;
  };
  shutdown: () => Promise<void>;
}

/**
 * Start all services based on configuration
 */
export async function startRunner(args: string[]): Promise<RunnerContext> {
  const { profile, overrides } = loadProfileFromArgs(args);
  const config = mergeConfig(profile.config, overrides);

  console.log('='.repeat(60));
  console.log('WSTFChain Unified Runner');
  console.log('='.repeat(60));
  printProfileInfo(profile);
  printCompositionMatrix(config);

  const context: RunnerContext = {
    config,
    profile,
    services: {},
    shutdown: async () => {
      console.log('\nShutting down services...');
      if (context.services.p2p) {
        await context.services.p2p.stop();
      }
      console.log('All services stopped');
    }
  };

  // Start Accounts service
  if (config.services.accounts.enabled) {
    const result = await startAccountsService(config.services.accounts.port!);
    context.services.accounts = result;
    console.log(`[accounts] Started on port ${config.services.accounts.port}`);
  }

  // Start Validator service
  if (config.services.validator.enabled && context.services.accounts) {
    const result = await startValidatorService(
      config.services.validator.port!,
      context.services.accounts.accounts
    );

    const validatorContext = {
      getAccountState: async (addr: string) => {
        const a = await context.services.accounts!.accounts.get(addr);
        if (!a) return undefined;
        return {
          nonce: a.nonce,
          publicKey: a.publicKeyBase64,
          sigAlgId: a.sigAlgId
        };
      },
      getState: async (stateId: string) => {
        return result.stateStore.get(stateId);
      }
    };

    context.services.validator = {
      app: result.app,
      stateStore: result.stateStore,
      context: validatorContext
    };
    console.log(`[validator] Started on port ${config.services.validator.port}`);
  }

  // Start Explorer service
  if (config.services.explorer.enabled && context.services.accounts) {
    const ins = new InMemoryINS();
    const result = await startExplorerService(
      config.services.explorer.port!,
      context.services.accounts.accounts,
      context.services.accounts.users,
      ins
    );
    context.services.explorer = { app: result, ins };
    console.log(`[explorer] Started on port ${config.services.explorer.port}`);
  }

  // Start P2P service
  if (config.services.p2p.enabled) {
    const p2pService = new P2PService(config.services.p2p);
    await p2pService.start();
    await startP2PAPI(config.services.p2p.port + 100, p2pService);
    context.services.p2p = p2pService;
    console.log(`[p2p] Started on port ${config.services.p2p.port}`);
  }

  // Start Mempool service
  if (config.services.mempool.enabled) {
    const validator = context.services.validator ? {
      validateBasicTx: context.services.validator.context ? (tx: any, ctx: any) => {
        return import('../validator/basicValidator').then(mod =>
          mod.validateBasicTx(tx, context.services.validator!.context)
        );
      } : undefined,
      validateTxV2: context.services.validator.context ? (tx: any, ctx: any) => {
        return import('../validator/txV2Validator').then(mod =>
          mod.validateTxV2(tx, context.services.validator!.context)
        );
      } : undefined
    } : undefined;

    const mempoolService = new MempoolService(config.services.mempool, {
      validator,
      p2p: context.services.p2p,
      validatorContext: context.services.validator?.context
    });

    await startMempoolService(config.services.mempool.port || 7004, mempoolService);
    context.services.mempool = mempoolService;
    console.log(`[mempool] Started on port ${config.services.mempool.port}`);

    // Hook up P2P → mempool
    if (context.services.p2p) {
      context.services.p2p.onTransaction(async (tx) => {
        console.log('[p2p→mempool] received tx from gossip');
        await context.services.mempool!.submit(tx, true);
      });

      if (context.services.explorer) {
        context.services.p2p.onINS(async (entry) => {
          console.log('[p2p→ins] received INS entry from gossip');
          await context.services.explorer!.ins.publish(entry);
        });
      }
    }
  }

  // Start RPC service (always enabled)
  const rpc = createEnhancedRPC();
  context.services.rpc = rpc;
  console.log('[rpc] Enhanced RPC service initialized');

  // Start Paymaster (disabled by default, enable via profile)
  const paymaster = createPaymasterValidator({ enabled: false });
  context.services.paymaster = paymaster;
  console.log(`[paymaster] Validator initialized (enabled: ${paymaster.isEnabled()})`);

  console.log('');
  console.log('✅ All services started');
  console.log('Press Ctrl+C to stop');

  return context;
}

/**
 * Print usage help
 */
export function printHelp(): void {
  console.log(`
WSTFChain Unified Runner

Usage:
  ts-node src/runner/unified.ts [options]

Options:
  --profile=<name>        Use predefined profile (dev, testnet, mainnet, minimal, full)
  --services=<list>       Enable specific services (comma-separated)
  --<service>.port=<num>  Override port for a service

Profiles:
  dev       Development mode with relaxed limits (default)
  testnet   Testnet mode with moderate limits
  mainnet   Production mode with strict limits
  minimal   Only accounts and validator
  full      All services and features

Examples:
  ts-node src/runner/unified.ts --profile=dev
  ts-node src/runner/unified.ts --profile=testnet --services=accounts,validator
  ts-node src/runner/unified.ts --profile=mainnet --validator.port=8002
`);
}

// Main entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  startRunner(args).catch(err => {
    console.error('Error starting runner:', err);
    process.exit(1);
  });
}
