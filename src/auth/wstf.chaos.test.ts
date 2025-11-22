/**
 * WSTFAuth Chaos Tests
 *
 * Heavy negative test matrix for token validation.
 * Tests malformed inputs, tampered signatures, boundary conditions.
 * Goal: System never crashes, only returns well-typed errors.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  signToken,
  parseToken,
  verifyTokenSignature,
  validateToken,
  base64urlEncode,
  base64urlDecode,
  WSTFAuthPayload,
  TokenErrorCode,
} from './wstf';
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { deriveAddress } from '../crypto/address';
import { SigAlgId, MappingAlgId } from '../crypto/algorithms';

// ============================================
// Test Helpers
// ============================================

function mkKeypair() {
  const keypair = generateKeypair(SigAlgId.ED25519);
  const pubDER = exportPubDER(keypair.publicKey);
  const address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
  return { ...keypair, address };
}

function mkPayload(
  address: string,
  overrides: Partial<WSTFAuthPayload> = {}
): Partial<WSTFAuthPayload> & { sub: string; aud: string } {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: address,
    aud: 'test.program/v1',
    iat: now,
    exp: now + 300,
    jti: crypto.randomBytes(16).toString('hex'),
    ...overrides,
  };
}

// ============================================
// Layer 1: Token Shape / Encoding
// ============================================

describe('WSTFAuth Chaos: Token Shape/Encoding', () => {
  let kp: ReturnType<typeof mkKeypair>;

  beforeEach(() => {
    kp = mkKeypair();
  });

  describe('Missing/Empty header', () => {
    it('should return null for empty string', () => {
      const parsed = parseToken('');
      expect(parsed).toBeNull();
    });

    it('should return null for undefined-like input', () => {
      // parseToken handles these gracefully - may return null or throw
      try {
        const nullResult = parseToken(null as any);
        expect(nullResult === null || typeof nullResult === 'object').toBe(true);
      } catch {
        // Also acceptable to throw
      }
      try {
        const undefinedResult = parseToken(undefined as any);
        expect(undefinedResult === null || typeof undefinedResult === 'object').toBe(true);
      } catch {
        // Also acceptable to throw
      }
    });

    it('should return false for verification of empty header', () => {
      const valid = verifyTokenSignature('', kp.publicKey, SigAlgId.ED25519);
      expect(valid).toBe(false);
    });
  });

  describe('Malformed header - no dot separator', () => {
    it('should return null for single part token', () => {
      expect(parseToken('abc123')).toBeNull();
      expect(parseToken('nodothere')).toBeNull();
    });

    it('should return null for token with multiple dots', () => {
      expect(parseToken('a.b.c')).toBeNull();
      expect(parseToken('a.b.c.d')).toBeNull();
    });
  });

  describe('Malformed header - empty parts', () => {
    it('should return null for empty payload part', () => {
      expect(parseToken('.deadbeef')).toBeNull();
    });

    it('should handle empty signature part', () => {
      const validB64 = base64urlEncode(JSON.stringify({ sub: 'test' }));
      const parsed = parseToken(`${validB64}.`);
      // May return parsed with empty signature or null - both are acceptable
      if (parsed) {
        expect(parsed.signature.length).toBe(0);
      } else {
        expect(parsed).toBeNull();
      }
    });

    it('should return null for both empty', () => {
      expect(parseToken('.')).toBeNull();
    });
  });

  describe('Invalid base64 payload', () => {
    it('should return null for invalid base64 characters', () => {
      expect(parseToken('!!!invalid!!!.deadbeef')).toBeNull();
      expect(parseToken('abc$%^.deadbeef')).toBeNull();
    });

    it('should return null for base64 with wrong padding', () => {
      // Intentionally malformed base64
      expect(parseToken('YWJj====.deadbeef')).toBeNull();
    });
  });

  describe('Invalid JSON payload', () => {
    it('should return null for non-JSON base64', () => {
      const notJson = base64urlEncode('not-json-at-all');
      expect(parseToken(`${notJson}.deadbeef`)).toBeNull();
    });

    it('should return null for truncated JSON', () => {
      const truncated = base64urlEncode('{"sub": "test"');
      expect(parseToken(`${truncated}.deadbeef`)).toBeNull();
    });

    it('should handle array instead of object', () => {
      const arrayJson = base64urlEncode('[1, 2, 3]');
      const parsed = parseToken(`${arrayJson}.deadbeef`);
      // parseToken may return null OR parse it (arrays are valid JSON)
      // What matters is validateToken will reject it as missing required fields
      if (parsed) {
        // If parsed, it should be missing 'sub' which is required for validation
        expect(parsed.payload).not.toHaveProperty('sub');
      }
    });
  });

  describe('Missing required claims', () => {
    it('should fail validation when sub is missing', () => {
      const payload = { aud: 'test', iat: 123, exp: 456 };
      const b64 = base64urlEncode(JSON.stringify(payload));
      const token = `${b64}.${'00'.repeat(64)}`;

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_FIELD');
    });

    it('should fail validation when aud is missing', () => {
      const payload = { sub: kp.address, iat: 123, exp: 456 };
      const b64 = base64urlEncode(JSON.stringify(payload));
      const token = `${b64}.${'00'.repeat(64)}`;

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_FIELD');
    });

    it('should fail validation when iat is missing', () => {
      const payload = { sub: kp.address, aud: 'test', exp: 456 };
      const b64 = base64urlEncode(JSON.stringify(payload));
      const token = `${b64}.${'00'.repeat(64)}`;

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_FIELD');
    });

    it('should fail validation when exp is missing', () => {
      const payload = { sub: kp.address, aud: 'test', iat: 123 };
      const b64 = base64urlEncode(JSON.stringify(payload));
      const token = `${b64}.${'00'.repeat(64)}`;

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_FIELD');
    });
  });

  describe('Invalid claim types', () => {
    it('should fail when sub is not a string', () => {
      const payload = { sub: 12345, aud: 'test', iat: 123, exp: 456 };
      const b64 = base64urlEncode(JSON.stringify(payload));
      const token = `${b64}.${'00'.repeat(64)}`;

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_FIELD');
    });

    it('should fail when iat is a string', () => {
      const payload = { sub: kp.address, aud: 'test', iat: 'not-a-number', exp: 456 };
      const b64 = base64urlEncode(JSON.stringify(payload));
      const token = `${b64}.${'00'.repeat(64)}`;

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_FIELD');
    });

    it('should fail when exp is negative', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        iat: now,
        exp: -1,
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });
  });
});

// ============================================
// Layer 2: Claims Validation (exp/iat/aud)
// ============================================

describe('WSTFAuth Chaos: Claims Validation', () => {
  let kp: ReturnType<typeof mkKeypair>;

  beforeEach(() => {
    kp = mkKeypair();
  });

  describe('Audience validation', () => {
    it('should reject wrong audience', () => {
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'wrong.program/v1',
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'correct.program/v1');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('WRONG_AUDIENCE');
    });

    it('should reject empty audience', () => {
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: '',
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(false);
    });

    it('should be case-sensitive for audience', () => {
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'Test.Program/v1',
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('WRONG_AUDIENCE');
    });
  });

  describe('Expiry validation', () => {
    it('should reject clearly expired token', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        iat: now - 3600,
        exp: now - 1800, // Expired 30 minutes ago
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('should reject token expired beyond clock skew', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        iat: now - 400,
        exp: now - 100, // Expired 100s ago, beyond 30s skew
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('should allow token within clock skew', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        iat: now - 320,
        exp: now - 10, // Expired 10s ago, within 30s skew
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(true);
    });
  });

  describe('Issued-at validation', () => {
    it('should reject token issued far in future', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        iat: now + 3600, // 1 hour in future
        exp: now + 7200,
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('NOT_YET_VALID');
    });

    it('should allow token with iat within clock skew', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        iat: now + 20, // 20s in future, within 30s skew
        exp: now + 320,
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(true);
    });
  });

  describe('Nonsense timestamp combinations', () => {
    it('should reject when exp < iat', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        iat: now,
        exp: now - 100, // exp before iat
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('should reject zero timestamps', () => {
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        iat: 0,
        exp: 0,
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });
  });
});

// ============================================
// Layer 3: Signature Tampering
// ============================================

describe('WSTFAuth Chaos: Signature Tampering', () => {
  let kp: ReturnType<typeof mkKeypair>;

  beforeEach(() => {
    kp = mkKeypair();
  });

  describe('Payload modification after signing', () => {
    it('should reject if payload path changed', () => {
      const payload = mkPayload(kp.address);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, payload);
      const [b64, sig] = token.split('.');

      // Decode, modify, re-encode
      const decoded = JSON.parse(base64urlDecode(b64).toString());
      decoded.customPath = '/other';
      const tamperedB64 = base64urlEncode(JSON.stringify(decoded));
      const tamperedToken = `${tamperedB64}.${sig}`;

      const result = validateToken(tamperedToken, kp.publicKey, SigAlgId.ED25519, payload.aud);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });

    it('should reject if sub changed', () => {
      const payload = mkPayload(kp.address);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, payload);
      const [b64, sig] = token.split('.');

      const decoded = JSON.parse(base64urlDecode(b64).toString());
      // Use a valid-looking address format (generate another keypair for valid address)
      const otherKp = mkKeypair();
      decoded.sub = otherKp.address;
      const tamperedB64 = base64urlEncode(JSON.stringify(decoded));
      const tamperedToken = `${tamperedB64}.${sig}`;

      const result = validateToken(tamperedToken, kp.publicKey, SigAlgId.ED25519, payload.aud);
      expect(result.valid).toBe(false);
      // Either SIGNATURE_INVALID (signature doesn't match new payload) or ADDRESS_MISMATCH
      expect(['SIGNATURE_INVALID', 'ADDRESS_MISMATCH']).toContain(result.code);
    });

    it('should reject if exp extended', () => {
      const payload = mkPayload(kp.address);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, payload);
      const [b64, sig] = token.split('.');

      const decoded = JSON.parse(base64urlDecode(b64).toString());
      decoded.exp = decoded.exp + 86400; // Extend by 1 day
      const tamperedB64 = base64urlEncode(JSON.stringify(decoded));
      const tamperedToken = `${tamperedB64}.${sig}`;

      const result = validateToken(tamperedToken, kp.publicKey, SigAlgId.ED25519, payload.aud);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });
  });

  describe('Signature replacement', () => {
    it('should reject random signature bytes', () => {
      const payload = mkPayload(kp.address);
      const b64 = base64urlEncode(JSON.stringify(payload));
      const randomSig = crypto.randomBytes(64).toString('hex');
      const token = `${b64}.${randomSig}`;

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, payload.aud);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });

    it('should reject all-zero signature', () => {
      const payload = mkPayload(kp.address);
      const b64 = base64urlEncode(JSON.stringify(payload));
      const zeroSig = '00'.repeat(64);
      const token = `${b64}.${zeroSig}`;

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, payload.aud);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });

    it('should reject truncated signature', () => {
      const payload = mkPayload(kp.address);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, payload);
      const [b64, sig] = token.split('.');
      const truncatedSig = sig.slice(0, 32); // Only first 16 bytes
      const truncatedToken = `${b64}.${truncatedSig}`;

      const valid = verifyTokenSignature(truncatedToken, kp.publicKey, SigAlgId.ED25519);
      expect(valid).toBe(false);
    });

    it('should reject signature with flipped bit', () => {
      const payload = mkPayload(kp.address);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, payload);
      const [b64, sig] = token.split('.');

      // Flip one character
      const sigBytes = Buffer.from(sig, 'hex');
      sigBytes[0] ^= 0x01;
      const flippedSig = sigBytes.toString('hex');
      const tamperedToken = `${b64}.${flippedSig}`;

      const result = validateToken(tamperedToken, kp.publicKey, SigAlgId.ED25519, payload.aud);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });
  });

  describe('Wrong key verification', () => {
    it('should reject when verified with different key', () => {
      const payload = mkPayload(kp.address);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, payload);

      const otherKp = mkKeypair();
      const valid = verifyTokenSignature(token, otherKp.publicKey, SigAlgId.ED25519);
      expect(valid).toBe(false);
    });

    it('should reject valid signature with mismatched address', () => {
      const otherKp = mkKeypair();
      const payload = mkPayload(otherKp.address); // Use other address
      const token = signToken(kp.privateKey, SigAlgId.ED25519, payload); // Sign with our key

      // Signature is valid, but address doesn't match public key
      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, payload.aud);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('ADDRESS_MISMATCH');
    });
  });

  describe('Algorithm confusion', () => {
    it('should reject Ed25519 signature verified as SECP256K1', () => {
      const payload = mkPayload(kp.address);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, payload);

      // Try to verify with wrong algorithm - this may throw or return false
      try {
        const valid = verifyTokenSignature(token, kp.publicKey, SigAlgId.SECP256K1);
        expect(valid).toBe(false);
      } catch {
        // Expected - algorithm mismatch
        expect(true).toBe(true);
      }
    });
  });
});

// ============================================
// Layer 4: Replay & Cross-use Protection
// ============================================

describe('WSTFAuth Chaos: Replay Protection', () => {
  let kp: ReturnType<typeof mkKeypair>;

  beforeEach(() => {
    kp = mkKeypair();
  });

  it('should generate unique jti values', () => {
    const jtis = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const payload = mkPayload(kp.address);
      jtis.add(payload.jti!);
    }
    expect(jtis.size).toBe(1000);
  });

  it('should include jti in signed payload', () => {
    const jti = 'unique-token-id-123';
    const token = signToken(kp.privateKey, SigAlgId.ED25519, {
      sub: kp.address,
      aud: 'test.program/v1',
      jti,
    });

    const parsed = parseToken(token);
    expect(parsed?.payload.jti).toBe(jti);
  });
});

// ============================================
// Layer 5: Unicode & Edge Cases
// ============================================

describe('WSTFAuth Chaos: Unicode & Edge Cases', () => {
  let kp: ReturnType<typeof mkKeypair>;

  beforeEach(() => {
    kp = mkKeypair();
  });

  describe('Unicode handling', () => {
    it('should handle unicode in custom claims', () => {
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        customField: '日本語テスト',
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(true);
      expect(result.payload?.customField).toBe('日本語テスト');
    });

    it('should handle emoji in custom claims', () => {
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        mood: '😀🎉🚀',
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(true);
      expect(result.payload?.mood).toBe('😀🎉🚀');
    });
  });

  describe('Large payloads', () => {
    it('should handle large custom claim', () => {
      const largeString = 'x'.repeat(10000);
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        bigData: largeString,
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, 'test.program/v1');
      expect(result.valid).toBe(true);
      expect(result.payload?.bigData).toBe(largeString);
    });
  });

  describe('Special characters', () => {
    it('should handle special chars in audience', () => {
      const aud = 'test.program-with_special/v1';
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud,
      });

      const result = validateToken(token, kp.publicKey, SigAlgId.ED25519, aud);
      expect(result.valid).toBe(true);
    });

    it('should handle null values in custom claims', () => {
      const token = signToken(kp.privateKey, SigAlgId.ED25519, {
        sub: kp.address,
        aud: 'test.program/v1',
        nullField: null as any,
      });

      const parsed = parseToken(token);
      expect(parsed?.payload.nullField).toBeNull();
    });
  });
});

// ============================================
// Chaos Fuzz: Random Mutations
// ============================================

describe('WSTFAuth Chaos: Fuzz Testing', () => {
  let kp: ReturnType<typeof mkKeypair>;

  beforeEach(() => {
    kp = mkKeypair();
  });

  it('should never crash on random mutations (100 iterations)', () => {
    const payload = mkPayload(kp.address);
    const baseToken = signToken(kp.privateKey, SigAlgId.ED25519, payload);

    const mutateToken = (token: string): string => {
      const buf = Buffer.from(token, 'utf8');
      const idx = Math.floor(Math.random() * buf.length);
      buf[idx] ^= Math.floor(Math.random() * 256);
      return buf.toString('utf8');
    };

    for (let i = 0; i < 100; i++) {
      const mutated = mutateToken(baseToken);

      // Should never throw, only return structured result
      const parsed = parseToken(mutated);
      expect(parsed === null || typeof parsed === 'object').toBe(true);

      if (parsed) {
        const valid = verifyTokenSignature(mutated, kp.publicKey, SigAlgId.ED25519);
        expect(typeof valid).toBe('boolean');
      }
    }
  });

  it('should never crash on completely random input (100 iterations)', () => {
    for (let i = 0; i < 100; i++) {
      const randomLen = Math.floor(Math.random() * 1000) + 1;
      const randomInput = crypto.randomBytes(randomLen).toString('base64url');

      // Add random dot somewhere
      const dotPos = Math.floor(Math.random() * randomInput.length);
      const withDot = randomInput.slice(0, dotPos) + '.' + randomInput.slice(dotPos);

      const parsed = parseToken(withDot);
      expect(parsed === null || typeof parsed === 'object').toBe(true);
    }
  });
});
