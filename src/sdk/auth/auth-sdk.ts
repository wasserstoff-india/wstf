/**
 * WSTFAuth SDK
 *
 * High-level SDK for interacting with WSTFAuth access control system.
 * Provides easy-to-use functions for authentication, resource management, and access control.
 */

import { KeypairSigner } from '../core/signer';
import { WSTFAuthToken, AccessControlEntry, AccessControlList } from '../../auth/wstf-auth';

/**
 * Auth SDK configuration
 */
export interface AuthSDKConfig {
  /** Auth API base URL */
  apiUrl: string;

  /** User's signer for authentication */
  signer?: KeypairSigner;

  /** Default timeout for requests (ms) */
  timeout?: number;

  /** Auto-refresh tokens */
  autoRefresh?: boolean;
}

/**
 * Resource creation options
 */
export interface CreateResourceOptions {
  description?: string;
  defaultLevel?: 'read' | 'write' | 'admin';
  allowSelfRegistration?: boolean;
  initialEntries?: Array<{
    publicKey: string;
    label: string;
    level: 'read' | 'write' | 'admin';
    scopes: string[];
    expiresAt?: bigint;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Access grant options
 */
export interface GrantAccessOptions {
  label?: string;
  level?: 'read' | 'write' | 'admin';
  scopes?: string[];
  expiresAt?: bigint;
  metadata?: Record<string, any>;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  token?: WSTFAuthToken;
  error?: string;
  challenge?: {
    challengeId: string;
    message: string;
    expiresAt: number;
  };
}

/**
 * Resource info
 */
export interface ResourceInfo {
  resourceId: string;
  name: string;
  description?: string;
  owner: string;
  defaultLevel: string;
  allowSelfRegistration: boolean;
  totalEntries: number;
  createdAt: string;
}

/**
 * User access info
 */
export interface UserAccess {
  resourceId: string;
  name: string;
  description?: string;
  owner: string;
  access: {
    level: 'read' | 'write' | 'admin';
    scopes: string[];
    expiresAt?: string;
    grantedAt: string;
  };
}

/**
 * Main WSTFAuth SDK class
 */
export class WSTFAuthSDK {
  private apiUrl: string;
  private signer?: KeypairSigner;
  private timeout: number;
  private autoRefresh: boolean;
  private currentToken?: WSTFAuthToken;

  constructor(config: AuthSDKConfig) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, '');
    this.signer = config.signer;
    this.timeout = config.timeout || 30000;
    this.autoRefresh = config.autoRefresh || true;
  }

