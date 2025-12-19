/**
 * Nodes Module Implementation
 *
 * Handles node discovery, monitoring, and selection.
 */

import type { RpcClient } from '../core';
import type { NetworkProfile } from '../network/types';
import type {
  NodesModule,
  NodeInfo,
  NodeRole,
  NodeSelectionCriteria,
  NodeHealth,
  NodeDiscoverySource,
} from './types';

/**
 * Static fallback nodes for bootstrapping
 */
const STATIC_BOOTSTRAP_NODES: Record<string, NodeInfo[]> = {
  'wstf-local': [
    {
      nodeId: 'local-validator-1',
      alias: 'Local Validator',
      roles: ['validator', 'explorer'],
      rpcUrl: 'http://127.0.0.1:7002',
      trustScore: 1000,
      region: 'local',
      version: '0.1.0',
    },
    {
      nodeId: 'local-indexer-1',
      alias: 'Local Indexer',
      roles: ['indexer', 'explorer'],
      rpcUrl: 'http://127.0.0.1:7200',
      trustScore: 1000,
      region: 'local',
      version: '0.1.0',
    },
  ],
  'wstf-devnet': [
    {
      nodeId: 'devnet-validator-1',
      alias: 'Devnet Validator 1',
      roles: ['validator', 'explorer'],
      rpcUrl: 'https://devnet.rpc.wstf.xyz',
      trustScore: 950,
      region: 'us-east-1',
      version: '0.1.0',
    },
    {
      nodeId: 'devnet-indexer-1',
      alias: 'Devnet Indexer 1',
      roles: ['indexer'],
      rpcUrl: 'https://devnet.indexer.wstf.xyz',
      trustScore: 900,
      region: 'us-east-1',
      version: '0.1.0',
    },
  ],
};

/**
 * Nodes module implementation
 */
class NodesModuleImpl implements NodesModule {
  private networkProfile: NetworkProfile;
  private client: RpcClient;
  private healthMonitoringInterval?: NodeJS.Timeout;
  private healthCallback?: (nodeId: string, health: NodeHealth) => void;
  private knownNodes: Map<string, NodeInfo> = new Map();

  constructor(networkProfile: NetworkProfile, client: RpcClient) {
    this.networkProfile = networkProfile;
    this.client = client;
    this.loadStaticNodes();
  }

  private loadStaticNodes(): void {
    const staticNodes = STATIC_BOOTSTRAP_NODES[this.networkProfile.chainId] || [];
    staticNodes.forEach(node => {
      this.knownNodes.set(node.nodeId, node);
    });
  }

  async listKnownNodes(role?: NodeRole): Promise<NodeInfo[]> {
    try {
      // Try to get dynamic node list from indexer or registry
      const dynamicNodes = await this.fetchDynamicNodes(role);
      if (dynamicNodes.length > 0) {
        return dynamicNodes;
      }

      // Fallback to static/cached nodes
      const allNodes = Array.from(this.knownNodes.values());
      if (role) {
        return allNodes.filter(node => node.roles.includes(role));
      }
      return allNodes;
    } catch (error) {
      console.warn('Failed to fetch dynamic nodes, using static list:', error);

      // Return static nodes
      const allNodes = Array.from(this.knownNodes.values());
      if (role) {
        return allNodes.filter(node => node.roles.includes(role));
      }
      return allNodes;
    }
  }

