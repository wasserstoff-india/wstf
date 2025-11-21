/**
 * M3 Runner: Supports P2P and Mempool services
 */
import { startAccountsService } from '../accounts/service';
import { startValidatorService } from '../validator/service';
import { startExplorerService } from '../explorer/service';
import { InMemoryINS } from '../registry/insStore';
import { P2PService, startP2PAPI } from '../p2p/service';
import { MempoolService, startMempoolService } from '../mempool/service';
import { loadConfig, printCompositionMatrix } from '../config/loader';

(async () => {
  const config = loadConfig(process.argv.slice(2));

  console.log('='.repeat(60));
  console.log('WSTFChain M3 - Networking, Mempool & Gossip');
  console.log('='.repeat(60));
  printCompositionMatrix(config);

  let accountsStore;
  let usersIndex;
  let validatorApp;
  let validatorContext;
  let ins: InMemoryINS | undefined;
  let p2pService: P2PService | undefined;
  let mempoolService: MempoolService | undefined;

  // Start Accounts service
  if (config.services.accounts.enabled) {
    const result = await startAccountsService(config.services.accounts.port!);
    accountsStore = result.accounts;
    usersIndex = result.users;
  }

  // Start Validator service
  if (config.services.validator.enabled && accountsStore) {
    const result = await startValidatorService(
      config.services.validator.port!,
      accountsStore
    );
    validatorApp = result.app;

    validatorContext = {
      getAccountState: async (addr: string) => {
        const a = await accountsStore.get(addr);
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
  }

  // Start Explorer service
  if (config.services.explorer.enabled && accountsStore && usersIndex) {
    ins = new InMemoryINS();
    await startExplorerService(
      config.services.explorer.port!,
      accountsStore,
      usersIndex,
      ins
    );
  }

  // Start P2P service
  if (config.services.p2p.enabled) {
    p2pService = new P2PService(config.services.p2p);
    await p2pService.start();

    // Start P2P management API on a separate port
    await startP2PAPI(config.services.p2p.port! + 100, p2pService);
  }

  // Start Mempool service
  if (config.services.mempool.enabled) {
    const validator = validatorApp ? {
      validateBasicTx: validatorContext ? (tx: any, ctx: any) => {
        // Import validation logic
        return import('../validator/basicValidator').then(mod =>
          mod.validateBasicTx(tx, validatorContext)
        );
      } : undefined,
      validateTxV2: validatorContext ? (tx: any, ctx: any) => {
        return import('../validator/txV2Validator').then(mod =>
          mod.validateTxV2(tx, validatorContext)
        );
      } : undefined
    } : undefined;

    mempoolService = new MempoolService(config.services.mempool, {
      validator,
      p2p: p2pService,
      validatorContext
    });

    await startMempoolService(config.services.mempool.port || 7004, mempoolService);

    // Hook up P2P → mempool for incoming transactions
    if (p2pService) {
      p2pService.onTransaction(async (tx) => {
        console.log('[p2p→mempool] received tx from gossip');
        await mempoolService!.submit(tx, true);
      });

      if (ins) {
        p2pService.onINS(async (entry) => {
          console.log('[p2p→ins] received INS entry from gossip');
          await ins!.publish(entry);
        });
      }
    }
  }

  console.log('');
  console.log('✅ All services started');
  console.log('Press Ctrl+C to stop');
})().catch(err => {
  console.error('Error starting services:', err);
  process.exit(1);
});
