/**
 * Auth Gate Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  createAuthGate,
  TrustTier,
  CallerContext,
  GatePolicy,
  requirePermission,
  requireOrgPermission,
  requireScopes,
  requireTrustTier,
  requireApproval,
  combinePolicies,
  createRouteMap,
  getRoutePolicy,
} from './gate';
import { ConnectorOptions, createMockKeyResolver } from './connector';
import { InMemoryOrgStore, generateOrgId, generateRoleId } from '../../accounts/orgStore';
import { InMemoryApprovalsStore, generatePolicyId, generateApprovalId } from '../../accounts/approvalsStore';
import { makeOrgId, makeRoleId, makePermission, Permissions, OrgRegistration, OrgRole } from '../../accounts/orgTypes';
import { makeApprovalId, makePolicyId, ThresholdPolicy, ApprovalRequest, calculateActionHash } from '../../accounts/approvalsTypes';
import { signToken } from '../../auth/wstf';
import { SigAlgId, MappingAlgId } from '../../crypto/algorithms';
import { generateKeypair, exportPubDER } from '../../crypto/keys';
import { deriveAddress } from '../../crypto/address';

describe('Auth Gate', () => {
  let orgStore: InMemoryOrgStore;
  let approvalsStore: InMemoryApprovalsStore;
  let testKeypair: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject };
  let testAddress: string;
  let keyResolver: (address: string) => Promise<crypto.KeyObject | null>;
  let connectorOptions: ConnectorOptions;

  beforeEach(async () => {
    orgStore = new InMemoryOrgStore();
    approvalsStore = new InMemoryApprovalsStore();

    // Generate test keypair
    testKeypair = generateKeypair(SigAlgId.ED25519);
    const pubDER = exportPubDER(testKeypair.publicKey);
    testAddress = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    // Create key resolver
    const keys = new Map<string, crypto.KeyObject>();
    keys.set(testAddress, testKeypair.publicKey);
    keyResolver = createMockKeyResolver(keys);

    connectorOptions = {
      programId: 'test-service',
      resolvePublicKey: keyResolver,
      requireWSTFAuth: true,
    };
  });

  const createToken = (payload: Partial<{ sub: string; aud: string; scope?: string }> = {}) => {
    return signToken(testKeypair.privateKey, SigAlgId.ED25519, {
      sub: payload.sub ?? testAddress,
      aud: payload.aud ?? 'test-service',
      ...payload,
    });
  };

  describe('Basic Authentication', () => {
    it('should reject requests without auth header', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const result = await gate.gate({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(401);
        expect(result.code).toBe('NO_TOKEN');
      }
    });

    it('should accept valid WSTF token', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const result = await gate.gate({
        authorization: `WSTF ${token}`,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.addr).toBe(testAddress);
        expect(result.context.trustTier).toBe(TrustTier.AUTHENTICATED);
      }
    });

    it('should accept valid Bearer token', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const result = await gate.gate({
        authorization: `Bearer ${token}`,
      });

      expect(result.success).toBe(true);
    });

    it('should reject expired token', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(testKeypair.privateKey, SigAlgId.ED25519, {
        sub: testAddress,
        aud: 'test-service',
        iat: now - 3600,
        exp: now - 60, // Expired 1 minute ago
      });

      const result = await gate.gate({
        authorization: `WSTF ${token}`,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('EXPIRED');
      }
    });

    it('should reject wrong audience', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken({ aud: 'wrong-service' });

      const result = await gate.gate({
        authorization: `WSTF ${token}`,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('WRONG_AUDIENCE');
      }
    });
  });

  describe('Trust Tier Checks', () => {
    it('should default to AUTHENTICATED tier', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        { minTrustTier: TrustTier.AUTHENTICATED }
      );

      expect(result.success).toBe(true);
    });

    it('should reject insufficient trust tier', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        { minTrustTier: TrustTier.VERIFIED }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('INSUFFICIENT_TRUST_TIER');
      }
    });

    it('should accept custom trust tier resolver', async () => {
      const gate = createAuthGate({
        connectorOptions,
        orgStore,
        resolveTrustTier: async (addr) => {
          return addr === testAddress ? TrustTier.TRUSTED : TrustTier.AUTHENTICATED;
        },
      });
      const token = createToken();

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        { minTrustTier: TrustTier.TRUSTED }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.trustTier).toBe(TrustTier.TRUSTED);
      }
    });
  });

  describe('Scope Checks', () => {
    it('should extract scopes from token', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = signToken(testKeypair.privateKey, SigAlgId.ED25519, {
        sub: testAddress,
        aud: 'test-service',
        scope: 'read write admin',
      });

      const result = await gate.gate({ authorization: `WSTF ${token}` });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.scopes).toEqual(['read', 'write', 'admin']);
      }
    });

    it('should reject missing required scopes', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = signToken(testKeypair.privateKey, SigAlgId.ED25519, {
        sub: testAddress,
        aud: 'test-service',
        scope: 'read',
      });

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        { requiredScopes: ['read', 'write'] }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('MISSING_SCOPES');
        expect(result.error).toContain('write');
      }
    });

    it('should accept when all required scopes present', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = signToken(testKeypair.privateKey, SigAlgId.ED25519, {
        sub: testAddress,
        aud: 'test-service',
        scope: 'read write admin',
      });

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        { requiredScopes: ['read', 'write'] }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Permission Checks', () => {
    let orgId: string;

    beforeEach(async () => {
      // Create an org with the test user as owner
      orgId = generateOrgId(testAddress, 'TestOrg', 0n);
      const now = BigInt(Date.now());
      const org: OrgRegistration = {
        orgId: makeOrgId(orgId),
        name: 'Test Organization',
        ownerAddress: testAddress,
        createdAt: now,
        updatedAt: now,
        isActive: true,
        version: 0n,
      };
      await orgStore.createOrg(org);

      // Create a role with permissions
      const roleId = generateRoleId(makeOrgId(orgId), 'admin', 0n);
      const role: OrgRole = {
        roleId: makeRoleId(roleId),
        orgId: makeOrgId(orgId),
        name: 'Admin',
        permissions: [Permissions.TX_SUBMIT, Permissions.ORG_READ],
        inheritsFrom: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        isActive: true,
        version: 0n,
      };
      await orgStore.createRole(role);
    });

    it('should accept owner with any permission', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        { requiredPermission: Permissions.TX_SUBMIT }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.orgs.length).toBeGreaterThan(0);
      }
    });

    it('should reject missing permission', async () => {
      // Create a different user
      const otherKeypair = generateKeypair(SigAlgId.ED25519);
      const otherPubDER = exportPubDER(otherKeypair.publicKey);
      const otherAddress = deriveAddress(otherPubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      const keys = new Map<string, crypto.KeyObject>();
      keys.set(otherAddress, otherKeypair.publicKey);
      const otherResolver = createMockKeyResolver(keys);

      const gate = createAuthGate({
        connectorOptions: { ...connectorOptions, resolvePublicKey: otherResolver },
        orgStore,
      });
      const token = signToken(otherKeypair.privateKey, SigAlgId.ED25519, {
        sub: otherAddress,
        aud: 'test-service',
      });

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        { requiredPermission: Permissions.TX_SUBMIT }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('MISSING_PERMISSION');
      }
    });

    it('should check org-specific permission', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        {
          requiredOrgPermission: {
            orgId: makeOrgId(orgId),
            permission: Permissions.TX_SUBMIT,
          },
        }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Approval Checks', () => {
    let orgId: string;
    let policyId: string;
    let approvalId: string;

    beforeEach(async () => {
      orgId = generateOrgId(testAddress, 'TestOrg', 0n);
      const org: OrgRegistration = {
        orgId: makeOrgId(orgId),
        name: 'Test Organization',
        ownerAddress: testAddress,
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        isActive: true,
        version: 0n,
      };
      await orgStore.createOrg(org);

      // Create approval policy
      policyId = generatePolicyId(makeOrgId(orgId), 'transfers', 0n);
      const policy: ThresholdPolicy = {
        policyId: makePolicyId(policyId),
        orgId: makeOrgId(orgId),
        type: 'threshold',
        name: 'Transfer Policy',
        signers: [{ type: 'address', address: testAddress }],
        threshold: 1,
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        isActive: true,
        version: 0n,
      };
      await approvalsStore.createPolicy(policy);

      // Create approved approval
      const action = {
        type: 'transfer',
        actionHash: '',
        params: { amount: 100 },
        data: {},
      };
      action.actionHash = calculateActionHash(action);

      approvalId = generateApprovalId(makeOrgId(orgId), testAddress, action.actionHash, 0n);
      const approval: ApprovalRequest = {
        approvalId: makeApprovalId(approvalId),
        orgId: makeOrgId(orgId),
        policyId: makePolicyId(policyId),
        requestor: testAddress,
        action,
        status: 'approved',
        signatures: [{ address: testAddress, signature: 'sig', signedAt: BigInt(Date.now()) }],
        rejections: [],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        expiresAt: BigInt(Date.now() + 3600000), // 1 hour from now
        version: 0n,
      };
      await approvalsStore.createApproval(approval);
    });

    it('should reject when approval required but not provided', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore, approvalsStore });
      const token = createToken();

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        {
          requireApproval: {
            policyId,
            getApprovalId: (headers) => headers['x-wstf-approval-id'],
          },
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('APPROVAL_REQUIRED');
      }
    });

    it('should accept when valid approval provided', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore, approvalsStore });
      const token = createToken();

      const result = await gate.gate(
        {
          authorization: `WSTF ${token}`,
          'x-wstf-approval-id': approvalId,
        },
        {
          requireApproval: {
            policyId,
            getApprovalId: (headers) => headers['x-wstf-approval-id'],
          },
        }
      );

      expect(result.success).toBe(true);
    });

    it('should reject expired approval', async () => {
      // Create expired approval
      const action = {
        type: 'transfer2',
        actionHash: '',
        params: { amount: 200 },
        data: {},
      };
      action.actionHash = calculateActionHash(action);

      const expiredId = generateApprovalId(makeOrgId(orgId), testAddress, action.actionHash, 1n);
      const expired: ApprovalRequest = {
        approvalId: makeApprovalId(expiredId),
        orgId: makeOrgId(orgId),
        policyId: makePolicyId(policyId),
        requestor: testAddress,
        action,
        status: 'approved',
        signatures: [{ address: testAddress, signature: 'sig', signedAt: BigInt(Date.now()) }],
        rejections: [],
        createdAt: BigInt(Date.now() - 7200000),
        updatedAt: BigInt(Date.now() - 7200000),
        expiresAt: BigInt(Date.now() - 3600000), // Expired 1 hour ago
        version: 0n,
      };
      await approvalsStore.createApproval(expired);

      const gate = createAuthGate({ connectorOptions, orgStore, approvalsStore });
      const token = createToken();

      const result = await gate.gate(
        {
          authorization: `WSTF ${token}`,
          'x-wstf-approval-id': expiredId,
        },
        {
          requireApproval: {
            policyId,
            getApprovalId: (headers) => headers['x-wstf-approval-id'],
          },
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('APPROVAL_EXPIRED');
      }
    });
  });

  describe('Custom Checks', () => {
    it('should run custom authorization check', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        {
          customCheck: async (ctx) => {
            if (ctx.addr !== testAddress) {
              return { authorized: false, error: 'Wrong address', code: 'WRONG_ADDR' };
            }
            return { authorized: true };
          },
        }
      );

      expect(result.success).toBe(true);
    });

    it('should reject on custom check failure', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const result = await gate.gate(
        { authorization: `WSTF ${token}` },
        {
          customCheck: async () => {
            return { authorized: false, error: 'Custom denied', code: 'CUSTOM_DENIED' };
          },
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('CUSTOM_DENIED');
      }
    });
  });

  describe('Handler Wrapper', () => {
    it('should wrap handler with auth gate', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const handler = gate.authGate(async (ctx) => {
        return { address: ctx.addr };
      });

      const response = await handler({
        headers: { authorization: `WSTF ${token}` },
      });

      expect(response.status).toBe(200);
      expect((response.body as any).success).toBe(true);
      expect((response.body as any).data.address).toBe(testAddress);
    });

    it('should return error response on auth failure', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });

      const handler = gate.authGate(async () => {
        return { message: 'hello' };
      });

      const response = await handler({
        headers: {},
      });

      expect(response.status).toBe(401);
      expect((response.body as any).success).toBe(false);
    });

    it('should catch handler errors', async () => {
      const gate = createAuthGate({ connectorOptions, orgStore });
      const token = createToken();

      const handler = gate.authGate(async () => {
        throw new Error('Handler error');
      });

      const response = await handler({
        headers: { authorization: `WSTF ${token}` },
      });

      expect(response.status).toBe(500);
      expect((response.body as any).success).toBe(false);
      expect((response.body as any).error).toBe('Handler error');
    });
  });

  describe('Policy Builders', () => {
    it('should create permission policy', () => {
      const policy = requirePermission(Permissions.TX_SUBMIT);
      expect(policy.requiredPermission).toBe(Permissions.TX_SUBMIT);
    });

    it('should create org permission policy', () => {
      const orgId = makeOrgId('org123');
      const policy = requireOrgPermission(orgId, Permissions.ORG_READ);
      expect(policy.requiredOrgPermission?.orgId).toBe(orgId);
      expect(policy.requiredOrgPermission?.permission).toBe(Permissions.ORG_READ);
    });

    it('should create scopes policy', () => {
      const policy = requireScopes('read', 'write');
      expect(policy.requiredScopes).toEqual(['read', 'write']);
    });

    it('should create trust tier policy', () => {
      const policy = requireTrustTier(TrustTier.VERIFIED);
      expect(policy.minTrustTier).toBe(TrustTier.VERIFIED);
    });

    it('should create approval policy', () => {
      const policy = requireApproval('pol123', 'x-approval');
      expect(policy.requireApproval?.policyId).toBe('pol123');
    });

    it('should combine policies', () => {
      const combined = combinePolicies(
        requireTrustTier(TrustTier.VERIFIED),
        requireScopes('read', 'write'),
        requirePermission(Permissions.TX_SUBMIT)
      );

      expect(combined.minTrustTier).toBe(TrustTier.VERIFIED);
      expect(combined.requiredScopes).toEqual(['read', 'write']);
      expect(combined.requiredPermission).toBe(Permissions.TX_SUBMIT);
    });
  });

  describe('Route Map', () => {
    it('should create and query route map', () => {
      const routeMap = createRouteMap([
        { method: 'GET', path: '/users', policy: {} },
        { method: 'POST', path: '/users', policy: requirePermission(Permissions.TX_SUBMIT) },
        { method: 'DELETE', path: '/users/:id', policy: requireTrustTier(TrustTier.TRUSTED) },
      ]);

      expect(getRoutePolicy(routeMap, 'GET', '/users')).toBeDefined();
      expect(getRoutePolicy(routeMap, 'POST', '/users')?.requiredPermission).toBe(Permissions.TX_SUBMIT);
      expect(getRoutePolicy(routeMap, 'DELETE', '/users/:id')?.minTrustTier).toBe(TrustTier.TRUSTED);
      expect(getRoutePolicy(routeMap, 'PUT', '/users')).toBeUndefined();
    });
  });
});
