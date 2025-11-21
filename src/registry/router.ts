import { InMemoryINS, INSEntry } from './insStore';

/**
 * Module routing information
 */
export interface RoutingInfo {
  gossipTopic: string;
  rpcUrls: string[];
  schemaHash: string;
  codeHash?: string;
}

/**
 * Router resolves module identifiers to routing hints
 */
export class INSRouter {
  constructor(private ins: InMemoryINS) {}

  async resolve(
    creatorPkHash: string,
    moduleId: string,
    version?: number
  ): Promise<RoutingInfo | undefined> {
    const entry = await this.ins.resolve(creatorPkHash, moduleId, version);
    if (!entry) return undefined;

    return {
      gossipTopic: entry.gossipTopic,
      rpcUrls: entry.rpcUrls,
      schemaHash: entry.schemaHash,
      codeHash: entry.codeHash
    };
  }
}
