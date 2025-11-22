/**
 * WSTFAuth Token Tests
 *
 * Tests for token signing, verification, and validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  signToken,
  parseToken,
  verifyTokenSignature,
  validateToken,
  generateTokenId,
  isTokenExpired,
  getRemainingTTL,
  base64urlEncode,
  base64urlDecode,
  DEFAULT_TOKEN_TTL_SECONDS,
  MAX_CLOCK_SKEW_SECONDS,
} from './wstf';
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { deriveAddress } from '../crypto/address';
import { SigAlgId, MappingAlgId } from '../crypto/algorithms';

describe('WSTFAuth', () => {
  let keypair: ReturnType<typeof generateKeypair>;
  let address: string;

  beforeEach(() => {
    keypair = generateKeypair(SigAlgId.ED25519);
    const pubDER = exportPubDER(keypair.publicKey);
    address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
  });

  describe('Base64url encoding', () => {
    it('should encode and decode correctly', () => {
      const original = 'Hello, World!';
      const encoded = base64urlEncode(original);
      const decoded = base64urlDecode(encoded).toString();
      expect(decoded).toBe(original);
    });

    it('should handle binary data', () => {
      const original = Buffer.from([0, 255, 128, 64, 32]);
      const encoded = base64urlEncode(original);
      const decoded = base64urlDecode(encoded);
      expect(decoded).toEqual(original);
    });

    it('should produce URL-safe output', () => {
      const data = Buffer.from([0xff, 0xfe, 0xfd]);
      const encoded = base64urlEncode(data);
      expect(encoded).not.toMatch(/[+/=]/);
    });
  });

  describe('Token signing', () => {
    it('should sign a token with Ed25519', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      expect(token).toContain('.');
      const [payloadB64, sigHex] = token.split('.');
      expect(payloadB64.length).toBeGreaterThan(0);
      expect(sigHex.length).toBe(128); // 64 bytes hex
    });

    it('should include default iat and exp', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });
      const after = Math.floor(Date.now() / 1000);

      const parsed = parseToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed!.payload.iat).toBeGreaterThanOrEqual(before);
      expect(parsed!.payload.iat).toBeLessThanOrEqual(after);
      expect(parsed!.payload.exp).toBe(parsed!.payload.iat + DEFAULT_TOKEN_TTL_SECONDS);
    });

    it('should respect custom TTL', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      }, 60); // 60 seconds

      const parsed = parseToken(token);
      expect(parsed!.payload.exp - parsed!.payload.iat).toBe(60);
    });

    it('should include custom claims', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
        customField: 'customValue',
        numericField: 42,
      });

      const parsed = parseToken(token);
      expect(parsed!.payload.customField).toBe('customValue');
      expect(parsed!.payload.numericField).toBe(42);
    });

    it('should include jti when provided', () => {
      const jti = generateTokenId();
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
        jti,
      });

      const parsed = parseToken(token);
      expect(parsed!.payload.jti).toBe(jti);
    });
  });

  describe('Token parsing', () => {
    it('should parse valid token', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      const parsed = parseToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed!.payload.sub).toBe(address);
      expect(parsed!.payload.aud).toBe('test.program/v1');
    });

    it('should return null for invalid format', () => {
      expect(parseToken('')).toBeNull();
      expect(parseToken('invalid')).toBeNull();
      expect(parseToken('a.b.c')).toBeNull();
    });

    it('should return null for invalid base64', () => {
      expect(parseToken('!!!.abc')).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const invalidB64 = base64urlEncode('not json');
      expect(parseToken(`${invalidB64}.abc`)).toBeNull();
    });
  });

  describe('Signature verification', () => {
    it('should verify valid signature', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      const valid = verifyTokenSignature(token, keypair.publicKey, SigAlgId.ED25519);
      expect(valid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      // Tamper with signature
      const [payload, sig] = token.split('.');
      const tamperedSig = sig.replace(/[a-f]/g, '0');
      const tamperedToken = `${payload}.${tamperedSig}`;

      const valid = verifyTokenSignature(tamperedToken, keypair.publicKey, SigAlgId.ED25519);
      expect(valid).toBe(false);
    });

    it('should reject with wrong public key', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      const otherKeypair = generateKeypair(SigAlgId.ED25519);
      const valid = verifyTokenSignature(token, otherKeypair.publicKey, SigAlgId.ED25519);
      expect(valid).toBe(false);
    });

    it('should return false for unparseable token', () => {
      const valid = verifyTokenSignature('invalid', keypair.publicKey, SigAlgId.ED25519);
      expect(valid).toBe(false);
    });
  });

  describe('Token validation', () => {
    it('should validate correct token', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      const result = validateToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test.program/v1'
      );

      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe(address);
    });

    it('should reject expired token', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
        iat: now - 3600,
        exp: now - 1800,
      });

      const result = validateToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test.program/v1'
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('should reject not-yet-valid token', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
        iat: now + 3600, // 1 hour in future
        exp: now + 7200,
      });

      const result = validateToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test.program/v1'
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('NOT_YET_VALID');
    });

    it('should reject wrong audience', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      const result = validateToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'other.program/v1'
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('WRONG_AUDIENCE');
    });

    it('should reject address mismatch', () => {
      // Create token with different address
      const otherKeypair = generateKeypair(SigAlgId.ED25519);
      const otherPubDER = exportPubDER(otherKeypair.publicKey);
      const otherAddress = deriveAddress(otherPubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      // Sign with our key but claim other address
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: otherAddress,
        aud: 'test.program/v1',
      });

      const result = validateToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test.program/v1'
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('ADDRESS_MISMATCH');
    });

    it('should allow clock skew within limit', () => {
      const now = Math.floor(Date.now() / 1000);
      // Token expired 20 seconds ago (within 30 second skew)
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
        iat: now - 320,
        exp: now - 20,
      });

      const result = validateToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test.program/v1'
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('Token utility functions', () => {
    it('should generate unique token IDs', () => {
      const id1 = generateTokenId();
      const id2 = generateTokenId();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBe(32); // 16 bytes hex
    });

    it('should detect expired tokens', () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
        iat: now - 600,
        exp: now - 300,
      });

      expect(isTokenExpired(expiredToken)).toBe(true);

      const validToken = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      expect(isTokenExpired(validToken)).toBe(false);
    });

    it('should calculate remaining TTL', () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      }, 300); // 5 minutes

      const ttl = getRemainingTTL(token);
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should return 0 TTL for expired token', () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
        iat: now - 600,
        exp: now - 300,
      });

      expect(getRemainingTTL(expiredToken)).toBe(0);
    });
  });

  describe('SECP256K1 support', () => {
    it('should sign and verify with SECP256K1', () => {
      const secpKeypair = generateKeypair(SigAlgId.SECP256K1);
      const secpPubDER = exportPubDER(secpKeypair.publicKey);
      const secpAddress = deriveAddress(secpPubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.SECP256K1);

      const token = signToken(secpKeypair.privateKey, SigAlgId.SECP256K1, {
        sub: secpAddress,
        aud: 'test.program/v1',
      });

      const valid = verifyTokenSignature(token, secpKeypair.publicKey, SigAlgId.SECP256K1);
      expect(valid).toBe(true);

      const result = validateToken(
        token,
        secpKeypair.publicKey,
        SigAlgId.SECP256K1,
        'test.program/v1'
      );
      expect(result.valid).toBe(true);
    });
  });
});
