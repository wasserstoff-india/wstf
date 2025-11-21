/**
 * Identity Types - Address identity and signature tracking
 */

/**
 * Identity record for an address
 */
export interface Identity {
  /** Address string (gc1...) */
  address: string;
  /** Signature algorithm ID */
  sigAlg: 'ed25519' | 'secp256k1';
  /** Mapping algorithm ID */
  mappingAlg: 'sha256' | 'keccak256' | 'blake2b';
  /** First seen block height */
  firstSeenHeight: bigint;
  /** First seen timestamp */
  firstSeenTs: number;
  /** Last seen block height */
  lastSeenHeight: bigint;
  /** Last seen timestamp */
  lastSeenTs: number;
  /** Optional username/alias */
  username?: string;
  /** Public key (DER base64) */
  publicKey?: string;
  /** Total transactions sent */
  txCount: number;
}

/**
 * Signature event record
 */
export interface SignatureEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: 'SIGN' | 'VERIFY';
  /** Address that signed/verified */
  address: string;
  /** Digest that was signed */
  digest: string;
  /** Transaction ID */
  txId: string;
  /** Block hash */
  blockHash: string;
  /** Block height */
  blockHeight: bigint;
  /** Timestamp */
  timestamp: number;
  /** Signature (hex) */
  signature?: string;
}

/**
 * Identity service configuration
 */
export interface IdentityConfig {
  /** Enable identity service */
  enabled: boolean;
  /** Max signature events per address to keep */
  maxEventsPerAddress: number;
  /** Max total events to keep */
  maxTotalEvents: number;
}

/**
 * Default identity config
 */
export const DEFAULT_IDENTITY_CONFIG: IdentityConfig = {
  enabled: true,
  maxEventsPerAddress: 1000,
  maxTotalEvents: 100_000,
};

/**
 * Identity query options
 */
export interface IdentityQuery {
  /** Address to query */
  address?: string;
  /** Digest to query */
  digest?: string;
  /** Transaction ID */
  txId?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Identity stats
 */
export interface IdentityStats {
  /** Total unique addresses */
  totalAddresses: number;
  /** Total signature events */
  totalEvents: number;
  /** Events by type */
  eventsByType: { SIGN: number; VERIFY: number };
}
