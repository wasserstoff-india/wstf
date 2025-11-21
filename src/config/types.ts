/**
 * Feature flags and configuration types for WSTFChain
 */

export interface ServiceConfig {
  enabled: boolean;
  port?: number;
}

export interface P2PConfig extends ServiceConfig {
  port: number;
  maxPeers: number;
  allowlist?: string[];
  rateLimit: {
    messagesPerSecond: number;
    bytesPerSecond: number;
  };
}

export interface MempoolConfig extends ServiceConfig {
  policy: {
    maxTxBytes: number;
    maxTxPerSender: number;
    maxPoolSize: number;
  };
}

export interface ValidatorConfig extends ServiceConfig {
  limits: {
    maxProgramBytes: number;
    maxInstructionsPerTx: number;
  };
}

export interface WSTFConfig {
  services: {
    accounts: ServiceConfig;
    validator: ValidatorConfig;
    explorer: ServiceConfig;
    p2p: P2PConfig;
    mempool: MempoolConfig;
    relay?: ServiceConfig;
  };
  modules: {
    sys: string[]; // e.g., ['REG', 'INIT', 'UPDATE', 'SIGN', 'VERIFY', 'RENT', 'XVAL']
    xval?: {
      evm?: boolean;
      btc?: boolean;
      sol?: boolean;
    };
  };
}

/**
 * Capabilities manifest for a service
 */
export interface ServiceCapabilities {
  service: string;
  version: string;
  modules: string[];
  endpoints: EndpointInfo[];
  policies?: Record<string, any>;
}

export interface EndpointInfo {
  method: string;
  path: string;
  description: string;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: WSTFConfig = {
  services: {
    accounts: { enabled: true, port: 7001 },
    validator: {
      enabled: true,
      port: 7002,
      limits: {
        maxProgramBytes: 262144, // 256KB
        maxInstructionsPerTx: 128
      }
    },
    explorer: { enabled: true, port: 7003 },
    p2p: {
      enabled: false,
      port: 9001,
      maxPeers: 50,
      rateLimit: {
        messagesPerSecond: 100,
        bytesPerSecond: 1048576 // 1MB/s
      }
    },
    mempool: {
      enabled: false,
      port: 7004,
      policy: {
        maxTxBytes: 1048576, // 1MB
        maxTxPerSender: 32,
        maxPoolSize: 10000
      }
    }
  },
  modules: {
    sys: ['REG', 'INIT', 'UPDATE', 'SIGN', 'VERIFY', 'RENT', 'XVAL']
  }
};
