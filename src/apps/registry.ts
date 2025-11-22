/**
 * App Registry - Store and manage application registrations
 *
 * Provides CRUD operations for apps and installations with
 * optimistic concurrency control.
 */

import crypto from 'crypto';
import {
  AppId,
  AppVersion,
  AppManifest,
  AppInstallation,
  makeAppId,
  makeAppVersion,
  validateAppManifest,
  compareVersions,
} from './types';
import { OrgId, PermissionStr } from '../accounts/orgTypes';

// ============================================================================
// Store Interface
// ============================================================================

/** Interface for app registry implementations */
export interface AppRegistry {
  // App operations
  registerApp(manifest: AppManifest): Promise<void>;
  getApp(appId: AppId): Promise<AppManifest | undefined>;
  updateApp(appId: AppId, updates: Partial<AppManifest>, expectedVersion: bigint): Promise<void>;
  listApps(filters?: AppFilters): Promise<AppManifest[]>;
  deactivateApp(appId: AppId): Promise<void>;

  // Installation operations
  installApp(installation: AppInstallation): Promise<void>;
  getInstallation(installationId: string): Promise<AppInstallation | undefined>;
  updateInstallation(
    installationId: string,
    updates: Partial<AppInstallation>,
    expectedVersion: bigint
  ): Promise<void>;
  uninstallApp(installationId: string): Promise<void>;
  listInstallations(appId?: AppId, orgId?: OrgId, userAddress?: string): Promise<AppInstallation[]>;

  // Permission checks
  checkAppPermission(installationId: string, permission: PermissionStr): Promise<boolean>;
}

/** Filters for listing apps */
export interface AppFilters {
  publisherAddress?: string;
  orgId?: OrgId;
  category?: string;
  isActive?: boolean;
  isVerified?: boolean;
  nameContains?: string;
}

// ============================================================================
// Errors
// ============================================================================

/** Concurrency error */
export class AppConcurrencyError extends Error {
  constructor(
    public entityType: string,
    public entityId: string,
    public expectedVersion: bigint,
    public actualVersion: bigint
  ) {
    super(`Concurrency conflict on ${entityType} ${entityId}: expected v${expectedVersion}, got v${actualVersion}`);
    this.name = 'AppConcurrencyError';
  }
}

/** Not found error */
export class AppNotFoundError extends Error {
  constructor(
    public entityType: string,
    public entityId: string
  ) {
    super(`${entityType} not found: ${entityId}`);
    this.name = 'AppNotFoundError';
  }
}

/** Validation error */
export class AppValidationError extends Error {
  constructor(public errors: string[]) {
    super(`App validation failed: ${errors.join(', ')}`);
    this.name = 'AppValidationError';
  }
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

/** In-memory app registry for testing and single-node usage */
export class InMemoryAppRegistry implements AppRegistry {
  private apps = new Map<AppId, AppManifest>();
  private installations = new Map<string, AppInstallation>();

  // -------------------------------------------------------------------------
  // App Operations
  // -------------------------------------------------------------------------

  async registerApp(manifest: AppManifest): Promise<void> {
    // Validate manifest
    const validation = validateAppManifest(manifest);
    if (!validation.valid) {
      throw new AppValidationError(validation.errors);
    }

    if (this.apps.has(manifest.appId)) {
      throw new Error(`App already exists: ${manifest.appId}`);
    }

    this.apps.set(manifest.appId, this.cloneManifest(manifest));
  }

  async getApp(appId: AppId): Promise<AppManifest | undefined> {
    const app = this.apps.get(appId);
    return app ? this.cloneManifest(app) : undefined;
  }

  async updateApp(appId: AppId, updates: Partial<AppManifest>, expectedVersion: bigint): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) {
      throw new AppNotFoundError('App', appId);
    }
    if (app.stateVersion !== expectedVersion) {
      throw new AppConcurrencyError('App', appId, expectedVersion, app.stateVersion);
    }

    // Version bump check
    if (updates.version) {
      if (compareVersions(updates.version, app.version) <= 0) {
        throw new Error(`New version must be greater than current version (${app.version})`);
      }
    }

    const updated: AppManifest = {
      ...app,
      ...updates,
      appId, // prevent overwrite
      publisherAddress: app.publisherAddress, // prevent overwrite
      registeredAt: app.registeredAt, // prevent overwrite
      updatedAt: BigInt(Date.now()),
      stateVersion: app.stateVersion + 1n,
      requiredPermissions: updates.requiredPermissions || app.requiredPermissions,
      entryPoints: updates.entryPoints || app.entryPoints,
    };

