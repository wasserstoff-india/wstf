/**
 * Approvals Tests - Policies and approval requests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ApprovalId,
  PolicyId,
  ThresholdPolicy,
  AnyPolicy,
  AllPolicy,
  SequentialPolicy,
  TieredPolicy,
  ApprovalRequest,
  ApprovalSignature,
  makeApprovalId,
  makePolicyId,
  isPolicySatisfied,
  getRequiredSignatureCount,
  canSign,
  calculateActionHash,
} from './approvalsTypes';
import {
  InMemoryApprovalsStore,
  createApprovalsStore,
  generateApprovalId,
  generatePolicyId,
  ApprovalRequestBuilder,
  ApprovalNotFoundError,
  ApprovalConcurrencyError,
  InvalidApprovalStateError,
} from './approvalsStore';
import { makeOrgId, makeRoleId } from './orgTypes';

describe('Approval Types', () => {
  describe('Policy satisfaction', () => {
    const createSignature = (address: string, tier?: number): ApprovalSignature => ({
      address,
      signature: 'sig_' + address,
      signedAt: BigInt(Date.now()),
      tier,
    });

    describe('Threshold policy', () => {
      const policy: ThresholdPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'threshold',
        threshold: 2,
        signers: [
          { type: 'address', address: 'alice' },
          { type: 'address', address: 'bob' },
          { type: 'address', address: 'charlie' },
        ],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      it('should not be satisfied with no signatures', () => {
        const result = isPolicySatisfied(policy, [], new Set(['alice', 'bob', 'charlie']));
        expect(result).toBe(false);
      });

      it('should not be satisfied with insufficient signatures', () => {
        const sigs = [createSignature('alice')];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob', 'charlie']));
        expect(result).toBe(false);
      });

      it('should be satisfied at threshold', () => {
        const sigs = [createSignature('alice'), createSignature('bob')];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob', 'charlie']));
        expect(result).toBe(true);
      });

      it('should be satisfied above threshold', () => {
        const sigs = [createSignature('alice'), createSignature('bob'), createSignature('charlie')];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob', 'charlie']));
        expect(result).toBe(true);
      });

      it('should ignore invalid signers', () => {
        const sigs = [createSignature('alice'), createSignature('stranger')];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob', 'charlie']));
        expect(result).toBe(false);
      });
    });

    describe('Any policy', () => {
      const policy: AnyPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'any',
        signers: [
          { type: 'address', address: 'alice' },
          { type: 'address', address: 'bob' },
        ],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      it('should be satisfied with any valid signature', () => {
        const sigs = [createSignature('alice')];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob']));
        expect(result).toBe(true);
      });
    });

    describe('All policy', () => {
      const policy: AllPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'all',
        signers: [
          { type: 'address', address: 'alice' },
          { type: 'address', address: 'bob' },
        ],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      it('should not be satisfied with partial signatures', () => {
        const sigs = [createSignature('alice')];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob']));
        expect(result).toBe(false);
      });

      it('should be satisfied when all sign', () => {
        const sigs = [createSignature('alice'), createSignature('bob')];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob']));
        expect(result).toBe(true);
      });
    });

    describe('Sequential policy', () => {
      const policy: SequentialPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'sequential',
        signers: [
          { type: 'address', address: 'alice' },
          { type: 'address', address: 'bob' },
        ],
        allowSkip: false,
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      it('should require signatures in order with tier', () => {
        const sigs = [
          createSignature('alice', 0),
          createSignature('bob', 1),
        ];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob']));
        expect(result).toBe(true);
      });

      it('should fail if tiers are missing', () => {
        const sigs = [createSignature('alice', 0)];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob']));
        expect(result).toBe(false);
      });
    });

    describe('Tiered policy', () => {
      const policy: TieredPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'tiered',
        tiers: [
          {
            name: 'Tier 1',
            threshold: 1,
            signers: [{ type: 'address', address: 'alice' }],
          },
          {
            name: 'Tier 2',
            threshold: 2,
            signers: [
              { type: 'address', address: 'bob' },
              { type: 'address', address: 'charlie' },
            ],
          },
        ],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      it('should require all tiers to be satisfied', () => {
        const sigs = [
          createSignature('alice', 0),
          createSignature('bob', 1),
          createSignature('charlie', 1),
        ];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob', 'charlie']));
        expect(result).toBe(true);
      });

      it('should fail if a tier is not satisfied', () => {
        const sigs = [
          createSignature('alice', 0),
          createSignature('bob', 1), // Only 1 in tier 2, need 2
        ];
        const result = isPolicySatisfied(policy, sigs, new Set(['alice', 'bob', 'charlie']));
        expect(result).toBe(false);
      });
    });
  });

  describe('getRequiredSignatureCount', () => {
    it('should return threshold for threshold policy', () => {
      const policy: ThresholdPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'threshold',
        threshold: 3,
        signers: [
          { type: 'address', address: 'alice' },
          { type: 'address', address: 'bob' },
          { type: 'address', address: 'charlie' },
        ],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };
      expect(getRequiredSignatureCount(policy)).toBe(3);
    });

    it('should return 1 for any policy', () => {
      const policy: AnyPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'any',
        signers: [{ type: 'address', address: 'alice' }],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };
      expect(getRequiredSignatureCount(policy)).toBe(1);
    });
  });

  describe('canSign', () => {
    it('should allow address signers', () => {
      const policy: ThresholdPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'threshold',
        threshold: 1,
        signers: [{ type: 'address', address: 'alice' }],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      expect(canSign(policy, 'alice', new Set())).toBe(true);
      expect(canSign(policy, 'bob', new Set())).toBe(false);
    });

    it('should allow role signers with matching role', () => {
      const roleId = makeRoleId('admin');
      const policy: ThresholdPolicy = {
        policyId: makePolicyId('pol1'),
        orgId: makeOrgId('org1'),
        name: 'Test',
        type: 'threshold',
        threshold: 1,
        signers: [{ type: 'role', roleId }],
        createdAt: 0n,
        updatedAt: 0n,
        version: 0n,
        isActive: true,
      };

      expect(canSign(policy, 'alice', new Set([roleId]))).toBe(true);
      expect(canSign(policy, 'alice', new Set())).toBe(false);
    });
  });

  describe('calculateActionHash', () => {
    it('should produce deterministic hash', () => {
      const action = { type: 'transfer', data: { amount: 100 } };
      const hash1 = calculateActionHash(action);
      const hash2 = calculateActionHash(action);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different actions', () => {
      const action1 = { type: 'transfer', data: { amount: 100 } };
      const action2 = { type: 'transfer', data: { amount: 200 } };

      expect(calculateActionHash(action1)).not.toBe(calculateActionHash(action2));
    });
  });
});

describe('Approvals Store', () => {
  let store: InMemoryApprovalsStore;
  const orgId = makeOrgId('org1');

  beforeEach(() => {
    store = new InMemoryApprovalsStore();
  });

  describe('Policy operations', () => {
    const createTestPolicy = (): ThresholdPolicy => ({
      policyId: generatePolicyId(orgId, 'Test', 0n),
      orgId,
      name: 'Test Policy',
      type: 'threshold',
      threshold: 2,
      signers: [
        { type: 'address', address: 'alice' },
        { type: 'address', address: 'bob' },
        { type: 'address', address: 'charlie' },
      ],
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      version: 0n,
      isActive: true,
    });

    it('should create a policy', async () => {
      const policy = createTestPolicy();
      await store.createPolicy(policy);

      const retrieved = await store.getPolicy(policy.policyId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Test Policy');
      expect(retrieved!.type).toBe('threshold');
    });

    it('should reject duplicate policy', async () => {
      const policy = createTestPolicy();
      await store.createPolicy(policy);

      await expect(store.createPolicy(policy)).rejects.toThrow('already exists');
    });

    it('should update a policy', async () => {
      const policy = createTestPolicy();
      await store.createPolicy(policy);

      await store.updatePolicy(policy.policyId, { name: 'Updated Policy' }, 0n);

      const updated = await store.getPolicy(policy.policyId);
      expect(updated!.name).toBe('Updated Policy');
      expect(updated!.version).toBe(1n);
    });

    it('should reject update with wrong version', async () => {
      const policy = createTestPolicy();
      await store.createPolicy(policy);

      await expect(
        store.updatePolicy(policy.policyId, { name: 'Updated' }, 99n)
      ).rejects.toThrow(ApprovalConcurrencyError);
    });

    it('should list policies by org', async () => {
      const policy1 = createTestPolicy();
      const policy2: ThresholdPolicy = {
        ...createTestPolicy(),
        policyId: generatePolicyId(orgId, 'Test2', 1n),
        name: 'Test Policy 2',
      };

      await store.createPolicy(policy1);
      await store.createPolicy(policy2);

      const policies = await store.listPolicies(orgId);
      expect(policies.length).toBe(2);
    });

    it('should delete policy without pending approvals', async () => {
      const policy = createTestPolicy();
      await store.createPolicy(policy);

      await store.deletePolicy(policy.policyId);

      const deleted = await store.getPolicy(policy.policyId);
      expect(deleted).toBeUndefined();
    });
  });

  describe('Approval request operations', () => {
    let policyId: PolicyId;

    beforeEach(async () => {
      const policy: ThresholdPolicy = {
        policyId: generatePolicyId(orgId, 'Test', 0n),
        orgId,
        name: 'Test Policy',
        type: 'threshold',
        threshold: 2,
        signers: [
          { type: 'address', address: 'alice' },
          { type: 'address', address: 'bob' },
        ],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };
      await store.createPolicy(policy);
      policyId = policy.policyId;
    });

    const createTestApproval = (): ApprovalRequest => ({
      approvalId: generateApprovalId(orgId, 'requestor', 'hash123', 0n),
      orgId,
      policyId,
      status: 'pending',
      requestor: 'requestor',
      action: {
        type: 'transfer',
        data: { amount: 100 },
        actionHash: 'hash123',
      },
      signatures: [],
      rejections: [],
      createdAt: BigInt(Date.now()),
      expiresAt: BigInt(Date.now() + 7 * 24 * 60 * 60 * 1000),
      updatedAt: BigInt(Date.now()),
      version: 0n,
    });

    it('should create an approval request', async () => {
      const approval = createTestApproval();
      await store.createApproval(approval);

      const retrieved = await store.getApproval(approval.approvalId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('pending');
    });

    it('should reject approval for non-existent policy', async () => {
      const approval: ApprovalRequest = {
        ...createTestApproval(),
        policyId: makePolicyId('fake'),
      };

      await expect(store.createApproval(approval)).rejects.toThrow(ApprovalNotFoundError);
    });

    it('should add signature to approval', async () => {
      const approval = createTestApproval();
      await store.createApproval(approval);

      const updated = await store.addSignature(approval.approvalId, {
        address: 'alice',
        signature: 'sig_alice',
        signedAt: BigInt(Date.now()),
      });

      expect(updated.signatures.length).toBe(1);
      expect(updated.status).toBe('pending'); // Still need 2
    });

    it('should auto-approve when threshold reached', async () => {
      const approval = createTestApproval();
      await store.createApproval(approval);

      await store.addSignature(approval.approvalId, {
        address: 'alice',
        signature: 'sig_alice',
        signedAt: BigInt(Date.now()),
      });

      const final = await store.addSignature(approval.approvalId, {
        address: 'bob',
        signature: 'sig_bob',
        signedAt: BigInt(Date.now()),
      });

      expect(final.signatures.length).toBe(2);
      expect(final.status).toBe('approved');
    });

    it('should reject duplicate signature', async () => {
      const approval = createTestApproval();
      await store.createApproval(approval);

      await store.addSignature(approval.approvalId, {
        address: 'alice',
        signature: 'sig_alice',
        signedAt: BigInt(Date.now()),
      });

      await expect(
        store.addSignature(approval.approvalId, {
          address: 'alice',
          signature: 'sig_alice2',
          signedAt: BigInt(Date.now()),
        })
      ).rejects.toThrow('already signed');
    });

    it('should add rejection and update status', async () => {
      const approval = createTestApproval();
      await store.createApproval(approval);

      const rejected = await store.addRejection(approval.approvalId, {
        address: 'alice',
        rejectedAt: BigInt(Date.now()),
        reason: 'Invalid amount',
      });

      expect(rejected.status).toBe('rejected');
      expect(rejected.rejections.length).toBe(1);
    });

    it('should not allow signature on rejected approval', async () => {
      const approval = createTestApproval();
      await store.createApproval(approval);

      await store.addRejection(approval.approvalId, {
        address: 'alice',
        rejectedAt: BigInt(Date.now()),
        reason: 'Invalid',
      });

      await expect(
        store.addSignature(approval.approvalId, {
          address: 'bob',
          signature: 'sig_bob',
          signedAt: BigInt(Date.now()),
        })
      ).rejects.toThrow(InvalidApprovalStateError);
    });

    it('should update approval status', async () => {
      const approval = createTestApproval();
      await store.createApproval(approval);

      // First get it approved
      await store.addSignature(approval.approvalId, {
        address: 'alice',
        signature: 'sig_alice',
        signedAt: BigInt(Date.now()),
      });
      await store.addSignature(approval.approvalId, {
        address: 'bob',
        signature: 'sig_bob',
        signedAt: BigInt(Date.now()),
      });

      // Then execute
      await store.updateStatus(approval.approvalId, 'executed', {
        success: true,
        executedAt: BigInt(Date.now()),
        executor: 'executor',
      });

      const executed = await store.getApproval(approval.approvalId);
      expect(executed!.status).toBe('executed');
      expect(executed!.executionResult!.success).toBe(true);
    });

    it('should reject invalid status transition', async () => {
      const approval = createTestApproval();
      await store.createApproval(approval);

      // Cannot go from pending directly to executed
      await expect(
        store.updateStatus(approval.approvalId, 'executed')
      ).rejects.toThrow(InvalidApprovalStateError);
    });

    it('should expire pending approvals', async () => {
      const approval: ApprovalRequest = {
        ...createTestApproval(),
        expiresAt: BigInt(Date.now() - 1000), // Already expired
      };
      await store.createApproval(approval);

      const expired = await store.expirePending(BigInt(Date.now()));

      expect(expired.length).toBe(1);
      expect(expired[0]).toBe(approval.approvalId);

      const updated = await store.getApproval(approval.approvalId);
      expect(updated!.status).toBe('expired');
    });

    it('should list approvals with filters', async () => {
      const approval1 = createTestApproval();
      const approval2: ApprovalRequest = {
        ...createTestApproval(),
        approvalId: generateApprovalId(orgId, 'other', 'hash456', 1n),
        requestor: 'other',
      };

      await store.createApproval(approval1);
      await store.createApproval(approval2);

      const byRequestor = await store.listApprovals(orgId, { requestor: 'requestor' });
      expect(byRequestor.length).toBe(1);

      const pending = await store.listApprovals(orgId, { status: 'pending' });
      expect(pending.length).toBe(2);
    });
  });

  describe('ApprovalRequestBuilder', () => {
    let policyId: PolicyId;

    beforeEach(async () => {
      const policy: ThresholdPolicy = {
        policyId: generatePolicyId(orgId, 'Test', 0n),
        orgId,
        name: 'Test',
        type: 'threshold',
        threshold: 1,
        signers: [{ type: 'address', address: 'alice' }],
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        version: 0n,
        isActive: true,
      };
      await store.createPolicy(policy);
      policyId = policy.policyId;
    });

    it('should build approval request', () => {
      const builder = new ApprovalRequestBuilder(orgId, policyId, 'requestor');

      const approval = builder
        .action({
          type: 'transfer',
          data: { amount: 100 },
          actionHash: calculateActionHash({ type: 'transfer', data: { amount: 100 } }),
        })
        .memo('Test approval')
        .expiresIn(BigInt(3600000))
        .build(0n);

      expect(approval.approvalId).toBeDefined();
      expect(approval.status).toBe('pending');
      expect(approval.memo).toBe('Test approval');
    });

    it('should throw if action missing', () => {
      const builder = new ApprovalRequestBuilder(orgId, policyId, 'requestor');

      expect(() => builder.build(0n)).toThrow('Action is required');
    });
  });

  describe('ID generation', () => {
    it('should generate deterministic policy IDs', () => {
      const id1 = generatePolicyId(orgId, 'Test', 0n);
      const id2 = generatePolicyId(orgId, 'Test', 0n);
      const id3 = generatePolicyId(orgId, 'Test', 1n);

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });

    it('should generate deterministic approval IDs', () => {
      const id1 = generateApprovalId(orgId, 'requestor', 'hash', 0n);
      const id2 = generateApprovalId(orgId, 'requestor', 'hash', 0n);
      const id3 = generateApprovalId(orgId, 'requestor', 'hash', 1n);

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });
  });
});
