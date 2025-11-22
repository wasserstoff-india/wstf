/**
 * App Manifest Types - Application registration and metadata
 *
 * Apps are thin wrappers that:
 * - Declare required permissions
 * - Reference Org/RBAC for access control
 * - Define UI/API manifest for service connectors
 */

import { OrgId, PermissionStr } from '../accounts/orgTypes';

// ============================================================================
// Branded Types
// ============================================================================

/** Application identifier */
export type AppId = string & { readonly __brand: 'AppId' };

/** Application version string (semver) */
export type AppVersion = string & { readonly __brand: 'AppVersion' };

// ============================================================================
// App Manifest Types
// ============================================================================

/** Application manifest - defines app metadata and requirements */
export interface AppManifest {
  /** Unique app identifier */
  appId: AppId;

  /** Human-readable name */
  name: string;

  /** App version (semver) */
  version: AppVersion;

  /** Description */
  description?: string;

  /** Developer/publisher address */
  publisherAddress: string;

  /** Org that owns this app (optional) */
  orgId?: OrgId;

  /** Permissions required by this app */
  requiredPermissions: PermissionStr[];

  /** Optional permissions (app works without them) */
  optionalPermissions?: PermissionStr[];

  /** Entry points / API definitions */
  entryPoints: AppEntryPoint[];

  /** UI manifest for frontend rendering */
  ui?: AppUiManifest;

  /** Categories/tags */
  categories?: string[];

  /** Homepage URL */
  homepage?: string;

  /** Support URL */
  supportUrl?: string;

  /** Privacy policy URL */
  privacyPolicyUrl?: string;

  /** Terms of service URL */
  termsOfServiceUrl?: string;

  /** Icon URL or base64 data */
  icon?: string;

  /** Screenshots/preview images */
  screenshots?: string[];

  /** When app was registered */
  registeredAt: bigint;

  /** Last update timestamp */
  updatedAt: bigint;

  /** Version for concurrency */
  stateVersion: bigint;

  /** Whether app is active/published */
  isActive: boolean;

  /** Whether app is verified/audited */
  isVerified: boolean;
}

/** Application entry point (API endpoint or action) */
export interface AppEntryPoint {
  /** Entry point identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this entry point does */
  description?: string;

  /** Type of entry point */
  type: 'action' | 'query' | 'webhook' | 'cron';

  /** Permissions required for this entry point */
  permissions?: PermissionStr[];

  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>;

  /** Output schema (JSON Schema) */
  outputSchema?: Record<string, unknown>;

  /** Rate limit configuration */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

/** UI manifest for frontend rendering */
export interface AppUiManifest {
  /** Type of UI */
  type: 'embedded' | 'redirect' | 'native';

  /** URL for embedded iframe or redirect */
  url?: string;

  /** Width hint for embedded UI */
  width?: number | 'full';

  /** Height hint for embedded UI */
  height?: number | 'auto';

  /** Theme support */
  theme?: 'light' | 'dark' | 'system';

  /** Custom CSS URL */
  customCssUrl?: string;

  /** Supported locales */
  locales?: string[];
}

// ============================================================================
// App Installation Types
// ============================================================================

/** App installation record - tracks which orgs/users have installed an app */
export interface AppInstallation {
  /** Installation identifier */
  installationId: string;

  /** Installed app */
  appId: AppId;

  /** App version at installation */
  appVersion: AppVersion;

  /** Installing org (if org-level install) */
  orgId?: OrgId;

  /** Installing user address (if user-level install) */
  userAddress?: string;

  /** Granted permissions (subset of required + optional) */
  grantedPermissions: PermissionStr[];

  /** Custom configuration */
  config?: Record<string, unknown>;

  /** When installed */
  installedAt: bigint;

  /** Last accessed */
  lastAccessedAt?: bigint;

  /** Version for concurrency */
  version: bigint;

  /** Whether installation is active */
  isActive: boolean;
}

// ============================================================================
// App Events
// ============================================================================

/** Event: app registered */
export interface AppRegisteredEvent {
  type: 'APP_REGISTERED';
  appId: AppId;
  name: string;
  publisherAddress: string;
  version: AppVersion;
  timestamp: bigint;
}

/** Event: app updated */
export interface AppUpdatedEvent {
  type: 'APP_UPDATED';
  appId: AppId;
  changes: string[];
  newVersion?: AppVersion;
  timestamp: bigint;
}

/** Event: app installed */
export interface AppInstalledEvent {
  type: 'APP_INSTALLED';
  appId: AppId;
  installationId: string;
  orgId?: OrgId;
  userAddress?: string;
  grantedPermissions: PermissionStr[];
  timestamp: bigint;
}

/** Event: app uninstalled */
export interface AppUninstalledEvent {
  type: 'APP_UNINSTALLED';
  appId: AppId;
  installationId: string;
  timestamp: bigint;
}

/** Union of all app events */
export type AppEvent =
  | AppRegisteredEvent
  | AppUpdatedEvent
  | AppInstalledEvent
  | AppUninstalledEvent;

// ============================================================================
// Helper Functions
// ============================================================================

/** Create an AppId from raw string */
export function makeAppId(raw: string): AppId {
  return raw as AppId;
}

/** Create an AppVersion from raw string */
export function makeAppVersion(raw: string): AppVersion {
  return raw as AppVersion;
}

/** Validate semver version string */
export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(version);
}

/** Compare semver versions */
export function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const [version] = v.split('-');
    return version.split('.').map(Number);
  };

  const aParts = parseVersion(a);
  const bParts = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    if (aParts[i] > bParts[i]) return 1;
    if (aParts[i] < bParts[i]) return -1;
  }
  return 0;
}

/** Check if app has required permission */
export function appRequiresPermission(manifest: AppManifest, permission: PermissionStr): boolean {
  return manifest.requiredPermissions.includes(permission);
}

/** Check if installation grants permission */
export function installationHasPermission(
  installation: AppInstallation,
  permission: PermissionStr
): boolean {
  return installation.grantedPermissions.includes(permission);
}

/** Validate app manifest */
export function validateAppManifest(manifest: Partial<AppManifest>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest.appId) {
    errors.push('appId is required');
  }

  if (!manifest.name || manifest.name.length < 1 || manifest.name.length > 64) {
    errors.push('name must be 1-64 characters');
  }

  if (!manifest.version || !isValidVersion(manifest.version)) {
    errors.push('version must be valid semver');
  }

  if (!manifest.publisherAddress) {
    errors.push('publisherAddress is required');
  }

  if (!manifest.entryPoints || manifest.entryPoints.length === 0) {
    errors.push('at least one entryPoint is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
