/**
 * Program Catalog RPC Service
 *
 * RPC endpoints for querying the on-chain program registry.
 */

import {
  ProgramMetadata,
  ProgramPolicy,
  ProgramRegistration,
  ProgramStatus,
  ProgramFilter,
  ProgramCatalogResult,
  validateProgramId,
  isAddressAllowed,
  meetsTrustRequirement,
} from '../programs/types';
import { ConfirmationTier } from '../trust/types';
import { RPCResponse } from './types';

/**
 * Program info for RPC responses
 */
export interface ProgramInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  owner: string;
  status: ProgramStatus;
  tags: string[];
  endpoints?: { url: string; methods: string[] }[];
  createdAt: number;
  updatedAt: number;
  stats: {
    totalCalls: string;
    uniqueCallers: number;
    lastCallAt?: number;
  };
}

/**
 * Program details (includes policy)
 */
export interface ProgramDetails extends ProgramInfo {
  policy: {
    minTrustTier: string;
    allowAll: boolean;
    hasAllowlist: boolean;
    hasBlocklist: boolean;
    maxCallsPerHourPerCaller: number;
    maxCallsPerHourTotal: number;
    maxPayloadBytes: number;
    maxResponseBytes: number;
    maxExecutionMs: number;
    requiredDeposit?: string;
    callFee?: string;
  };
  homepage?: string;
  docsUrl?: string;
  repoUrl?: string;
  iconUrl?: string;
}

/**
 * Access check result
 */
export interface AccessCheckResult {
  allowed: boolean;
  reason: string;
  requirements?: {
    minTrustTier: string;
    requiredDeposit?: string;
    callFee?: string;
  };
}

/**
 * Program catalog response
 */
