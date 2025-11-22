/**
 * Programs Module Tests
 *
 * Tests for program types, validation, and policy checking.
 */

import { describe, it, expect } from 'vitest';
import {
  ProgramMetadata,
  ProgramPolicy,
  ProgramRegistration,
  DEFAULT_PROGRAM_POLICY,
  validateProgramId,
  parseProgramId,
  buildProgramId,
  isAddressAllowed,
  meetsTrustRequirement,
} from './types';
import { ConfirmationTier } from '../trust/types';

describe('Program Types', () => {
  describe('Program ID validation', () => {
    it('should accept valid program IDs', () => {
      expect(validateProgramId('my.program/v1').valid).toBe(true);
      expect(validateProgramId('my-service/v2').valid).toBe(true);
      expect(validateProgramId('org.example.service/v10').valid).toBe(true);
      expect(validateProgramId('abc/v0').valid).toBe(true);
    });

    it('should reject empty or invalid input', () => {
      expect(validateProgramId('').valid).toBe(false);
      expect(validateProgramId(null as any).valid).toBe(false);
      expect(validateProgramId(undefined as any).valid).toBe(false);
    });

    it('should reject invalid format', () => {
      expect(validateProgramId('noversion').valid).toBe(false);
      expect(validateProgramId('too/many/parts').valid).toBe(false);
      expect(validateProgramId('/v1').valid).toBe(false);
      expect(validateProgramId('program/').valid).toBe(false);
    });

    it('should reject invalid namespace', () => {
      expect(validateProgramId('a/v1').valid).toBe(false); // Too short
      expect(validateProgramId('ab/v1').valid).toBe(false); // Too short
      expect(validateProgramId('-invalid/v1').valid).toBe(false); // Starts with dash
      expect(validateProgramId('invalid$/v1').valid).toBe(false); // Invalid char
    });

    it('should reject invalid version', () => {
      expect(validateProgramId('program/1').valid).toBe(false); // No v prefix
      expect(validateProgramId('program/version1').valid).toBe(false);
      expect(validateProgramId('program/v').valid).toBe(false);
      expect(validateProgramId('program/v-1').valid).toBe(false);
    });
  });

  describe('Program ID parsing', () => {
    it('should parse valid program IDs', () => {
      const parsed = parseProgramId('my.program/v1');
      expect(parsed).not.toBeNull();
      expect(parsed!.namespace).toBe('my.program');
      expect(parsed!.version).toBe(1);
    });

    it('should handle larger version numbers', () => {
      const parsed = parseProgramId('service/v123');
      expect(parsed).not.toBeNull();
      expect(parsed!.version).toBe(123);
    });

    it('should return null for invalid IDs', () => {
      expect(parseProgramId('invalid')).toBeNull();
      expect(parseProgramId('')).toBeNull();
    });
  });

  describe('Program ID building', () => {
    it('should build program IDs', () => {
      expect(buildProgramId('my.program', 1)).toBe('my.program/v1');
      expect(buildProgramId('service', 42)).toBe('service/v42');
    });

    it('should round-trip through parse and build', () => {
      const original = 'my.program/v5';
      const parsed = parseProgramId(original)!;
      const rebuilt = buildProgramId(parsed.namespace, parsed.version);
      expect(rebuilt).toBe(original);
    });
  });

  describe('Address allowlist checking', () => {
    it('should allow all when allowAll is true', () => {
      const policy: ProgramPolicy = {
        ...DEFAULT_PROGRAM_POLICY,
        access: {
          minTrustTier: ConfirmationTier.INCLUDED,
          allowAll: true,
        },
      };

      expect(isAddressAllowed('gc1alice', policy)).toBe(true);
      expect(isAddressAllowed('gc1bob', policy)).toBe(true);
      expect(isAddressAllowed('gc1anyone', policy)).toBe(true);
    });

    it('should check allowlist when allowAll is false', () => {
      const policy: ProgramPolicy = {
        ...DEFAULT_PROGRAM_POLICY,
        access: {
          minTrustTier: ConfirmationTier.INCLUDED,
          allowAll: false,
          allowlist: ['gc1alice', 'gc1bob'],
        },
      };

      expect(isAddressAllowed('gc1alice', policy)).toBe(true);
      expect(isAddressAllowed('gc1bob', policy)).toBe(true);
      expect(isAddressAllowed('gc1charlie', policy)).toBe(false);
    });

    it('should check blocklist first', () => {
      const policy: ProgramPolicy = {
        ...DEFAULT_PROGRAM_POLICY,
        access: {
          minTrustTier: ConfirmationTier.INCLUDED,
          allowAll: true,
          blocklist: ['gc1blocked'],
        },
      };

      expect(isAddressAllowed('gc1alice', policy)).toBe(true);
      expect(isAddressAllowed('gc1blocked', policy)).toBe(false);
    });

    it('should prioritize blocklist over allowlist', () => {
      const policy: ProgramPolicy = {
        ...DEFAULT_PROGRAM_POLICY,
        access: {
          minTrustTier: ConfirmationTier.INCLUDED,
          allowAll: false,
          allowlist: ['gc1alice'],
          blocklist: ['gc1alice'], // Same address in both
        },
      };

      expect(isAddressAllowed('gc1alice', policy)).toBe(false);
    });

    it('should return false when allowAll is false and no allowlist', () => {
      const policy: ProgramPolicy = {
        ...DEFAULT_PROGRAM_POLICY,
        access: {
          minTrustTier: ConfirmationTier.INCLUDED,
          allowAll: false,
        },
      };

      expect(isAddressAllowed('gc1alice', policy)).toBe(false);
    });
  });

  describe('Trust tier requirements', () => {
    it('should accept equal or higher tiers', () => {
      expect(meetsTrustRequirement(ConfirmationTier.INCLUDED, ConfirmationTier.INCLUDED)).toBe(true);
      expect(meetsTrustRequirement(ConfirmationTier.K_DEPTH, ConfirmationTier.INCLUDED)).toBe(true);
      expect(meetsTrustRequirement(ConfirmationTier.CROSS_CHAIN, ConfirmationTier.INCLUDED)).toBe(true);
    });

    it('should reject lower tiers', () => {
      expect(meetsTrustRequirement(ConfirmationTier.PREFLIGHT, ConfirmationTier.INCLUDED)).toBe(false);
      expect(meetsTrustRequirement(ConfirmationTier.ADMITTED, ConfirmationTier.K_DEPTH)).toBe(false);
    });

    it('should handle all tier combinations', () => {
      // PREFLIGHT is lowest
      expect(meetsTrustRequirement(ConfirmationTier.PREFLIGHT, ConfirmationTier.PREFLIGHT)).toBe(true);
      expect(meetsTrustRequirement(ConfirmationTier.PREFLIGHT, ConfirmationTier.ADMITTED)).toBe(false);

      // CROSS_CHAIN is highest
      expect(meetsTrustRequirement(ConfirmationTier.CROSS_CHAIN, ConfirmationTier.CROSS_CHAIN)).toBe(true);
      expect(meetsTrustRequirement(ConfirmationTier.K_DEPTH, ConfirmationTier.CROSS_CHAIN)).toBe(false);
    });
  });

  describe('Default program policy', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_PROGRAM_POLICY.access.allowAll).toBe(true);
      expect(DEFAULT_PROGRAM_POLICY.access.minTrustTier).toBe(ConfirmationTier.INCLUDED);
      expect(DEFAULT_PROGRAM_POLICY.rateLimit.maxCallsPerHourPerCaller).toBe(100);
      expect(DEFAULT_PROGRAM_POLICY.rateLimit.maxCallsPerHourTotal).toBe(10000);
      expect(DEFAULT_PROGRAM_POLICY.constraints.maxPayloadBytes).toBe(4096);
      expect(DEFAULT_PROGRAM_POLICY.constraints.maxResponseBytes).toBe(16384);
      expect(DEFAULT_PROGRAM_POLICY.constraints.maxExecutionMs).toBe(30000);
    });
  });

  describe('Program registration structure', () => {
    it('should accept valid registration', () => {
      const metadata: ProgramMetadata = {
        id: 'test.program/v1',
        name: 'Test Program',
        version: '1.0.0',
        description: 'A test program',
        owner: 'gc1alice',
        tags: ['test', 'example'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const registration: ProgramRegistration = {
        metadata,
        policy: DEFAULT_PROGRAM_POLICY,
        status: 'active',
        registrationTxId: '0x' + 'aa'.repeat(32),
        registrationBlock: 100n,
        totalCalls: 0n,
        uniqueCallers: 0,
        totalRevenue: 0n,
      };

      expect(registration.metadata.id).toBe('test.program/v1');
      expect(registration.status).toBe('active');
    });
  });
});
