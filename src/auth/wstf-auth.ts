/**
 * WSTFAuth - Access-Gated Frontend Authentication
 *
 * Public key-based access control for frontend applications.
 * Allows creation of gated pages accessible only to authorized public keys.
 */

import { KeypairSigner } from '../sdk/core/signer';
import { verifySignature } from '../sdk/core/signature';

/**
 * Access control entry
 */
export interface AccessControlEntry {
  /** WSTF public key (base64 encoded) */
  publicKey: string;

  /** Human-readable label */
  label: string;

  /** Access level */
  level: 'read' | 'write' | 'admin';

  /** Expiration timestamp (optional) */
  expiresAt?: bigint;

  /** Allowed actions/scopes */
  scopes: string[];

  /** Additional metadata */
  metadata?: Record<string, any>;

  /** Who granted this access */
  grantedBy: string;

  /** When access was granted */
  grantedAt: bigint;
}

/**
 * Access control list for a resource
 */
export interface AccessControlList {
  /** Resource identifier (e.g., frontend URL, app ID) */
  resourceId: string;

  /** Resource name/title */
  name: string;

  /** Resource description */
  description?: string;

  /** Owner's public key */
  owner: string;

  /** List of authorized public keys */
  entries: AccessControlEntry[];

  /** Default access level for new entries */
  defaultLevel: 'read' | 'write' | 'admin';

  /** Whether to allow self-registration */
  allowSelfRegistration: boolean;

  /** Creation timestamp */
  createdAt: bigint;

  /** Last updated timestamp */
  updatedAt: bigint;
}

/**
 * Authentication token for gated access
 */
export interface WSTFAuthToken {
  /** Subject (public key) */
  sub: string;

  /** Resource being accessed */
  aud: string;

  /** Token issuer (usually the resource owner) */
  iss: string;

  /** Token issued at */
  iat: number;

  /** Token expires at */
  exp: number;

  /** Authorized scopes */
  scopes: string[];

  /** Access level */
  level: 'read' | 'write' | 'admin';

  /** Session ID for tracking */
  sessionId: string;
}

/**
 * Challenge for signature-based authentication
 */
export interface AuthChallenge {
  /** Unique challenge ID */
  challengeId: string;

  /** Resource being accessed */
  resourceId: string;

  /** Challenge message to sign */
  message: string;

  /** Challenge creation time */
  createdAt: number;

  /** Challenge expiration (5 minutes) */
  expiresAt: number;

  /** Expected signer public key */
  expectedPublicKey?: string;
}

/**
 * WSTFAuth Manager - handles access control for gated frontends
 */
export class WSTFAuth {
  private acls: Map<string, AccessControlList> = new Map();
  private challenges: Map<string, AuthChallenge> = new Map();
  private activeSessions: Map<string, WSTFAuthToken> = new Map();