export interface ProgramCatalogResponse {
  programs: ProgramInfo[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

/**
 * Program Catalog RPC Service
 */
export class ProgramCatalogRPC {
  private programs: Map<string, ProgramRegistration> = new Map();
  private byOwner: Map<string, Set<string>> = new Map();
  private byTag: Map<string, Set<string>> = new Map();
  private byStatus: Map<ProgramStatus, Set<string>> = new Map();

  constructor() {
    // Initialize status indexes
    for (const status of ['active', 'paused', 'deprecated', 'banned'] as ProgramStatus[]) {
      this.byStatus.set(status, new Set());
    }
  }

  /**
   * Index a program registration
   */
  indexProgram(registration: ProgramRegistration): void {
    const { id } = registration.metadata;

    // Store program
    this.programs.set(id, registration);

    // Index by owner
    const ownerSet = this.byOwner.get(registration.metadata.owner) ?? new Set();
    ownerSet.add(id);
    this.byOwner.set(registration.metadata.owner, ownerSet);

    // Index by tags
    for (const tag of registration.metadata.tags) {
      const tagSet = this.byTag.get(tag) ?? new Set();
      tagSet.add(id);
      this.byTag.set(tag, tagSet);
    }

    // Index by status
    const statusSet = this.byStatus.get(registration.status) ?? new Set();
    statusSet.add(id);
    this.byStatus.set(registration.status, statusSet);
  }

  /**
   * Remove program from index
   */
  removeProgram(programId: string): void {
    const registration = this.programs.get(programId);
    if (!registration) return;

    // Remove from owner index
    const ownerSet = this.byOwner.get(registration.metadata.owner);
    ownerSet?.delete(programId);

    // Remove from tag indexes
    for (const tag of registration.metadata.tags) {
      const tagSet = this.byTag.get(tag);
      tagSet?.delete(programId);
    }

    // Remove from status index
    const statusSet = this.byStatus.get(registration.status);
    statusSet?.delete(programId);

    // Remove from main store
    this.programs.delete(programId);
  }

  /**
   * Convert registration to program info
   */
  private toInfo(registration: ProgramRegistration): ProgramInfo {
    const { metadata, status, totalCalls, uniqueCallers, lastCallAt } = registration;
    return {
      id: metadata.id,
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      owner: metadata.owner,
      status,
      tags: metadata.tags,
      endpoints: metadata.endpoints?.map(e => ({
        url: e.url,
        methods: e.methods,
      })),
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      stats: {
        totalCalls: totalCalls.toString(),
        uniqueCallers,
        lastCallAt,
      },
    };
  }

  /**
   * Convert registration to program details
   */
  private toDetails(registration: ProgramRegistration): ProgramDetails {
    const info = this.toInfo(registration);
    const { policy, metadata } = registration;

    return {
      ...info,
      policy: {
        minTrustTier: ConfirmationTier[policy.access.minTrustTier],
        allowAll: policy.access.allowAll,
        hasAllowlist: !!(policy.access.allowlist && policy.access.allowlist.length > 0),
        hasBlocklist: !!(policy.access.blocklist && policy.access.blocklist.length > 0),
        maxCallsPerHourPerCaller: policy.rateLimit.maxCallsPerHourPerCaller,
        maxCallsPerHourTotal: policy.rateLimit.maxCallsPerHourTotal,
        maxPayloadBytes: policy.constraints.maxPayloadBytes,
        maxResponseBytes: policy.constraints.maxResponseBytes,
        maxExecutionMs: policy.constraints.maxExecutionMs,
        requiredDeposit: policy.requiredDeposit?.toString(),
        callFee: policy.callFee?.toString(),
      },
      homepage: metadata.homepage,
      docsUrl: metadata.docsUrl,
      repoUrl: metadata.repoUrl,
      iconUrl: metadata.iconUrl,
    };
  }

  // ============================================
  // RPC Methods
  // ============================================

  /**
   * Get program by ID
   */
  async getProgram(programId: string): Promise<RPCResponse<ProgramDetails>> {
    const validation = validateProgramId(programId);
    if (!validation.valid) {
      return {
        ok: false,
        error: { code: 'INVALID_ID', message: validation.error! },
      };
    }

    const registration = this.programs.get(programId);
    if (!registration) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Program ${programId} not found` },
      };
    }

    return { ok: true, data: this.toDetails(registration) };
  }

  /**
   * List programs with filtering and pagination
   */
  async listPrograms(filter: ProgramFilter = {}): Promise<RPCResponse<ProgramCatalogResponse>> {
    const {
      owner,
      status,
      tags,
      search,
      minTrustTier,
      sortBy = 'createdAt',
      sortDir = 'desc',
      offset = 0,
      limit = 20,
    } = filter;

    // Get candidate program IDs
    let candidateIds: Set<string>;

    if (owner) {
      candidateIds = new Set(this.byOwner.get(owner) ?? []);
    } else if (status) {
      candidateIds = new Set(this.byStatus.get(status) ?? []);
    } else if (tags && tags.length > 0) {
      // Union of all matching tags
      candidateIds = new Set();
      for (const tag of tags) {
        const tagSet = this.byTag.get(tag);
        if (tagSet) {
          for (const id of tagSet) {
            candidateIds.add(id);
          }
        }
      }
    } else {
      // All programs
      candidateIds = new Set(this.programs.keys());
    }

    // Filter and convert to registrations
    let registrations: ProgramRegistration[] = [];
    for (const id of candidateIds) {
      const reg = this.programs.get(id);
      if (!reg) continue;

      // Apply status filter (if not already filtered by status index)
      if (status && reg.status !== status) continue;

      // Apply owner filter (if not already filtered by owner index)
      if (owner && reg.metadata.owner !== owner) continue;

      // Apply trust tier filter
      if (minTrustTier !== undefined) {
        if (reg.policy.access.minTrustTier > minTrustTier) continue;
      }

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matches =
          reg.metadata.name.toLowerCase().includes(searchLower) ||
          reg.metadata.description.toLowerCase().includes(searchLower) ||
          reg.metadata.id.toLowerCase().includes(searchLower);
        if (!matches) continue;
      }

      registrations.push(reg);
    }

    // Sort
    registrations.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'createdAt':
          cmp = a.metadata.createdAt - b.metadata.createdAt;
          break;
        case 'updatedAt':
          cmp = a.metadata.updatedAt - b.metadata.updatedAt;
          break;
        case 'totalCalls':
          cmp = Number(a.totalCalls - b.totalCalls);
          break;
        case 'name':
          cmp = a.metadata.name.localeCompare(b.metadata.name);
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    // Apply pagination
    const totalCount = registrations.length;
    const paginated = registrations.slice(offset, offset + limit);
    const programs = paginated.map(r => this.toInfo(r));

    return {
      ok: true,
      data: {
        programs,
        totalCount,
        hasMore: offset + programs.length < totalCount,
        offset,
        limit,
      },
    };
  }

  /**
   * Get programs by owner
   */
  async getProgramsByOwner(
    owner: string,
    offset = 0,
    limit = 20
  ): Promise<RPCResponse<ProgramCatalogResponse>> {
    return this.listPrograms({ owner, offset, limit });
  }

  /**
   * Get programs by tag
   */
  async getProgramsByTag(
    tag: string,
    offset = 0,
    limit = 20
  ): Promise<RPCResponse<ProgramCatalogResponse>> {
    return this.listPrograms({ tags: [tag], offset, limit });
  }

  /**
   * Search programs
   */
  async searchPrograms(
    query: string,
    offset = 0,
    limit = 20
  ): Promise<RPCResponse<ProgramCatalogResponse>> {
    return this.listPrograms({ search: query, offset, limit });
  }

  /**
   * Check if a caller can access a program
   */
  async checkAccess(
    programId: string,
    caller: string,
    callerTrustTier: ConfirmationTier
  ): Promise<RPCResponse<AccessCheckResult>> {
    const registration = this.programs.get(programId);
    if (!registration) {
      return {
        ok: true,
        data: {
          allowed: false,
          reason: 'Program not found',
        },
      };
    }

    // Check status
    if (registration.status !== 'active') {
      return {
        ok: true,
        data: {
          allowed: false,
          reason: `Program is ${registration.status}`,
        },
      };
    }

    const { policy } = registration;

    // Check trust tier
    if (!meetsTrustRequirement(callerTrustTier, policy.access.minTrustTier)) {
      return {
        ok: true,
        data: {
          allowed: false,
          reason: `Insufficient trust tier: need ${ConfirmationTier[policy.access.minTrustTier]}, have ${ConfirmationTier[callerTrustTier]}`,
          requirements: {
            minTrustTier: ConfirmationTier[policy.access.minTrustTier],
            requiredDeposit: policy.requiredDeposit?.toString(),
            callFee: policy.callFee?.toString(),
          },
        },
      };
    }

    // Check address access
    if (!isAddressAllowed(caller, policy)) {
      return {
        ok: true,
        data: {
          allowed: false,
          reason: 'Address not in allowlist or is blocklisted',
          requirements: {
            minTrustTier: ConfirmationTier[policy.access.minTrustTier],
          },
        },
      };
    }

    return {
      ok: true,
      data: {
        allowed: true,
        reason: 'Access granted',
        requirements: {
          minTrustTier: ConfirmationTier[policy.access.minTrustTier],
          requiredDeposit: policy.requiredDeposit?.toString(),
          callFee: policy.callFee?.toString(),
        },
      },
    };
  }

  /**
   * Get program stats
   */
  async getProgramStats(programId: string): Promise<RPCResponse<{
    totalCalls: string;
    uniqueCallers: number;
    lastCallAt?: number;
    totalRevenue: string;
    status: ProgramStatus;
  }>> {
    const registration = this.programs.get(programId);
    if (!registration) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Program ${programId} not found` },
      };
    }

