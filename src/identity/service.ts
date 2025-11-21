/**
 * Identity Service - Address identity and signature tracking
 */
import { EventEmitter } from 'events';
import {
  Identity,
  SignatureEvent,
  IdentityConfig,
  DEFAULT_IDENTITY_CONFIG,
  IdentityQuery,
  IdentityStats,
} from './types';

/**
 * Identity Service
 */
export class IdentityService extends EventEmitter {
  private config: IdentityConfig;

  // Identity storage
  private identities = new Map<string, Identity>();

  // Signature event indexes
  private eventsByAddress = new Map<string, SignatureEvent[]>();
  private eventsByDigest = new Map<string, SignatureEvent[]>();
  private eventsByTxId = new Map<string, SignatureEvent[]>();
  private allEvents: SignatureEvent[] = [];

  // Stats
  private signCount = 0;
  private verifyCount = 0;

  constructor(config: Partial<IdentityConfig> = {}) {
    super();
    this.config = { ...DEFAULT_IDENTITY_CONFIG, ...config };
  }

  /**
   * Register or update an identity
   */
  registerIdentity(
    address: string,
    sigAlg: Identity['sigAlg'],
    mappingAlg: Identity['mappingAlg'],
    blockHeight: bigint,
    timestamp: number,
    publicKey?: string
  ): Identity {
    const existing = this.identities.get(address);

    if (existing) {
      // Update last seen
      existing.lastSeenHeight = blockHeight;
      existing.lastSeenTs = timestamp;
      existing.txCount++;
      if (publicKey && !existing.publicKey) {
        existing.publicKey = publicKey;
      }
      return existing;
    }

    // Create new identity
    const identity: Identity = {
      address,
      sigAlg,
      mappingAlg,
      firstSeenHeight: blockHeight,
      firstSeenTs: timestamp,
      lastSeenHeight: blockHeight,
      lastSeenTs: timestamp,
      publicKey,
      txCount: 1,
    };

    this.identities.set(address, identity);
    this.emit('identity:registered', identity);

    return identity;
  }

  /**
   * Get identity by address
   */
  getIdentity(address: string): Identity | null {
    return this.identities.get(address) || null;
  }

  /**
   * Set username for an identity
   */
  setUsername(address: string, username: string): boolean {
    const identity = this.identities.get(address);
    if (!identity) return false;

    identity.username = username;
    this.emit('identity:updated', identity);
    return true;
  }

  /**
   * Record a signature event
   */
  recordSignatureEvent(event: Omit<SignatureEvent, 'id'>): SignatureEvent {
    const id = `${event.type}:${event.txId}:${event.address}:${Date.now()}`;
    const fullEvent: SignatureEvent = { ...event, id };

    // Add to indexes
    this.addToIndex(this.eventsByAddress, event.address, fullEvent);
    this.addToIndex(this.eventsByDigest, event.digest, fullEvent);
    this.addToIndex(this.eventsByTxId, event.txId, fullEvent);

    // Add to global list
    this.allEvents.push(fullEvent);

    // Enforce global limit
    while (this.allEvents.length > this.config.maxTotalEvents) {
      const oldest = this.allEvents.shift();
      if (oldest) {
        this.removeFromIndex(this.eventsByAddress, oldest.address, oldest.id);
        this.removeFromIndex(this.eventsByDigest, oldest.digest, oldest.id);
        this.removeFromIndex(this.eventsByTxId, oldest.txId, oldest.id);
      }
    }

    // Update stats
    if (event.type === 'SIGN') {
      this.signCount++;
    } else {
      this.verifyCount++;
    }

    this.emit('signature:recorded', fullEvent);
    return fullEvent;
  }

  /**
   * Get signature events by address
   */
  getSignaturesByAddress(address: string, limit: number = 100): SignatureEvent[] {
    const events = this.eventsByAddress.get(address) || [];
    return events.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get signature events by digest
   */
  getSignaturesByDigest(digest: string, limit: number = 100): SignatureEvent[] {
    const events = this.eventsByDigest.get(digest) || [];
    return events.slice(-limit).reverse();
  }

  /**
   * Get signature events by transaction ID
   */
  getSignaturesByTxId(txId: string): SignatureEvent[] {
    return this.eventsByTxId.get(txId) || [];
  }

  /**
   * Search signature events
   */
  searchSignatures(query: IdentityQuery): SignatureEvent[] {
    let results: SignatureEvent[] = [];

    if (query.address) {
      results = this.eventsByAddress.get(query.address) || [];
    } else if (query.digest) {
      results = this.eventsByDigest.get(query.digest) || [];
    } else if (query.txId) {
      results = this.eventsByTxId.get(query.txId) || [];
    } else {
      results = [...this.allEvents];
    }

    // Sort by timestamp descending
    results = [...results].sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get all identities (paginated)
   */
  getAllIdentities(limit: number = 100, offset: number = 0): Identity[] {
    const all = Array.from(this.identities.values());
    return all.slice(offset, offset + limit);
  }

  /**
   * Get service statistics
   */
  getStats(): IdentityStats {
    return {
      totalAddresses: this.identities.size,
      totalEvents: this.allEvents.length,
      eventsByType: {
        SIGN: this.signCount,
        VERIFY: this.verifyCount,
      },
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.identities.clear();
    this.eventsByAddress.clear();
    this.eventsByDigest.clear();
    this.eventsByTxId.clear();
    this.allEvents = [];
    this.signCount = 0;
    this.verifyCount = 0;
  }

  // Helper: add to bounded index
  private addToIndex(
    index: Map<string, SignatureEvent[]>,
    key: string,
    event: SignatureEvent
  ): void {
    let list = index.get(key);
    if (!list) {
      list = [];
      index.set(key, list);
    }
    list.push(event);

    // Enforce per-key limit
    while (list.length > this.config.maxEventsPerAddress) {
      list.shift();
    }
  }

  // Helper: remove from index
  private removeFromIndex(
    index: Map<string, SignatureEvent[]>,
    key: string,
    eventId: string
  ): void {
    const list = index.get(key);
    if (!list) return;

    const idx = list.findIndex(e => e.id === eventId);
    if (idx >= 0) {
      list.splice(idx, 1);
    }

    if (list.length === 0) {
      index.delete(key);
    }
  }
}