  // Clean up expired challenges and sessions every 5 minutes
  private cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);

  /**
   * Create a new access-controlled resource
   */
  createResource(
    resourceId: string,
    name: string,
    owner: string,
    options: {
      description?: string;
      defaultLevel?: 'read' | 'write' | 'admin';
      allowSelfRegistration?: boolean;
      initialEntries?: Omit<AccessControlEntry, 'grantedBy' | 'grantedAt'>[];
    } = {}
  ): AccessControlList {
    if (this.acls.has(resourceId)) {
      throw new Error(`Resource ${resourceId} already exists`);
    }

    const now = BigInt(Date.now());
    const acl: AccessControlList = {
      resourceId,
      name,
      description: options.description,
      owner,
      entries: [],
      defaultLevel: options.defaultLevel || 'read',
      allowSelfRegistration: options.allowSelfRegistration || false,
      createdAt: now,
      updatedAt: now
    };

    // Add initial entries
    if (options.initialEntries) {
      for (const entry of options.initialEntries) {
        acl.entries.push({
          ...entry,
          grantedBy: owner,
          grantedAt: now
        });
      }
    }

    // Owner always has admin access
    acl.entries.push({
      publicKey: owner,
      label: 'Owner',
      level: 'admin',
      scopes: ['*'],
      grantedBy: owner,
      grantedAt: now
    });

    this.acls.set(resourceId, acl);
    return acl;
  }

  /**
   * Grant access to a user for a resource
   */
  grantAccess(
    resourceId: string,
    userPublicKey: string,
    granterPublicKey: string,
    options: {
      label?: string;
      level?: 'read' | 'write' | 'admin';
      scopes?: string[];
      expiresAt?: bigint;
      metadata?: Record<string, any>;
    } = {}
  ): boolean {
    const acl = this.acls.get(resourceId);
    if (!acl) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    // Check if granter has permission to grant access
    if (!this.hasPermission(resourceId, granterPublicKey, 'admin')) {
      throw new Error('Insufficient permissions to grant access');
    }

    // Check if user already has access
    const existingIndex = acl.entries.findIndex(e => e.publicKey === userPublicKey);

    const newEntry: AccessControlEntry = {
      publicKey: userPublicKey,
      label: options.label || `User ${userPublicKey.slice(0, 8)}...`,
      level: options.level || acl.defaultLevel,
      scopes: options.scopes || ['read'],
      expiresAt: options.expiresAt,
      metadata: options.metadata,
      grantedBy: granterPublicKey,
      grantedAt: BigInt(Date.now())
    };

    if (existingIndex >= 0) {
      // Update existing entry
      acl.entries[existingIndex] = newEntry;
    } else {
      // Add new entry
      acl.entries.push(newEntry);
    }

    acl.updatedAt = BigInt(Date.now());
    return true;
  }

  /**
   * Revoke access for a user
   */
  revokeAccess(
    resourceId: string,
    userPublicKey: string,
    revokerPublicKey: string
  ): boolean {
    const acl = this.acls.get(resourceId);
    if (!acl) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    // Check if revoker has permission
    if (!this.hasPermission(resourceId, revokerPublicKey, 'admin')) {
      throw new Error('Insufficient permissions to revoke access');
    }

    // Can't revoke owner's access
    if (userPublicKey === acl.owner) {
      throw new Error('Cannot revoke owner access');
    }

    const index = acl.entries.findIndex(e => e.publicKey === userPublicKey);
    if (index >= 0) {
      acl.entries.splice(index, 1);
      acl.updatedAt = BigInt(Date.now());
      return true;
    }

    return false;
  }

  /**
   * Check if a user has permission to access a resource
   */
  hasPermission(
    resourceId: string,
    userPublicKey: string,
    requiredLevel: 'read' | 'write' | 'admin' = 'read',
    requiredScope?: string
  ): boolean {
    const acl = this.acls.get(resourceId);
    if (!acl) {
      return false;
    }

    const entry = acl.entries.find(e => e.publicKey === userPublicKey);
    if (!entry) {
      return false;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return false;
    }

    // Check level hierarchy: admin > write > read
    const levelHierarchy = { read: 0, write: 1, admin: 2 };
    const hasLevelPermission = levelHierarchy[entry.level] >= levelHierarchy[requiredLevel];

    if (!hasLevelPermission) {
      return false;
    }

    // Check scope if specified
    if (requiredScope) {
      const hasScope = entry.scopes.includes('*') || entry.scopes.includes(requiredScope);
      if (!hasScope) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate authentication challenge
   */
  generateChallenge(
    resourceId: string,
    expectedPublicKey?: string
  ): AuthChallenge {
    const challengeId = this.generateId();
    const challenge: AuthChallenge = {
      challengeId,
      resourceId,
      message: `WSTFAuth access request for ${resourceId}\nChallenge: ${challengeId}\nTimestamp: ${Date.now()}`,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      expectedPublicKey
    };

    this.challenges.set(challengeId, challenge);
    return challenge;
  }

  /**
   * Verify challenge response and issue token
   */
  verifyChallenge(
    challengeId: string,
    signature: string,
    publicKey: string
  ): WSTFAuthToken | null {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      throw new Error('Challenge not found or expired');
    }

    if (challenge.expiresAt < Date.now()) {
      this.challenges.delete(challengeId);
      throw new Error('Challenge expired');
    }

    // Verify public key matches expected (if specified)
    if (challenge.expectedPublicKey && challenge.expectedPublicKey !== publicKey) {
      throw new Error('Public key mismatch');
    }

    // Verify signature
    const messageBytes = new TextEncoder().encode(challenge.message);
    const isValid = verifySignature(messageBytes, signature, publicKey);

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Check if user has permission
    if (!this.hasPermission(challenge.resourceId, publicKey)) {
      throw new Error('Access denied - user not authorized');
    }

    // Get user's access level and scopes
    const acl = this.acls.get(challenge.resourceId)!;
    const entry = acl.entries.find(e => e.publicKey === publicKey)!;

    // Generate token
    const sessionId = this.generateId();
    const token: WSTFAuthToken = {
      sub: publicKey,
      aud: challenge.resourceId,
      iss: acl.owner,
      iat: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      scopes: entry.scopes,
      level: entry.level,
      sessionId
    };

    // Store active session
    this.activeSessions.set(sessionId, token);

    // Clean up challenge
    this.challenges.delete(challengeId);

    return token;
  }

  /**
   * Validate an existing token
   */
  validateToken(token: WSTFAuthToken): boolean {
    if (token.exp < Date.now()) {
      return false;
    }

    const session = this.activeSessions.get(token.sessionId);
    if (!session) {
      return false;
    }

    // Verify token hasn't been tampered with
    return (
      session.sub === token.sub &&
      session.aud === token.aud &&
      session.sessionId === token.sessionId
    );
  }

  /**
   * Revoke a session token
   */
  revokeToken(sessionId: string): boolean {
    return this.activeSessions.delete(sessionId);
  }

  /**
   * Get access control list for a resource
   */
  getACL(resourceId: string): AccessControlList | undefined {
    return this.acls.get(resourceId);
  }

  /**
   * List all resources owned by a public key
   */
  getOwnedResources(ownerPublicKey: string): AccessControlList[] {
    return Array.from(this.acls.values()).filter(acl => acl.owner === ownerPublicKey);
  }

  /**
   * List all resources a user has access to
   */
  getAccessibleResources(userPublicKey: string): Array<{
    acl: AccessControlList;
    entry: AccessControlEntry;
  }> {
    const accessible = [];
    for (const acl of this.acls.values()) {
      const entry = acl.entries.find(e => e.publicKey === userPublicKey);
      if (entry && (!entry.expiresAt || entry.expiresAt > Date.now())) {
        accessible.push({ acl, entry });
      }
    }
    return accessible;
  }

  /**
   * Create a gated URL with embedded authentication
   */
  createGatedURL(
    baseURL: string,
    resourceId: string,
    token: WSTFAuthToken
  ): string {
    const url = new URL(baseURL);
    url.searchParams.set('wstf_resource', resourceId);
    url.searchParams.set('wstf_token', Buffer.from(JSON.stringify(token)).toString('base64'));
    return url.toString();
  }

  /**
   * Parse authentication from URL parameters
   */
  parseGatedURL(url: string): { resourceId: string; token: WSTFAuthToken } | null {
    try {
      const urlObj = new URL(url);
      const resourceId = urlObj.searchParams.get('wstf_resource');
      const tokenB64 = urlObj.searchParams.get('wstf_token');

      if (!resourceId || !tokenB64) {
        return null;
      }

      const token = JSON.parse(Buffer.from(tokenB64, 'base64').toString());
      return { resourceId, token };
    } catch {
      return null;
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Clean up expired challenges and sessions
   */
  private cleanup(): void {
    const now = Date.now();

    // Clean up expired challenges
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt < now) {
        this.challenges.delete(id);
      }
    }

    // Clean up expired sessions
    for (const [id, session] of this.activeSessions) {
      if (session.exp < now) {
        this.activeSessions.delete(id);
      }
    }
  }

  /**
   * Destroy the auth manager
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.acls.clear();
    this.challenges.clear();
    this.activeSessions.clear();
  }
}

/**
 * Global WSTFAuth instance
 */
export const wstfAuth = new WSTFAuth();