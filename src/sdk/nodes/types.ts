/**
 * Nodes Module Types
 */

/**
 * Node role types in the WSTF network
 */
export type NodeRole = 'validator' | 'follower' | 'bridge' | 'indexer' | 'p2p' | 'explorer';

/**
 * Node information
 */
export interface NodeInfo {
  /** Unique node identifier */
  nodeId: string;

  /** Human-readable node alias */
  alias?: string;

  /** Node roles */
  roles: NodeRole[];

  /** RPC endpoint URL */
  rpcUrl: string;

  /** P2P network ID */
  p2pId?: string;

  /** Trust/reputation score (0-1000) */
  trustScore?: number;

  /** Last seen timestamp */
  lastSeenMsAgo?: number;

  /** Geographic region */
  region?: string;

  /** Node version */
  version?: string;

  /** Node capabilities */
  capabilities?: {
    accounts: boolean;
    validator: boolean;
    explorer: boolean;
    mempool: boolean;
    p2p: boolean;
    indexer: boolean;
    bridgeRegistry: boolean;
  };

  /** Performance metrics */
  metrics?: {
    latencyMs: number;
    uptime: number;
    successRate: number;
  };
}

/**
 * Node selection criteria
 */
export interface NodeSelectionCriteria {
  /** Required roles */
  roles?: NodeRole[];

  /** Minimum trust score */
  minTrustScore?: number;

  /** Maximum latency */
  maxLatencyMs?: number;

  /** Preferred region */
  preferredRegion?: string;

  /** Required capabilities */
  requiredCapabilities?: string[];
}

/**
 * Node health status
 */
export interface NodeHealth {
  /** Is the node healthy */
  healthy: boolean;

  /** Response latency in milliseconds */
  latencyMs: number;

  /** Last successful ping */
  lastPing: number;

  /** Error message if unhealthy */
  errorMessage?: string;

  /** Sync status */
  syncState: 'synced' | 'syncing' | 'behind' | 'error';
}

/**
 * Nodes module interface
 */
export interface NodesModule {
  /**
   * List known nodes by role
   */
  listKnownNodes(role?: NodeRole): Promise<NodeInfo[]>;

  /**
   * Get specific node information
   */
  getNodeInfo(nodeId: string): Promise<NodeInfo | null>;

  /**
   * Find best nodes based on criteria
   */
  findBestNodes(criteria: NodeSelectionCriteria): Promise<NodeInfo[]>;

  /**
   * Check health of a specific node
   */
  checkNodeHealth(nodeUrl: string): Promise<NodeHealth>;

  /**
   * Get recommended node for a specific purpose
   */
  getRecommendedNode(role: NodeRole, region?: string): Promise<NodeInfo | null>;

  /**
   * Monitor node health continuously
   */
  startHealthMonitoring(callback: (nodeId: string, health: NodeHealth) => void): void;

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void;
}

/**
 * Node discovery source
 */
export type NodeDiscoverySource = 'static' | 'indexer' | 'p2p' | 'registry';