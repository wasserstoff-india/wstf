/**
 * Apps Tests - Application registration and management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AppId,
  AppVersion,
  AppManifest,
  AppInstallation,
  makeAppId,
  makeAppVersion,
  isValidVersion,
  compareVersions,
  validateAppManifest,
} from './types';
import {
  InMemoryAppRegistry,
  createAppRegistry,
  generateAppId,
  generateInstallationId,
  AppNotFoundError,
  AppConcurrencyError,
  AppValidationError,
} from './registry';
import { makeOrgId, makePermission, Permissions } from '../accounts/orgTypes';

describe('App Types', () => {
  describe('Version validation', () => {
    it('should validate correct semver', () => {
      expect(isValidVersion('1.0.0')).toBe(true);
      expect(isValidVersion('0.1.0')).toBe(true);
      expect(isValidVersion('10.20.30')).toBe(true);
      expect(isValidVersion('1.0.0-alpha')).toBe(true);
      expect(isValidVersion('1.0.0-beta.1')).toBe(true);
      expect(isValidVersion('1.0.0+build.123')).toBe(true);
    });

    it('should reject invalid semver', () => {
      expect(isValidVersion('')).toBe(false);
      expect(isValidVersion('1.0')).toBe(false);
      expect(isValidVersion('1')).toBe(false);
      expect(isValidVersion('v1.0.0')).toBe(false);
      expect(isValidVersion('1.0.0.0')).toBe(false);
    });
  });

  describe('Version comparison', () => {
    it('should compare versions correctly', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });
  });

  describe('Manifest validation', () => {
    const validManifest: Partial<AppManifest> = {
      appId: makeAppId('app1'),
      name: 'Test App',
      version: makeAppVersion('1.0.0'),
      publisherAddress: 'publisher1',
      requiredPermissions: [Permissions.TX_SUBMIT],
      entryPoints: [{
        id: 'main',
        name: 'Main',
        type: 'action',
      }],
    };

    it('should validate correct manifest', () => {
      const result = validateAppManifest(validManifest);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject missing appId', () => {
      const { appId, ...manifest } = validManifest;
      const result = validateAppManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('appId is required');
    });

    it('should reject invalid name', () => {
      const result = validateAppManifest({ ...validManifest, name: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid version', () => {
      const result = validateAppManifest({ ...validManifest, version: 'invalid' as AppVersion });
      expect(result.valid).toBe(false);
    });

    it('should reject missing entry points', () => {
      const result = validateAppManifest({ ...validManifest, entryPoints: [] });
      expect(result.valid).toBe(false);
    });
  });

  describe('Branded type helpers', () => {
    it('should create branded types', () => {
      const appId = makeAppId('test-app');
      const version = makeAppVersion('1.0.0');

      expect(appId).toBe('test-app');
      expect(version).toBe('1.0.0');
    });
  });
});

describe('App Registry', () => {
  let registry: InMemoryAppRegistry;

  beforeEach(() => {
    registry = new InMemoryAppRegistry();
  });

  describe('App operations', () => {
    const createTestApp = (): AppManifest => ({
      appId: generateAppId('publisher1', 'TestApp', 0n),
      name: 'Test App',
      version: makeAppVersion('1.0.0'),
      publisherAddress: 'publisher1',
      requiredPermissions: [Permissions.TX_SUBMIT],
      entryPoints: [{
        id: 'main',
        name: 'Main Entry',
        type: 'action',
      }],
      registeredAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      stateVersion: 0n,
      isActive: true,
      isVerified: false,
    });

    it('should register an app', async () => {
      const app = createTestApp();
      await registry.registerApp(app);

      const retrieved = await registry.getApp(app.appId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Test App');
    });

    it('should reject invalid manifest', async () => {
      const app: AppManifest = {
        ...createTestApp(),
        entryPoints: [], // Invalid
      };

      await expect(registry.registerApp(app)).rejects.toThrow(AppValidationError);
    });

    it('should reject duplicate app', async () => {
      const app = createTestApp();
      await registry.registerApp(app);

      await expect(registry.registerApp(app)).rejects.toThrow('already exists');
    });

    it('should update app with correct version', async () => {
      const app = createTestApp();
      await registry.registerApp(app);

      await registry.updateApp(app.appId, {
        name: 'Updated App',
        version: makeAppVersion('1.1.0'),
      }, 0n);

      const updated = await registry.getApp(app.appId);
      expect(updated!.name).toBe('Updated App');
      expect(updated!.version).toBe('1.1.0');
      expect(updated!.stateVersion).toBe(1n);
    });

    it('should reject update with wrong version', async () => {
      const app = createTestApp();
      await registry.registerApp(app);

      await expect(
        registry.updateApp(app.appId, { name: 'Updated' }, 99n)
      ).rejects.toThrow(AppConcurrencyError);
    });

    it('should reject version downgrade', async () => {
      const app = createTestApp();
      await registry.registerApp(app);

      await expect(
        registry.updateApp(app.appId, { version: makeAppVersion('0.9.0') }, 0n)
      ).rejects.toThrow('greater than');
    });

    it('should list apps with filters', async () => {
      const app1 = createTestApp();
      const app2: AppManifest = {
        ...createTestApp(),
        appId: generateAppId('publisher2', 'App2', 0n),
        name: 'App 2',
        publisherAddress: 'publisher2',
        categories: ['finance'],
      };

      await registry.registerApp(app1);
      await registry.registerApp(app2);

      const byPublisher = await registry.listApps({ publisherAddress: 'publisher1' });
      expect(byPublisher.length).toBe(1);

      const byCategory = await registry.listApps({ category: 'finance' });
      expect(byCategory.length).toBe(1);
      expect(byCategory[0].name).toBe('App 2');

      const byName = await registry.listApps({ nameContains: 'Test' });
      expect(byName.length).toBe(1);
    });

    it('should deactivate app', async () => {
      const app = createTestApp();
      await registry.registerApp(app);

      await registry.deactivateApp(app.appId);

      const deactivated = await registry.getApp(app.appId);
      expect(deactivated!.isActive).toBe(false);
    });
  });

  describe('Installation operations', () => {
    let appId: AppId;

    beforeEach(async () => {
      const app: AppManifest = {
        appId: generateAppId('publisher1', 'TestApp', 0n),
        name: 'Test App',
        version: makeAppVersion('1.0.0'),
        publisherAddress: 'publisher1',
        requiredPermissions: [Permissions.TX_SUBMIT],
        optionalPermissions: [Permissions.ORG_READ],
        entryPoints: [{
          id: 'main',
          name: 'Main',
          type: 'action',
        }],
        registeredAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        stateVersion: 0n,
        isActive: true,
        isVerified: false,
      };
      await registry.registerApp(app);
      appId = app.appId;
    });

    const createTestInstallation = (): AppInstallation => ({
      installationId: generateInstallationId(appId, undefined, 'user1', 0n),
      appId,
      appVersion: makeAppVersion('1.0.0'),
      userAddress: 'user1',
      grantedPermissions: [Permissions.TX_SUBMIT],
      installedAt: BigInt(Date.now()),
      version: 0n,
      isActive: true,
    });

    it('should install an app', async () => {
      const installation = createTestInstallation();
      await registry.installApp(installation);

      const retrieved = await registry.getInstallation(installation.installationId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.appId).toBe(appId);
    });

    it('should reject install for non-existent app', async () => {
      const installation: AppInstallation = {
        ...createTestInstallation(),
        appId: makeAppId('fake'),
      };

      await expect(registry.installApp(installation)).rejects.toThrow(AppNotFoundError);
    });

    it('should reject install without required permissions', async () => {
      const installation: AppInstallation = {
        ...createTestInstallation(),
        grantedPermissions: [], // Missing TX_SUBMIT
      };

      await expect(registry.installApp(installation)).rejects.toThrow('Required permission');
    });

    it('should update installation', async () => {
      const installation = createTestInstallation();
      await registry.installApp(installation);

      await registry.updateInstallation(installation.installationId, {
        grantedPermissions: [Permissions.TX_SUBMIT, Permissions.ORG_READ],
      }, 0n);

      const updated = await registry.getInstallation(installation.installationId);
      expect(updated!.grantedPermissions.length).toBe(2);
    });

    it('should uninstall app', async () => {
      const installation = createTestInstallation();
      await registry.installApp(installation);

      await registry.uninstallApp(installation.installationId);

      const uninstalled = await registry.getInstallation(installation.installationId);
      expect(uninstalled).toBeUndefined();
    });

    it('should list installations', async () => {
      const orgId = makeOrgId('org1');
      const installation1 = createTestInstallation();
      const installation2: AppInstallation = {
        ...createTestInstallation(),
        installationId: generateInstallationId(appId, orgId, undefined, 1n),
        userAddress: undefined,
        orgId,
      };

      await registry.installApp(installation1);
      await registry.installApp(installation2);

      const byUser = await registry.listInstallations(undefined, undefined, 'user1');
      expect(byUser.length).toBe(1);

      const byOrg = await registry.listInstallations(undefined, orgId);
      expect(byOrg.length).toBe(1);

      const byApp = await registry.listInstallations(appId);
      expect(byApp.length).toBe(2);
    });

    it('should check app permission', async () => {
      const installation = createTestInstallation();
      await registry.installApp(installation);

      const hasSubmit = await registry.checkAppPermission(
        installation.installationId,
        Permissions.TX_SUBMIT
      );
      expect(hasSubmit).toBe(true);

      const hasAdmin = await registry.checkAppPermission(
        installation.installationId,
        Permissions.ORG_ADMIN
      );
      expect(hasAdmin).toBe(false);
    });

    it('should not allow install on inactive app', async () => {
      await registry.deactivateApp(appId);

      const installation = createTestInstallation();
      await expect(registry.installApp(installation)).rejects.toThrow('not active');
    });
  });

  describe('ID generation', () => {
    it('should generate deterministic app IDs', () => {
      const id1 = generateAppId('publisher', 'App', 0n);
      const id2 = generateAppId('publisher', 'App', 0n);
      const id3 = generateAppId('publisher', 'App', 1n);

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });

    it('should generate deterministic installation IDs', () => {
      const appId = makeAppId('app1');
      const id1 = generateInstallationId(appId, undefined, 'user1', 0n);
      const id2 = generateInstallationId(appId, undefined, 'user1', 0n);
      const id3 = generateInstallationId(appId, undefined, 'user1', 1n);

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });
  });

  describe('Stats', () => {
    it('should return accurate stats', async () => {
      const app1: AppManifest = {
        appId: generateAppId('publisher1', 'App1', 0n),
        name: 'App 1',
        version: makeAppVersion('1.0.0'),
        publisherAddress: 'publisher1',
        requiredPermissions: [],
        entryPoints: [{ id: 'main', name: 'Main', type: 'action' }],
        registeredAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        stateVersion: 0n,
        isActive: true,
        isVerified: false,
      };

      const app2: AppManifest = {
        ...app1,
        appId: generateAppId('publisher1', 'App2', 1n),
        name: 'App 2',
        isActive: false,
      };

      await registry.registerApp(app1);
      await registry.registerApp(app2);

      const installation: AppInstallation = {
        installationId: generateInstallationId(app1.appId, undefined, 'user1', 0n),
        appId: app1.appId,
        appVersion: app1.version,
        userAddress: 'user1',
        grantedPermissions: [],
        installedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };

      await registry.installApp(installation);

      const stats = registry.stats();
      expect(stats.apps).toBe(2);
      expect(stats.activeApps).toBe(1);
      expect(stats.installations).toBe(1);
    });
  });
});