    return {
      ok: true,
      data: {
        totalCalls: registration.totalCalls.toString(),
        uniqueCallers: registration.uniqueCallers,
        lastCallAt: registration.lastCallAt,
        totalRevenue: registration.totalRevenue.toString(),
        status: registration.status,
      },
    };
  }

  /**
   * Get catalog stats
   */
  async getCatalogStats(): Promise<RPCResponse<{
    totalPrograms: number;
    activePrograms: number;
    pausedPrograms: number;
    deprecatedPrograms: number;
    totalOwners: number;
    totalTags: number;
  }>> {
    return {
      ok: true,
      data: {
        totalPrograms: this.programs.size,
        activePrograms: this.byStatus.get('active')?.size ?? 0,
        pausedPrograms: this.byStatus.get('paused')?.size ?? 0,
        deprecatedPrograms: this.byStatus.get('deprecated')?.size ?? 0,
        totalOwners: this.byOwner.size,
        totalTags: this.byTag.size,
      },
    };
  }

  /**
   * Get all tags with counts
   */
  async getTags(): Promise<RPCResponse<{ tag: string; count: number }[]>> {
    const tags: { tag: string; count: number }[] = [];
    for (const [tag, programIds] of this.byTag) {
      tags.push({ tag, count: programIds.size });
    }
    tags.sort((a, b) => b.count - a.count);
    return { ok: true, data: tags };
  }
}

/**
 * Create a new ProgramCatalogRPC instance
 */
export function createProgramCatalogRPC(): ProgramCatalogRPC {
  return new ProgramCatalogRPC();
}