    this.apps.set(appId, updated);
  }

  async listApps(filters?: AppFilters): Promise<AppManifest[]> {
    let results = Array.from(this.apps.values());

    if (filters) {
      if (filters.publisherAddress) {
        results = results.filter((a) => a.publisherAddress === filters.publisherAddress);
      }
      if (filters.orgId) {
        results = results.filter((a) => a.orgId === filters.orgId);
      }
      if (filters.category) {
        results = results.filter((a) => a.categories?.includes(filters.category!));
      }
      if (filters.isActive !== undefined) {
        results = results.filter((a) => a.isActive === filters.isActive);
      }
      if (filters.isVerified !== undefined) {
        results = results.filter((a) => a.isVerified === filters.isVerified);
      }
      if (filters.nameContains) {
        const search = filters.nameContains.toLowerCase();
        results = results.filter((a) => a.name.toLowerCase().includes(search));
      }
    }

    return results.map((a) => this.cloneManifest(a));
  }

  async deactivateApp(appId: AppId): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) {
      throw new AppNotFoundError('App', appId);
    }

    this.apps.set(appId, {
      ...app,
      isActive: false,
      updatedAt: BigInt(Date.now()),
      stateVersion: app.stateVersion + 1n,
    });
  }

  // -------------------------------------------------------------------------
  // Installation Operations
  // -------------------------------------------------------------------------

  async installApp(installation: AppInstallation): Promise<void> {
    // Verify app exists
    const app = this.apps.get(installation.appId);
    if (!app) {
      throw new AppNotFoundError('App', installation.appId);
    }
    if (!app.isActive) {
      throw new Error(`App ${installation.appId} is not active`);
    }

    // Verify required permissions are granted
    for (const perm of app.requiredPermissions) {
      if (!installation.grantedPermissions.includes(perm)) {
        throw new Error(`Required permission not granted: ${perm}`);
      }
    }

    if (this.installations.has(installation.installationId)) {
      throw new Error(`Installation already exists: ${installation.installationId}`);
    }

    this.installations.set(installation.installationId, this.cloneInstallation(installation));
  }

  async getInstallation(installationId: string): Promise<AppInstallation | undefined> {
    const installation = this.installations.get(installationId);
    return installation ? this.cloneInstallation(installation) : undefined;
  }

  async updateInstallation(
    installationId: string,
    updates: Partial<AppInstallation>,
    expectedVersion: bigint
  ): Promise<void> {
    const installation = this.installations.get(installationId);
    if (!installation) {
      throw new AppNotFoundError('Installation', installationId);
    }
    if (installation.version !== expectedVersion) {
      throw new AppConcurrencyError('Installation', installationId, expectedVersion, installation.version);
    }

    const updated: AppInstallation = {
      ...installation,
      ...updates,
      installationId, // prevent overwrite
      appId: installation.appId, // prevent overwrite
      installedAt: installation.installedAt, // prevent overwrite
      version: installation.version + 1n,
      grantedPermissions: updates.grantedPermissions || installation.grantedPermissions,
    };

    this.installations.set(installationId, updated);
  }

  async uninstallApp(installationId: string): Promise<void> {
    if (!this.installations.has(installationId)) {
      throw new AppNotFoundError('Installation', installationId);
    }
    this.installations.delete(installationId);
  }

  async listInstallations(appId?: AppId, orgId?: OrgId, userAddress?: string): Promise<AppInstallation[]> {
    let results = Array.from(this.installations.values());

    if (appId) {
      results = results.filter((i) => i.appId === appId);
    }
    if (orgId) {
      results = results.filter((i) => i.orgId === orgId);
    }
    if (userAddress) {
      results = results.filter((i) => i.userAddress === userAddress);
    }

    return results.map((i) => this.cloneInstallation(i));
  }

  // -------------------------------------------------------------------------
  // Permission Checks
  // -------------------------------------------------------------------------

  async checkAppPermission(installationId: string, permission: PermissionStr): Promise<boolean> {
    const installation = this.installations.get(installationId);
    if (!installation || !installation.isActive) {
      return false;
    }
    return installation.grantedPermissions.includes(permission);
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  private cloneManifest(manifest: AppManifest): AppManifest {
    return JSON.parse(JSON.stringify(manifest, (_key, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    ), (_key, value) => {
      if (typeof value === 'string' && value.endsWith('n') && /^\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
      }
      return value;
    });
  }

  private cloneInstallation(installation: AppInstallation): AppInstallation {
    return JSON.parse(JSON.stringify(installation, (_key, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    ), (_key, value) => {
      if (typeof value === 'string' && value.endsWith('n') && /^\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
      }
      return value;
    });
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /** Clear all data (for testing) */
  clear(): void {
    this.apps.clear();
    this.installations.clear();
  }

  /** Get stats for debugging */
  stats(): { apps: number; activeApps: number; installations: number } {
    let activeApps = 0;
    for (const app of this.apps.values()) {
      if (app.isActive) activeApps++;
    }
    return {
      apps: this.apps.size,
      activeApps,
      installations: this.installations.size,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/** Create a new in-memory app registry */
export function createAppRegistry(): AppRegistry {
  return new InMemoryAppRegistry();
}

/** Generate a deterministic app ID */
export function generateAppId(publisherAddress: string, name: string, nonce: bigint): AppId {
  const hash = crypto.createHash('sha256')
    .update(`app:${publisherAddress}:${name}:${nonce}`)
    .digest('hex')
    .slice(0, 16);
  return makeAppId(`app_${hash}`);
}

/** Generate a deterministic installation ID */
export function generateInstallationId(
  appId: AppId,
  orgId: OrgId | undefined,
  userAddress: string | undefined,
  nonce: bigint
): string {
  const hash = crypto.createHash('sha256')
    .update(`install:${appId}:${orgId || ''}:${userAddress || ''}:${nonce}`)
    .digest('hex')
    .slice(0, 16);
  return `inst_${hash}`;
}
