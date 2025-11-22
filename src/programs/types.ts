/**
 * Program Types
 *
 * Types for on-chain program registration, metadata, and policies.
 */

import { ConfirmationTier } from '../trust/types';

/**
 * Program status
 */
export type ProgramStatus = 'active' | 'paused' | 'deprecated' | 'banned';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum calls per hour per caller */
  maxCallsPerHourPerCaller: number;
  /** Maximum total calls per hour */
  maxCallsPerHourTotal: number;
  /** Burst limit (max concurrent calls) */
  burstLimit: number;
}

/**
 * Access control configuration
 */
export interface AccessControl {
  /** Minimum trust tier required */
  minTrustTier: ConfirmationTier;
  /** If true, allow all addresses (subject to trust tier) */
  allowAll: boolean;
  /** Explicit allowlist of addresses (if allowAll is false) */
  allowlist?: string[];
  /** Explicit blocklist of addresses */
  blocklist?: string[];
}

/**
 * Payload constraints
 */
export interface PayloadConstraints {
  /** Maximum payload size in bytes */
  maxPayloadBytes: number;
  /** Maximum response size in bytes */
  maxResponseBytes: number;
  /** Maximum execution time in milliseconds */
  maxExecutionMs: number;
}

/**
 * Program policy - defines access rules and limits
 */
export interface ProgramPolicy {
  /** Access control rules */
  access: AccessControl;
  /** Rate limiting configuration */
  rateLimit: RateLimitConfig;
  /** Payload constraints */
  constraints: PayloadConstraints;
  /** Required deposit amount (anti-spam) */
  requiredDeposit?: bigint;
  /** Per-call fee */
  callFee?: bigint;
}

/**
 * Service endpoint information
 */
export interface ServiceEndpoint {
  /** HTTP URL for the service */
  url: string;
  /** Supported HTTP methods */
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE')[];
  /** Whether TLS is required */
  requiresTls: boolean;
  /** Health check endpoint path */
  healthCheckPath?: string;
}

/**
 * Program metadata - descriptive information
 */
export interface ProgramMetadata {
  /** Program ID (namespace/version format) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Version string (semver) */
  version: string;
  /** Description of what the program does */
  description: string;
  /** Program owner address */
  owner: string;
  /** Tags for discovery */
  tags: string[];
  /** Homepage URL */
  homepage?: string;
  /** Documentation URL */
  docsUrl?: string;
  /** Repository URL */
  repoUrl?: string;
  /** Icon URL */
  iconUrl?: string;
  /** Service endpoints */
  endpoints?: ServiceEndpoint[];
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Program registration - full on-chain record
 */
export interface ProgramRegistration {
  /** Program metadata */
  metadata: ProgramMetadata;
  /** Program policy */
  policy: ProgramPolicy;
  /** Current status */
  status: ProgramStatus;
  /** Registration transaction ID */
  registrationTxId: string;
  /** Block height of registration */
  registrationBlock: bigint;
  /** Total calls received */
  totalCalls: bigint;
  /** Total unique callers */
  uniqueCallers: number;
  /** Last call timestamp */
  lastCallAt?: number;
  /** Revenue accumulated (from callFee) */
  totalRevenue: bigint;
}

/**
 * Program update request
 */
export interface ProgramUpdateRequest {
  /** Program ID */
  programId: string;
  /** New metadata (partial) */
  metadata?: Partial<Omit<ProgramMetadata, 'id' | 'owner' | 'createdAt'>>;
  /** New policy (partial) */
  policy?: Partial<ProgramPolicy>;
  /** New status */
  status?: ProgramStatus;
}

/**
 * Program registration request
 */
export interface ProgramRegistrationRequest {
  /** Desired program ID */
  id: string;
  /** Program metadata */
  metadata: Omit<ProgramMetadata, 'id' | 'owner' | 'createdAt' | 'updatedAt'>;
  /** Program policy */
  policy: ProgramPolicy;
}

/**
 * Default program policy
 */
export const DEFAULT_PROGRAM_POLICY: ProgramPolicy = {
  access: {
    minTrustTier: ConfirmationTier.INCLUDED,
    allowAll: true,
  },
  rateLimit: {
    maxCallsPerHourPerCaller: 100,
    maxCallsPerHourTotal: 10000,
    burstLimit: 10,
  },
  constraints: {
    maxPayloadBytes: 4096,
    maxResponseBytes: 16384,
    maxExecutionMs: 30000,
  },
};

/**
 * Program query filter
 */
export interface ProgramFilter {
  /** Filter by owner address */
  owner?: string;
  /** Filter by status */
  status?: ProgramStatus;
  /** Filter by tags (any match) */
  tags?: string[];
  /** Search in name/description */
  search?: string;
  /** Minimum trust tier */
  minTrustTier?: ConfirmationTier;
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'totalCalls' | 'name';
  /** Sort direction */
  sortDir?: 'asc' | 'desc';
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
}

/**
 * Program catalog query result
 */
export interface ProgramCatalogResult {
  /** Programs matching the filter */
  programs: ProgramRegistration[];
  /** Total matching count (before pagination) */
  totalCount: number;
  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Validate program ID format
 * Format: namespace/vN (e.g., "my.program/v1")
 */
export function validateProgramId(id: string): { valid: boolean; error?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Program ID is required' };
  }

  const parts = id.split('/');
  if (parts.length !== 2) {
    return { valid: false, error: 'Program ID must be in format namespace/version' };
  }

  const [namespace, version] = parts;

  // Validate namespace (alphanumeric, dots, hyphens, 3-64 chars)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.\-]{2,63}$/.test(namespace)) {
    return { valid: false, error: 'Invalid namespace format' };
  }

  // Validate version (v followed by number)
  if (!/^v\d+$/.test(version)) {
    return { valid: false, error: 'Version must be in format vN (e.g., v1)' };
  }

  return { valid: true };
}

/**
 * Parse program ID into parts
 */
export function parseProgramId(id: string): { namespace: string; version: number } | null {
  const validation = validateProgramId(id);
  if (!validation.valid) {
    return null;
  }

  const [namespace, versionStr] = id.split('/');
  const version = parseInt(versionStr.slice(1), 10);

  return { namespace, version };
}

/**
 * Build program ID from parts
 */
export function buildProgramId(namespace: string, version: number): string {
  return `${namespace}/v${version}`;
}

/**
 * Check if an address is allowed by a policy
 */
export function isAddressAllowed(address: string, policy: ProgramPolicy): boolean {
  // Check blocklist first
  if (policy.access.blocklist?.includes(address)) {
    return false;
  }

  // If allowAll is true, address is allowed (unless blocklisted)
  if (policy.access.allowAll) {
    return true;
  }

  // Check allowlist
  return policy.access.allowlist?.includes(address) ?? false;
}

/**
 * Check if a trust tier meets the minimum requirement
 */
export function meetsTrustRequirement(
  actualTier: ConfirmationTier,
  requiredTier: ConfirmationTier
): boolean {
  return actualTier >= requiredTier;
}
