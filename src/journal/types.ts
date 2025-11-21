/**
 * Cross-chain journal types
 *
 * The journal captures state diffs after K-depth and writes them
 * to external DA layers for irreversible finality.
 */

/**
 * Single journal entry (state diff)
 */
export interface JournalEntry {
  /** State ID */
  stateId: string;

  /** Version before the change */
  versionBefore: string;

  /** Version after the change */
  versionAfter: string;

  /** Hash of data before */
  dataHashBefore: string;

  /** Hash of data after */
  dataHashAfter: string;

  /** Transaction that caused this change */
  txId: string;
}

/**
 * State diff journal for a block or batch of blocks
 */
export interface StateDiffJournal {
  /** Journal ID */
  id: string;

  /** Starting block hash */
  blockHashStart: string;

  /** Ending block hash */
  blockHashEnd: string;

  /** Starting block height */
  heightStart: bigint;

  /** Ending block height */
  heightEnd: bigint;

  /** Journal creation timestamp */
  timestamp: number;

  /** State root before these changes */
  stateRootBefore: string;

  /** State root after these changes */
  stateRootAfter: string;

  /** All state changes in this batch */
  entries: JournalEntry[];

  /** Signatures/attestations from validators */
  attestations: JournalAttestation[];

  /** Merkle proof anchoring entries to stateRoot (optional) */
  proof?: MerkleProof;
}

/**
 * Attestation from a validator
 */
export interface JournalAttestation {
  /** Validator address */
  validator: string;

  /** Signature over journal hash */
  signature: string;

  /** Timestamp of attestation */
  timestamp: number;
}

/**
 * Merkle proof for journal verification
 */
export interface MerkleProof {
  /** Root hash */
  root: string;

  /** Proof path */
  path: string[];

  /** Leaf index */
  leafIndex: number;
}

/**
 * Journal write result
 */
export interface JournalWriteResult {
  /** Success status */
  ok: boolean;

  /** Transaction hash on target chain */
  txHash?: string;

  /** Target chain identifier */
  chain: string;

  /** Error message if failed */
  error?: string;

  /** Confirmation URL (explorer link) */
  confirmationUrl?: string;

  /** Gas used (if applicable) */
  gasUsed?: bigint;

  /** Cost in target chain currency */
  cost?: string;
}

/**
 * Journal writer interface
 */
export interface JournalWriter {
  /** Chain identifier */
  chain: string;

  /** Write journal to DA layer */
  write(journal: StateDiffJournal): Promise<JournalWriteResult>;

  /** Check if previous write is confirmed */
  checkConfirmation(txHash: string): Promise<{ confirmed: boolean; blockNumber?: bigint }>;

  /** Estimate cost of writing */
  estimateCost(journal: StateDiffJournal): Promise<{ cost: string; gasEstimate: bigint }>;
}

/**
 * Journal collector configuration
 */
export interface JournalConfig {
  /** Enable journal collection */
  enabled: boolean;

  /** Delay after K-depth before collecting (ms) */
  delayAfterKDepthMs: number;

  /** Number of blocks to batch per journal */
  batchSize: number;

  /** Target DA adapters */
  adapters: string[];

  /** Minimum attestations required */
  minAttestations: number;

  /** Max entries per journal */
  maxEntriesPerJournal: number;
}

/**
 * Default journal configuration
 */
export const DEFAULT_JOURNAL_CONFIG: JournalConfig = {
  enabled: false,
  delayAfterKDepthMs: 5000,
  batchSize: 10,
  adapters: ['mock'],
  minAttestations: 1,
  maxEntriesPerJournal: 10000,
};

/**
 * Journal collector state
 */
export interface JournalCollectorState {
  /** Last processed block height */
  lastProcessedHeight: bigint;

  /** Pending journals awaiting write */
  pendingJournals: number;

  /** Total journals written */
  totalWritten: number;

  /** Total entries processed */
  totalEntries: number;

  /** Active adapters */
  activeAdapters: string[];
}
