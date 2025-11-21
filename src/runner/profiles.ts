/**
 * Runner Profiles - Predefined configuration profiles for different environments
 */
import { WSTFConfig, DEFAULT_CONFIG } from '../config/types';

/**
 * Profile names
 */
export type ProfileName = 'dev' | 'testnet' | 'mainnet' | 'minimal' | 'full';

/**
 * Profile definition
 */
export interface Profile {
  name: ProfileName;
  description: string;
  config: WSTFConfig;
}

/**
 * Development profile - all services, relaxed limits
 */
export const DEV_PROFILE: Profile = {
  name: 'dev',
  description: 'Development mode with all services and relaxed limits',
  config: {
    services: {
      accounts: { enabled: true, port: 7001 },
      validator: {
        enabled: true,
        port: 7002,
        limits: {
          maxProgramBytes: 1048576, // 1MB - relaxed for dev
          maxInstructionsPerTx: 256
        }
      },
      explorer: { enabled: true, port: 7003 },
      p2p: {
        enabled: true,
        port: 9001,
        maxPeers: 10,
        rateLimit: {
          messagesPerSecond: 1000, // Relaxed for dev
          bytesPerSecond: 10485760 // 10MB/s
        }
      },
      mempool: {
        enabled: true,
        port: 7004,
        policy: {
          maxTxBytes: 10485760, // 10MB - relaxed
          maxTxPerSender: 100,
          maxPoolSize: 50000
        }
      }
    },
    modules: {
      sys: ['REG', 'INIT', 'UPDATE', 'SIGN', 'VERIFY', 'RENT', 'XVAL']
    }
  }
};

/**
 * Testnet profile - production-like with moderate limits
 */
export const TESTNET_PROFILE: Profile = {
  name: 'testnet',
  description: 'Testnet mode with production-like settings',
  config: {
    services: {
      accounts: { enabled: true, port: 7001 },
      validator: {
        enabled: true,
        port: 7002,
        limits: {
          maxProgramBytes: 524288, // 512KB
          maxInstructionsPerTx: 128
        }
      },
      explorer: { enabled: true, port: 7003 },
      p2p: {
        enabled: true,
        port: 9001,
        maxPeers: 50,
        rateLimit: {
          messagesPerSecond: 200,
          bytesPerSecond: 2097152 // 2MB/s
        }
      },
      mempool: {
        enabled: true,
        port: 7004,
        policy: {
          maxTxBytes: 2097152, // 2MB
          maxTxPerSender: 32,
          maxPoolSize: 20000
        }
      }
    },
    modules: {
      sys: ['REG', 'INIT', 'UPDATE', 'SIGN', 'VERIFY', 'RENT', 'XVAL']
    }
  }
};

/**
 * Mainnet profile - strict limits, production settings
 */
export const MAINNET_PROFILE: Profile = {
  name: 'mainnet',
  description: 'Mainnet mode with strict limits and production settings',
  config: {
    services: {
      accounts: { enabled: true, port: 7001 },
      validator: {
        enabled: true,
        port: 7002,
        limits: {
          maxProgramBytes: 262144, // 256KB
          maxInstructionsPerTx: 64
        }
      },
      explorer: { enabled: true, port: 7003 },
      p2p: {
        enabled: true,
        port: 9001,
        maxPeers: 100,
        rateLimit: {
          messagesPerSecond: 100,
          bytesPerSecond: 1048576 // 1MB/s
        }
      },
      mempool: {
        enabled: true,
        port: 7004,
        policy: {
          maxTxBytes: 1048576, // 1MB
          maxTxPerSender: 16,
          maxPoolSize: 10000
        }
      }
    },
    modules: {
      sys: ['REG', 'INIT', 'UPDATE', 'SIGN', 'VERIFY', 'RENT', 'XVAL']
    }
  }
};

/**
 * Minimal profile - only essential services
 */