  /**
   * Set or update the signer
   */
  setSigner(signer: KeypairSigner): void {
    this.signer = signer;
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Authenticate with a resource
   */
  async authenticate(resourceId: string, signer?: KeypairSigner): Promise<AuthResult> {
    const authSigner = signer || this.signer;
    if (!authSigner) {
      throw new Error('Signer required for authentication');
    }

    try {
      // Step 1: Request challenge
      const challengeResponse = await this.fetchAPI('/challenge', {
        method: 'POST',
        body: JSON.stringify({
          resourceId,
          publicKey: authSigner.publicKeyBase64
        })
      });

      if (!challengeResponse.ok) {
        const errorData = await challengeResponse.json();
        return { success: false, error: errorData.error };
      }

      const challengeData = await challengeResponse.json();
      if (!challengeData.ok) {
        return { success: false, error: challengeData.error };
      }

      const challenge = challengeData.challenge;

      // Step 2: Sign challenge
      const messageBytes = new TextEncoder().encode(challenge.message);
      const signature = await authSigner.sign(messageBytes);

      // Step 3: Verify challenge
      const verifyResponse = await this.fetchAPI('/verify-challenge', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          publicKey: authSigner.publicKeyBase64,
          signature
        })
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        return { success: false, error: errorData.error };
      }

      const verifyData = await verifyResponse.json();
      if (!verifyData.ok) {
        return { success: false, error: verifyData.error };
      }

      const token = verifyData.token;
      this.currentToken = token;

      // Setup auto-refresh if enabled
      if (this.autoRefresh) {
        this.setupTokenRefresh(resourceId, authSigner);
      }

      return { success: true, token };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Logout from current session
   */
  async logout(): Promise<void> {
    if (this.currentToken) {
      try {
        await this.fetchAPI('/logout', {
          method: 'POST',
          headers: this.getAuthHeaders()
        });
      } catch (error) {
        console.warn('Logout request failed:', error);
      }
    }

    this.currentToken = undefined;
  }

  /**
   * Get current user info
   */
  async getUserInfo(): Promise<{
    publicKey: string;
    label: string;
    level: 'read' | 'write' | 'admin';
    scopes: string[];
    sessionId: string;
    expiresAt: number;
    resource: ResourceInfo;
  } | null> {
    if (!this.currentToken) {
      return null;
    }

    try {
      const response = await this.fetchAPI('/user-info', {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.ok ? data.user : null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Check if current user has specific permission
   */
  hasPermission(level: 'read' | 'write' | 'admin' = 'read', scope?: string): boolean {
    if (!this.currentToken) {
      return false;
    }

    // Check level
    const levelHierarchy = { read: 0, write: 1, admin: 2 };
    const hasLevelPermission = levelHierarchy[this.currentToken.level] >= levelHierarchy[level];

    if (!hasLevelPermission) {
      return false;
    }

    // Check scope if specified
    if (scope) {
      const hasScope = this.currentToken.scopes.includes('*') || this.currentToken.scopes.includes(scope);
      if (!hasScope) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // RESOURCE MANAGEMENT
  // ============================================================================

  /**
   * Create a new access-controlled resource
   */
  async createResource(
    resourceId: string,
    name: string,
    options: CreateResourceOptions = {}
  ): Promise<{ success: boolean; resource?: ResourceInfo; error?: string }> {
    if (!this.signer) {
      throw new Error('Signer required for resource creation');
    }

    try {
      const response = await this.fetchAPI('/resources', {
        method: 'POST',
        body: JSON.stringify({
          resourceId,
          name,
          owner: this.signer.address,
          ...options
        })
      });

      const data = await response.json();

      if (!data.ok) {
        return { success: false, error: data.error };
      }

      return { success: true, resource: data.resource };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get resource information
   */
  async getResource(resourceId: string): Promise<ResourceInfo | null> {
    try {
      const response = await this.fetchAPI(`/resources/${resourceId}`);
      const data = await response.json();
      return data.ok ? data.resource : null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Get access control list for a resource (admin only)
   */
  async getResourceACL(resourceId: string): Promise<AccessControlList | null> {
    try {
      const response = await this.fetchAPI(`/resources/${resourceId}/acl`, {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.ok ? data.acl : null;

    } catch (error) {
      return null;
    }
  }

  // ============================================================================
  // ACCESS CONTROL
  // ============================================================================

  /**
   * Grant access to a user for a resource
   */
  async grantAccess(
    resourceId: string,
    userPublicKey: string,
    options: GrantAccessOptions = {}
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchAPI(`/resources/${resourceId}/grant-access`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          userPublicKey,
          ...options
        })
      });

      const data = await response.json();
      return { success: data.ok, error: data.ok ? undefined : data.error };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke access for a user
   */
  async revokeAccess(
    resourceId: string,
    userPublicKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchAPI(`/resources/${resourceId}/revoke-access`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ userPublicKey })
      });

      const data = await response.json();
      return { success: data.ok, error: data.ok ? undefined : data.error };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk grant access to multiple users
   */
  async bulkGrantAccess(
    resourceId: string,
    users: Array<{ publicKey: string; options?: GrantAccessOptions }>
  ): Promise<{
    success: boolean;
    results: Array<{ publicKey: string; success: boolean; error?: string }>;
  }> {
    const results = [];

    for (const user of users) {
      const result = await this.grantAccess(resourceId, user.publicKey, user.options);
      results.push({
        publicKey: user.publicKey,
        success: result.success,
        error: result.error
      });
    }

    const allSuccessful = results.every(r => r.success);
    return { success: allSuccessful, results };
  }

  // ============================================================================
  // USER RESOURCES
  // ============================================================================

  /**
   * Get resources owned by current user
   */
  async getMyResources(): Promise<ResourceInfo[]> {
    try {
      const response = await this.fetchAPI('/my-resources', {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.ok ? data.resources : [];

    } catch (error) {
      return [];
    }
  }

  /**
   * Get resources current user has access to
   */
  async getMyAccess(): Promise<UserAccess[]> {
    try {
      const response = await this.fetchAPI('/my-access', {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.ok ? data.resources : [];

    } catch (error) {
      return [];
    }
  }

  // ============================================================================
  // GATED URLs
  // ============================================================================

  /**
   * Generate a gated URL with embedded authentication
   */
  async createGatedURL(
    resourceId: string,
    baseURL: string
  ): Promise<{ success: boolean; gatedURL?: string; expiresAt?: number; error?: string }> {
    try {
      const response = await this.fetchAPI(`/resources/${resourceId}/gated-url`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ baseURL })
      });

      const data = await response.json();

      if (!data.ok) {
        return { success: false, error: data.error };
      }

      return {
        success: true,
        gatedURL: data.gatedURL,
        expiresAt: data.expiresAt
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Setup automatic token refresh
   */
  private setupTokenRefresh(resourceId: string, signer: KeypairSigner): void {
    if (!this.currentToken) return;

    const timeUntilExpiry = this.currentToken.exp - Date.now();
    const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 60 * 1000); // 5 minutes before expiry

    setTimeout(async () => {
      try {
        const result = await this.authenticate(resourceId, signer);
        if (result.success && result.token) {
          this.currentToken = result.token;
          this.setupTokenRefresh(resourceId, signer); // Setup next refresh
        }
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }, refreshTime);
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.currentToken) {
      return {};
    }

    return {
      'Authorization': `Bearer ${btoa(JSON.stringify(this.currentToken))}`
    };
  }

  /**
   * Fetch API with common options
   */
  private async fetchAPI(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.apiUrl}${endpoint}`;

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    const response = await fetch(url, defaultOptions);
    return response;
  }

  /**
   * Get current authentication token
   */
  getToken(): WSTFAuthToken | undefined {
    return this.currentToken;
  }

  /**
   * Set authentication token (for external token management)
   */
  setToken(token: WSTFAuthToken): void {
    this.currentToken = token;
  }
}

/**
 * Create a WSTFAuth SDK instance
 */
export function createAuthSDK(config: AuthSDKConfig): WSTFAuthSDK {
  return new WSTFAuthSDK(config);
}

/**
 * Utility function to parse gated URL parameters
 */
export function parseGatedURL(url: string): { resourceId: string; token: WSTFAuthToken } | null {
  try {
    const urlObj = new URL(url);
    const resourceId = urlObj.searchParams.get('wstf_resource');
    const tokenB64 = urlObj.searchParams.get('wstf_token');

    if (!resourceId || !tokenB64) {
      return null;
    }

    const token = JSON.parse(atob(tokenB64));
    return { resourceId, token };
  } catch {
    return null;
  }
}