  private async fetchDynamicNodes(role?: NodeRole): Promise<NodeInfo[]> {
    if (!this.networkProfile.rpcUrls.indexer) {
      return [];
    }

    try {
      const url = role
        ? `${this.networkProfile.rpcUrls.indexer}/network/nodes?role=${role}`
        : `${this.networkProfile.rpcUrls.indexer}/network/nodes`;

      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }

      const data = await response.json() as any;
      const nodes: NodeInfo[] = data.nodes || [];

      // Cache the nodes
      nodes.forEach(node => {
        this.knownNodes.set(node.nodeId, node);
      });

      return nodes;
    } catch {
      return [];
    }
  }

  async getNodeInfo(nodeId: string): Promise<NodeInfo | null> {
    // Check cache first
    const cached = this.knownNodes.get(nodeId);
    if (cached) {
      return cached;
    }

    try {
      // Try to fetch from indexer
      if (this.networkProfile.rpcUrls.indexer) {
        const response = await fetch(
          `${this.networkProfile.rpcUrls.indexer}/network/nodes/${nodeId}`
        );

        if (response.ok) {
          const data = await response.json() as any;
          const nodeInfo: NodeInfo = data.node;
          this.knownNodes.set(nodeId, nodeInfo);
          return nodeInfo;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  async findBestNodes(criteria: NodeSelectionCriteria): Promise<NodeInfo[]> {
    const allNodes = await this.listKnownNodes();

    let filtered = allNodes;

    // Filter by roles
    if (criteria.roles && criteria.roles.length > 0) {
      filtered = filtered.filter(node =>
        criteria.roles!.some(role => node.roles.includes(role))
      );
    }

    // Filter by trust score
    if (criteria.minTrustScore !== undefined) {
      filtered = filtered.filter(node =>
        (node.trustScore || 0) >= criteria.minTrustScore!
      );
    }

    // Filter by latency
    if (criteria.maxLatencyMs !== undefined) {
      filtered = filtered.filter(node =>
        !node.metrics || node.metrics.latencyMs <= criteria.maxLatencyMs!
      );
    }

    // Filter by region
    if (criteria.preferredRegion) {
      const regionFiltered = filtered.filter(node =>
        node.region === criteria.preferredRegion
      );
      if (regionFiltered.length > 0) {
        filtered = regionFiltered;
      }
    }

    // Sort by trust score and latency
    return filtered.sort((a, b) => {
      const trustA = a.trustScore || 0;
      const trustB = b.trustScore || 0;
      const latencyA = a.metrics?.latencyMs || Infinity;
      const latencyB = b.metrics?.latencyMs || Infinity;

      // Primary sort by trust score (descending)
      if (trustA !== trustB) {
        return trustB - trustA;
      }

      // Secondary sort by latency (ascending)
      return latencyA - latencyB;
    });
  }

  async checkNodeHealth(nodeUrl: string): Promise<NodeHealth> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${nodeUrl}/health`);

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json() as any;
        return {
          healthy: data.status === 'healthy',
          latencyMs,
          lastPing: Date.now(),
          syncState: data.syncState || 'synced',
        };
      }

      return {
        healthy: false,
        latencyMs,
        lastPing: Date.now(),
        syncState: 'error',
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        healthy: false,
        latencyMs,
        lastPing: Date.now(),
        syncState: 'error',
        errorMessage: String(error),
      };
    }
  }

  async getRecommendedNode(role: NodeRole, region?: string): Promise<NodeInfo | null> {
    const criteria: NodeSelectionCriteria = {
      roles: [role],
      minTrustScore: 500,
      preferredRegion: region,
    };

    const bestNodes = await this.findBestNodes(criteria);
    return bestNodes.length > 0 ? bestNodes[0] : null;
  }

  startHealthMonitoring(callback: (nodeId: string, health: NodeHealth) => void): void {
    this.healthCallback = callback;

    // Monitor every 30 seconds
    this.healthMonitoringInterval = setInterval(async () => {
      const nodes = Array.from(this.knownNodes.values());

      // Check health of all known nodes
      for (const node of nodes) {
        try {
          const health = await this.checkNodeHealth(node.rpcUrl);
          this.healthCallback?.(node.nodeId, health);
        } catch (error) {
          const errorHealth: NodeHealth = {
            healthy: false,
            latencyMs: 0,
            lastPing: Date.now(),
            syncState: 'error',
            errorMessage: String(error),
          };
          this.healthCallback?.(node.nodeId, errorHealth);
        }
      }
    }, 30000);
  }

  stopHealthMonitoring(): void {
    if (this.healthMonitoringInterval) {
      clearInterval(this.healthMonitoringInterval);
      this.healthMonitoringInterval = undefined;
    }
    this.healthCallback = undefined;
  }
}

/**
 * Create a nodes module instance
 */
export function createNodesModule(
  networkProfile: NetworkProfile,
  client: RpcClient
): NodesModule {
  return new NodesModuleImpl(networkProfile, client);
}