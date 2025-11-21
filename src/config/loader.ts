/**
 * Configuration loader with CLI flag overrides
 */
import { WSTFConfig, DEFAULT_CONFIG } from './types';

export function loadConfig(args: string[]): WSTFConfig {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as WSTFConfig;

  // Parse --services=p2p,mempool,validator,explorer
  const servicesArg = args.find(arg => arg.startsWith('--services='));
  if (servicesArg) {
    const enabled = servicesArg.split('=')[1].split(',');
    // Disable all, then enable specified
    Object.keys(config.services).forEach(key => {
      (config.services as any)[key].enabled = enabled.includes(key);
    });
  }

  // Parse port overrides
  const portRegex = /^--(\w+)\.port=(\d+)$/;
  args.forEach(arg => {
    const match = arg.match(portRegex);
    if (match) {
      const [, service, port] = match;
      if ((config.services as any)[service]) {
        (config.services as any)[service].port = parseInt(port, 10);
      }
    }
  });

  // Parse P2P config
  const p2pMaxPeers = args.find(arg => arg.startsWith('--p2p.maxPeers='));
  if (p2pMaxPeers) {
    config.services.p2p.maxPeers = parseInt(p2pMaxPeers.split('=')[1], 10);
  }

  // Parse mempool policy
  const mempoolMaxTxBytes = args.find(arg => arg.startsWith('--mempool.policy.maxTxBytes='));
  if (mempoolMaxTxBytes) {
    config.services.mempool.policy.maxTxBytes = parseInt(mempoolMaxTxBytes.split('=')[1], 10);
  }

  const mempoolMaxTxPerSender = args.find(arg => arg.startsWith('--mempool.policy.maxTxPerSender='));
  if (mempoolMaxTxPerSender) {
    config.services.mempool.policy.maxTxPerSender = parseInt(mempoolMaxTxPerSender.split('=')[1], 10);
  }

  return config;
}

export function printCompositionMatrix(config: WSTFConfig): void {
  console.log('[runner] services up:');

  if (config.services.accounts.enabled) {
    console.log(`  - accounts (port: ${config.services.accounts.port})`);
  }

  if (config.services.validator.enabled) {
    console.log(`  - validator (port: ${config.services.validator.port}, tx:v1,v2; sys:${config.modules.sys.join(',')})`);
    console.log(`    limits: maxProgramBytes=${config.services.validator.limits.maxProgramBytes}, maxInstructions=${config.services.validator.limits.maxInstructionsPerTx}`);
  }

  if (config.services.explorer.enabled) {
    console.log(`  - explorer (port: ${config.services.explorer.port})`);
  }

  if (config.services.p2p.enabled) {
    console.log(`  - p2p (port: ${config.services.p2p.port}, maxPeers: ${config.services.p2p.maxPeers})`);
    console.log(`    capabilities: gossip:tx2, gossip:ins`);
    console.log(`    rate limits: ${config.services.p2p.rateLimit.messagesPerSecond} msgs/s, ${config.services.p2p.rateLimit.bytesPerSecond} bytes/s`);
  }

  if (config.services.mempool.enabled) {
    console.log(`  - mempool (port: ${config.services.mempool.port || 7004})`);
    console.log(`    policies: size=${config.services.mempool.policy.maxTxBytes} bytes, perSender=${config.services.mempool.policy.maxTxPerSender}, poolSize=${config.services.mempool.policy.maxPoolSize}`);
  }

  console.log('');
}