export const MINIMAL_PROFILE: Profile = {
  name: 'minimal',
  description: 'Minimal mode with only accounts and validator',
  config: {
    services: {
      accounts: { enabled: true, port: 7001 },
      validator: {
        enabled: true,
        port: 7002,
        limits: {
          maxProgramBytes: 262144,
          maxInstructionsPerTx: 128
        }
      },
      explorer: { enabled: false, port: 7003 },
      p2p: {
        enabled: false,
        port: 9001,
        maxPeers: 0,
        rateLimit: {
          messagesPerSecond: 0,
          bytesPerSecond: 0
        }
      },
      mempool: {
        enabled: false,
        port: 7004,
        policy: {
          maxTxBytes: 0,
          maxTxPerSender: 0,
          maxPoolSize: 0
        }
      }
    },
    modules: {
      sys: ['REG', 'INIT', 'UPDATE', 'VERIFY']
    }
  }
};

/**
 * Full profile - all services enabled
 */
export const FULL_PROFILE: Profile = {
  name: 'full',
  description: 'Full mode with all services and features',
  config: {
    ...TESTNET_PROFILE.config,
    modules: {
      sys: ['REG', 'INIT', 'UPDATE', 'SIGN', 'VERIFY', 'RENT', 'XVAL'],
      xval: {
        evm: true,
        btc: true,
        sol: true
      }
    }
  }
};

/**
 * Profile registry
 */
export const PROFILES: Record<ProfileName, Profile> = {
  dev: DEV_PROFILE,
  testnet: TESTNET_PROFILE,
  mainnet: MAINNET_PROFILE,
  minimal: MINIMAL_PROFILE,
  full: FULL_PROFILE
};

/**
 * Get profile by name
 */
export function getProfile(name: string): Profile | undefined {
  return PROFILES[name as ProfileName];
}

/**
 * List available profiles
 */
export function listProfiles(): Profile[] {
  return Object.values(PROFILES);
}

/**
 * Merge profile with overrides
 */
export function mergeConfig(base: WSTFConfig, overrides: Partial<WSTFConfig>): WSTFConfig {
  const merged = JSON.parse(JSON.stringify(base)) as WSTFConfig;

  if (overrides.services) {
    for (const [key, value] of Object.entries(overrides.services)) {
      if (value && (merged.services as any)[key]) {
        (merged.services as any)[key] = {
          ...(merged.services as any)[key],
          ...value
        };
      }
    }
  }

  if (overrides.modules) {
    merged.modules = {
      ...merged.modules,
      ...overrides.modules
    };
  }

  return merged;
}

/**
 * Load profile from CLI args
 */
export function loadProfileFromArgs(args: string[]): { profile: Profile; overrides: Partial<WSTFConfig> } {
  // Find --profile=<name>
  const profileArg = args.find(arg => arg.startsWith('--profile='));
  const profileName = profileArg ? profileArg.split('=')[1] : 'dev';

  const profile = getProfile(profileName);
  if (!profile) {
    console.warn(`Unknown profile: ${profileName}, using dev`);
    return { profile: DEV_PROFILE, overrides: {} };
  }

  // Parse overrides
  const overrides: Partial<WSTFConfig> = {};

  // --services=... override
  const servicesArg = args.find(arg => arg.startsWith('--services='));
  if (servicesArg) {
    const enabled = servicesArg.split('=')[1].split(',');
    overrides.services = {} as any;

    for (const key of ['accounts', 'validator', 'explorer', 'p2p', 'mempool']) {
      (overrides.services as any)[key] = {
        enabled: enabled.includes(key)
      };
    }
  }

  // --<service>.port=... overrides
  const portRegex = /^--(\w+)\.port=(\d+)$/;
  args.forEach(arg => {
    const match = arg.match(portRegex);
    if (match) {
      const [, service, port] = match;
      if (!overrides.services) overrides.services = {} as any;
      (overrides.services as any)[service] = {
        ...((overrides.services as any)[service] || {}),
        port: parseInt(port, 10)
      };
    }
  });

  return { profile, overrides };
}

/**
 * Print profile information
 */
export function printProfileInfo(profile: Profile): void {
  console.log(`Profile: ${profile.name}`);
  console.log(`Description: ${profile.description}`);
  console.log('');
}
