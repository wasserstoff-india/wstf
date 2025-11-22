/**
 * Program Catalog RPC Tests
 *
 * Tests for program catalog querying and indexing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProgramCatalogRPC,
  createProgramCatalogRPC,
} from './programs';
import {
  ProgramRegistration,
  ProgramMetadata,
  DEFAULT_PROGRAM_POLICY,
} from '../programs/types';
import { ConfirmationTier } from '../trust/types';

describe('Program Catalog RPC', () => {
  let catalog: ProgramCatalogRPC;

  const createTestRegistration = (
    id: string,
    overrides: Partial<{
      name: string;
      owner: string;
      tags: string[];
      status: 'active' | 'paused' | 'deprecated' | 'banned';
      totalCalls: bigint;
    }> = {}
  ): ProgramRegistration => {
    const metadata: ProgramMetadata = {
      id,
      name: overrides.name ?? `Program ${id}`,
      version: '1.0.0',
      description: `Description for ${id}`,
      owner: overrides.owner ?? 'gc1alice',
      tags: overrides.tags ?? ['test'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return {
      metadata,
      policy: DEFAULT_PROGRAM_POLICY,
      status: overrides.status ?? 'active',
      registrationTxId: '0x' + 'aa'.repeat(32),
      registrationBlock: 100n,
      totalCalls: overrides.totalCalls ?? 0n,
      uniqueCallers: 0,
      totalRevenue: 0n,
    };
  };

  beforeEach(() => {
    catalog = createProgramCatalogRPC();
  });

  describe('Indexing', () => {
    it('should index a program', () => {
      catalog.indexProgram(createTestRegistration('test.program/v1'));

      // Verify via get
      catalog.getProgram('test.program/v1').then(result => {
        expect(result.ok).toBe(true);
        expect(result.data?.id).toBe('test.program/v1');
      });
    });

    it('should index multiple programs', async () => {
      catalog.indexProgram(createTestRegistration('prog.one/v1'));
      catalog.indexProgram(createTestRegistration('prog.two/v1'));
      catalog.indexProgram(createTestRegistration('prog.three/v1'));

      const result = await catalog.listPrograms({});
      expect(result.ok).toBe(true);
      expect(result.data?.totalCount).toBe(3);
    });

    it('should remove program from index', async () => {
      catalog.indexProgram(createTestRegistration('to.remove/v1'));

      let result = await catalog.getProgram('to.remove/v1');
      expect(result.ok).toBe(true);

      catalog.removeProgram('to.remove/v1');

      result = await catalog.getProgram('to.remove/v1');
      expect(result.ok).toBe(false);
    });
  });

  describe('getProgram', () => {
    it('should return program details', async () => {
      catalog.indexProgram(createTestRegistration('my.program/v1', {
        name: 'My Program',
        tags: ['api', 'service'],
      }));

      const result = await catalog.getProgram('my.program/v1');
      expect(result.ok).toBe(true);
      expect(result.data?.name).toBe('My Program');
      expect(result.data?.tags).toContain('api');
      expect(result.data?.policy).toBeDefined();
    });

    it('should return error for invalid ID', async () => {
      const result = await catalog.getProgram('invalid');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('INVALID_ID');
    });

    it('should return error for not found', async () => {
      const result = await catalog.getProgram('not.found/v1');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('listPrograms', () => {
    beforeEach(() => {
      catalog.indexProgram(createTestRegistration('alice.prog/v1', { owner: 'gc1alice', tags: ['api'] }));
      catalog.indexProgram(createTestRegistration('alice.prog/v2', { owner: 'gc1alice', tags: ['api', 'v2'] }));
      catalog.indexProgram(createTestRegistration('bob.service/v1', { owner: 'gc1bob', tags: ['service'] }));
      catalog.indexProgram(createTestRegistration('paused.prog/v1', { owner: 'gc1alice', status: 'paused' }));
    });

    it('should list all programs', async () => {
      const result = await catalog.listPrograms({});
      expect(result.ok).toBe(true);
      expect(result.data?.totalCount).toBe(4);
    });

    it('should filter by owner', async () => {
      const result = await catalog.listPrograms({ owner: 'gc1alice' });
      expect(result.ok).toBe(true);
      expect(result.data?.totalCount).toBe(3);
    });

    it('should filter by status', async () => {
      const result = await catalog.listPrograms({ status: 'active' });
      expect(result.ok).toBe(true);
      expect(result.data?.totalCount).toBe(3);

      const pausedResult = await catalog.listPrograms({ status: 'paused' });
      expect(pausedResult.data?.totalCount).toBe(1);
    });

    it('should filter by tags', async () => {
      const result = await catalog.listPrograms({ tags: ['api'] });
      expect(result.ok).toBe(true);
      expect(result.data?.totalCount).toBe(2);
    });

    it('should filter by search', async () => {
      const result = await catalog.listPrograms({ search: 'alice' });
      expect(result.ok).toBe(true);
      // Search matches on ID, name, description - not owner
      // alice.prog/v1 and alice.prog/v2 match on ID
      expect(result.data?.totalCount).toBe(2);
    });

    it('should apply pagination', async () => {
      const result = await catalog.listPrograms({ limit: 2, offset: 0 });
      expect(result.ok).toBe(true);
      expect(result.data?.programs.length).toBe(2);
      expect(result.data?.hasMore).toBe(true);

      const page2 = await catalog.listPrograms({ limit: 2, offset: 2 });
      expect(page2.data?.programs.length).toBe(2);
      expect(page2.data?.hasMore).toBe(false);
    });

    it('should sort by name', async () => {
      const result = await catalog.listPrograms({ sortBy: 'name', sortDir: 'asc' });
      expect(result.ok).toBe(true);
      const names = result.data?.programs.map(p => p.name);
      const sorted = [...names!].sort();
      expect(names).toEqual(sorted);
    });
  });

  describe('Convenience methods', () => {
    beforeEach(() => {
      catalog.indexProgram(createTestRegistration('alice.one/v1', { owner: 'gc1alice', tags: ['api'] }));
      catalog.indexProgram(createTestRegistration('alice.two/v1', { owner: 'gc1alice', tags: ['web'] }));
      catalog.indexProgram(createTestRegistration('bob.one/v1', { owner: 'gc1bob', tags: ['api'] }));
    });

    it('should get programs by owner', async () => {
      const result = await catalog.getProgramsByOwner('gc1alice');
      expect(result.ok).toBe(true);
      expect(result.data?.totalCount).toBe(2);
    });

    it('should get programs by tag', async () => {
      const result = await catalog.getProgramsByTag('api');
      expect(result.ok).toBe(true);
      expect(result.data?.totalCount).toBe(2);
    });

    it('should search programs', async () => {
      const result = await catalog.searchPrograms('alice');
      expect(result.ok).toBe(true);
      expect(result.data?.totalCount).toBe(2);
    });
  });

  describe('checkAccess', () => {
    beforeEach(() => {
      // Active program with default policy
      catalog.indexProgram(createTestRegistration('open.program/v1'));

      // Program with allowlist
      const allowlistReg = createTestRegistration('restricted.program/v1');
      allowlistReg.policy = {
        ...DEFAULT_PROGRAM_POLICY,
        access: {
          minTrustTier: ConfirmationTier.INCLUDED,
          allowAll: false,
          allowlist: ['gc1allowed'],
        },
      };
      catalog.indexProgram(allowlistReg);

      // Paused program
      catalog.indexProgram(createTestRegistration('paused.program/v1', { status: 'paused' }));

      // Program with high trust requirement
      const highTrustReg = createTestRegistration('high.trust/v1');
      highTrustReg.policy = {
        ...DEFAULT_PROGRAM_POLICY,
        access: {
          minTrustTier: ConfirmationTier.K_DEPTH,
          allowAll: true,
        },
      };
      catalog.indexProgram(highTrustReg);
    });

    it('should allow access to open program', async () => {
      const result = await catalog.checkAccess('open.program/v1', 'gc1anyone', ConfirmationTier.INCLUDED);
      expect(result.ok).toBe(true);
      expect(result.data?.allowed).toBe(true);
    });

    it('should deny access to not found program', async () => {
      const result = await catalog.checkAccess('not.found/v1', 'gc1anyone', ConfirmationTier.INCLUDED);
      expect(result.ok).toBe(true);
      expect(result.data?.allowed).toBe(false);
      expect(result.data?.reason).toContain('not found');
    });

    it('should deny access to paused program', async () => {
      const result = await catalog.checkAccess('paused.program/v1', 'gc1anyone', ConfirmationTier.INCLUDED);
      expect(result.ok).toBe(true);
      expect(result.data?.allowed).toBe(false);
      expect(result.data?.reason).toContain('paused');
    });

    it('should check allowlist', async () => {
      const allowedResult = await catalog.checkAccess('restricted.program/v1', 'gc1allowed', ConfirmationTier.INCLUDED);
      expect(allowedResult.data?.allowed).toBe(true);

      const deniedResult = await catalog.checkAccess('restricted.program/v1', 'gc1notallowed', ConfirmationTier.INCLUDED);
      expect(deniedResult.data?.allowed).toBe(false);
    });

    it('should check trust tier', async () => {
      const lowTierResult = await catalog.checkAccess('high.trust/v1', 'gc1anyone', ConfirmationTier.INCLUDED);
      expect(lowTierResult.data?.allowed).toBe(false);
      expect(lowTierResult.data?.reason).toContain('trust tier');

      const highTierResult = await catalog.checkAccess('high.trust/v1', 'gc1anyone', ConfirmationTier.K_DEPTH);
      expect(highTierResult.data?.allowed).toBe(true);
    });
  });

  describe('Stats', () => {
    beforeEach(() => {
      catalog.indexProgram(createTestRegistration('prog.one/v1', { totalCalls: 100n }));
      catalog.indexProgram(createTestRegistration('prog.two/v1', { totalCalls: 200n, status: 'paused' }));
      catalog.indexProgram(createTestRegistration('prog.three/v1', { tags: ['api', 'service'] }));
    });

    it('should get program stats', async () => {
      const result = await catalog.getProgramStats('prog.one/v1');
      expect(result.ok).toBe(true);
      expect(result.data?.totalCalls).toBe('100');
    });

    it('should return error for not found stats', async () => {
      const result = await catalog.getProgramStats('not.found/v1');
      expect(result.ok).toBe(false);
    });

    it('should get catalog stats', async () => {
      const result = await catalog.getCatalogStats();
      expect(result.ok).toBe(true);
      expect(result.data?.totalPrograms).toBe(3);
      expect(result.data?.activePrograms).toBe(2);
      expect(result.data?.pausedPrograms).toBe(1);
    });

    it('should get tags with counts', async () => {
      const result = await catalog.getTags();
      expect(result.ok).toBe(true);
      expect(result.data?.length).toBeGreaterThan(0);

      const apiTag = result.data?.find(t => t.tag === 'api');
      expect(apiTag?.count).toBe(1);
    });
  });
});
