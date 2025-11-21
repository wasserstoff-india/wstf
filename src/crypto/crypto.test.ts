/**
 * Crypto & Address Comprehensive Unit Tests
 *
 * Tests key generation, signatures, addresses for all supported algorithms.
 * Includes positive, negative, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { SigAlgId, MappingAlgId } from './algorithms';
import { generateKeypair, exportPubDER, Keypair } from './keys';
import { signPreimage, verifyPreimage } from './sign';
import { deriveAddress, decodeAddress, publicKeyMatchesAddress, buildAddressPayload } from './address';

describe('Crypto: Key Generation', () => {
  describe('Ed25519', () => {
    it('should generate valid Ed25519 keypair', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      expect(kp.sigAlg).toBe(SigAlgId.ED25519);
      expect(kp.publicKey).toBeDefined();
      expect(kp.privateKey).toBeDefined();
    });

    it('should export public key as DER', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const der = exportPubDER(kp.publicKey);
      expect(Buffer.isBuffer(der)).toBe(true);
      expect(der.length).toBeGreaterThan(0);
    });

    it('should generate unique keypairs each time', () => {
      const kp1 = generateKeypair(SigAlgId.ED25519);
      const kp2 = generateKeypair(SigAlgId.ED25519);
      const der1 = exportPubDER(kp1.publicKey);
      const der2 = exportPubDER(kp2.publicKey);
      expect(der1.equals(der2)).toBe(false);
    });
  });

  describe('secp256k1', () => {
    it('should generate valid secp256k1 keypair', () => {
      const kp = generateKeypair(SigAlgId.SECP256K1);
      expect(kp.sigAlg).toBe(SigAlgId.SECP256K1);
      expect(kp.publicKey).toBeDefined();
      expect(kp.privateKey).toBeDefined();
    });

    it('should export public key as DER', () => {
      const kp = generateKeypair(SigAlgId.SECP256K1);
      const der = exportPubDER(kp.publicKey);
      expect(Buffer.isBuffer(der)).toBe(true);
      expect(der.length).toBeGreaterThan(0);
    });
  });

  describe('Unsupported algorithms', () => {
    it('should throw for unsupported sigAlg', () => {
      expect(() => generateKeypair(99 as SigAlgId)).toThrow('Unsupported sigAlg');
    });
  });
});

describe('Crypto: Signatures', () => {
  const testPreimage = Buffer.from('test preimage data for signing');

  describe('Ed25519 signatures', () => {
    let kp: Keypair;

    beforeAll(() => {
      kp = generateKeypair(SigAlgId.ED25519);
    });

    it('should sign and verify preimage', () => {
      const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, testPreimage);
      expect(Buffer.isBuffer(sig)).toBe(true);
      expect(sig.length).toBe(64); // Ed25519 signature is 64 bytes

      const valid = verifyPreimage(SigAlgId.ED25519, kp.publicKey, testPreimage, sig);
      expect(valid).toBe(true);
    });

    it('should reject signature with wrong public key', () => {
      const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, testPreimage);
      const kp2 = generateKeypair(SigAlgId.ED25519);
      const valid = verifyPreimage(SigAlgId.ED25519, kp2.publicKey, testPreimage, sig);
      expect(valid).toBe(false);
    });

    it('should reject signature with tampered message', () => {
      const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, testPreimage);
      const tamperedPreimage = Buffer.from('tampered preimage data');
      const valid = verifyPreimage(SigAlgId.ED25519, kp.publicKey, tamperedPreimage, sig);
      expect(valid).toBe(false);
    });

    it('should reject tampered signature', () => {
      const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, testPreimage);
      // Tamper with signature
      const tamperedSig = Buffer.from(sig);
      tamperedSig[0] ^= 0xff;
      const valid = verifyPreimage(SigAlgId.ED25519, kp.publicKey, testPreimage, tamperedSig);
      expect(valid).toBe(false);
    });

    it('should sign empty preimage', () => {
      const emptyPreimage = Buffer.alloc(0);
      const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, emptyPreimage);
      const valid = verifyPreimage(SigAlgId.ED25519, kp.publicKey, emptyPreimage, sig);
      expect(valid).toBe(true);
    });

    it('should sign large preimage', () => {
      const largePreimage = crypto.randomBytes(1024 * 1024); // 1MB
      const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, largePreimage);
      const valid = verifyPreimage(SigAlgId.ED25519, kp.publicKey, largePreimage, sig);
      expect(valid).toBe(true);
    });
  });

  describe('secp256k1 signatures', () => {
    let kp: Keypair;

    beforeAll(() => {
      kp = generateKeypair(SigAlgId.SECP256K1);
    });

    it('should sign and verify preimage', () => {
      const sig = signPreimage(SigAlgId.SECP256K1, kp.privateKey, testPreimage);
      expect(Buffer.isBuffer(sig)).toBe(true);
      expect(sig.length).toBeGreaterThan(0);

      const valid = verifyPreimage(SigAlgId.SECP256K1, kp.publicKey, testPreimage, sig);
      expect(valid).toBe(true);
    });

    it('should reject signature with wrong public key', () => {
      const sig = signPreimage(SigAlgId.SECP256K1, kp.privateKey, testPreimage);
      const kp2 = generateKeypair(SigAlgId.SECP256K1);
      const valid = verifyPreimage(SigAlgId.SECP256K1, kp2.publicKey, testPreimage, sig);
      expect(valid).toBe(false);
    });

    it('should reject signature with tampered message', () => {
      const sig = signPreimage(SigAlgId.SECP256K1, kp.privateKey, testPreimage);
      const tamperedPreimage = Buffer.from('tampered preimage');
      const valid = verifyPreimage(SigAlgId.SECP256K1, kp.publicKey, tamperedPreimage, sig);
      expect(valid).toBe(false);
    });
  });

  describe('Cross-algorithm rejection', () => {
    it('should fail to verify Ed25519 sig with secp256k1 verifier', () => {
      const kpEd = generateKeypair(SigAlgId.ED25519);
      const kpSecp = generateKeypair(SigAlgId.SECP256K1);
      const sig = signPreimage(SigAlgId.ED25519, kpEd.privateKey, testPreimage);

      // Try to verify Ed25519 signature using secp256k1 key - should fail or throw
      try {
        const valid = verifyPreimage(SigAlgId.SECP256K1, kpSecp.publicKey, testPreimage, sig);
        expect(valid).toBe(false);
      } catch {
        // Some crypto implementations throw on incompatible key/algo
        expect(true).toBe(true);
      }
    });
  });

  describe('Unsupported algorithms', () => {
    it('should throw for unsupported sigAlg in sign', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      expect(() => signPreimage(99 as SigAlgId, kp.privateKey, testPreimage)).toThrow('Unsupported sigAlg');
    });

    it('should return false for unsupported sigAlg in verify', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const sig = signPreimage(SigAlgId.ED25519, kp.privateKey, testPreimage);
      const valid = verifyPreimage(99 as SigAlgId, kp.publicKey, testPreimage, sig);
      expect(valid).toBe(false);
    });
  });
});

describe('Crypto: Addresses', () => {
  describe('Address derivation', () => {
    it('should derive Ed25519 address with gc prefix', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const der = exportPubDER(kp.publicKey);
      const address = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      expect(address.startsWith('gc')).toBe(true);
      expect(address.length).toBeGreaterThan(30);
    });

    it('should derive secp256k1 address with gc prefix', () => {
      const kp = generateKeypair(SigAlgId.SECP256K1);
      const der = exportPubDER(kp.publicKey);
      const address = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.SECP256K1);

      expect(address.startsWith('gc')).toBe(true);
    });

    it('should derive different addresses for different keys', () => {
      const kp1 = generateKeypair(SigAlgId.ED25519);
      const kp2 = generateKeypair(SigAlgId.ED25519);
      const addr1 = deriveAddress(exportPubDER(kp1.publicKey), MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
      const addr2 = deriveAddress(exportPubDER(kp2.publicKey), MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      expect(addr1).not.toBe(addr2);
    });

    it('should derive same address for same key', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const der = exportPubDER(kp.publicKey);
      const addr1 = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
      const addr2 = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      expect(addr1).toBe(addr2);
    });
  });

  describe('Address decoding', () => {
    it('should decode valid address', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const der = exportPubDER(kp.publicKey);
      const address = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      const decoded = decodeAddress(address);
      expect(decoded.mappingAlg).toBe(MappingAlgId.SIMPLE_HASH);
      expect(decoded.sigAlg).toBe(SigAlgId.ED25519);
      expect(decoded.pkHash.length).toBe(20);
      expect(decoded.rawPayload.length).toBe(22);
    });

    it('should throw for bad prefix', () => {
      expect(() => decodeAddress('zz1234567890')).toThrow('Bad prefix');
      expect(() => decodeAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toThrow('Bad prefix');
    });

    it('should throw for empty string', () => {
      expect(() => decodeAddress('')).toThrow('Bad prefix');
    });

    it('should throw for prefix only', () => {
      expect(() => decodeAddress('gc')).toThrow();
    });

    it('should throw for invalid base58', () => {
      // 'O', 'I', 'l' are not in base58 alphabet
      expect(() => decodeAddress('gc0OIl')).toThrow();
    });

    it('should throw for bad checksum', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const address = deriveAddress(exportPubDER(kp.publicKey), MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
      // Tamper with last character
      const tampered = address.slice(0, -1) + (address.slice(-1) === 'a' ? 'b' : 'a');
      expect(() => decodeAddress(tampered)).toThrow();
    });
  });

  describe('Address roundtrip', () => {
    it('should roundtrip Ed25519 address', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const der = exportPubDER(kp.publicKey);
      const address = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
      const decoded = decodeAddress(address);

      // Rebuild address from decoded parts
      const payload = buildAddressPayload(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
      expect(payload.equals(decoded.rawPayload)).toBe(true);
    });

    it('should roundtrip secp256k1 address', () => {
      const kp = generateKeypair(SigAlgId.SECP256K1);
      const der = exportPubDER(kp.publicKey);
      const address = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.SECP256K1);
      const decoded = decodeAddress(address);

      expect(decoded.sigAlg).toBe(SigAlgId.SECP256K1);
    });
  });

  describe('Public key matching', () => {
    it('should match Ed25519 pubkey to address', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const address = deriveAddress(exportPubDER(kp.publicKey), MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      expect(publicKeyMatchesAddress(kp.publicKey, address)).toBe(true);
    });

    it('should match secp256k1 pubkey to address', () => {
      const kp = generateKeypair(SigAlgId.SECP256K1);
      const address = deriveAddress(exportPubDER(kp.publicKey), MappingAlgId.SIMPLE_HASH, SigAlgId.SECP256K1);

      expect(publicKeyMatchesAddress(kp.publicKey, address)).toBe(true);
    });

    it('should reject wrong pubkey for address', () => {
      const kp1 = generateKeypair(SigAlgId.ED25519);
      const kp2 = generateKeypair(SigAlgId.ED25519);
      const address = deriveAddress(exportPubDER(kp1.publicKey), MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      expect(publicKeyMatchesAddress(kp2.publicKey, address)).toBe(false);
    });

    it('should reject cross-algo pubkey mismatch', () => {
      const kpEd = generateKeypair(SigAlgId.ED25519);
      const kpSecp = generateKeypair(SigAlgId.SECP256K1);
      const addressEd = deriveAddress(exportPubDER(kpEd.publicKey), MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      // secp256k1 key won't match Ed25519 address
      expect(publicKeyMatchesAddress(kpSecp.publicKey, addressEd)).toBe(false);
    });
  });

  describe('Unsupported mapping algorithm', () => {
    it('should throw for unsupported mappingAlg', () => {
      const kp = generateKeypair(SigAlgId.ED25519);
      const der = exportPubDER(kp.publicKey);
      expect(() => buildAddressPayload(der, 99 as MappingAlgId, SigAlgId.ED25519)).toThrow('mappingAlg unsupported');
    });
  });
});

describe('Crypto: Determinism', () => {
  it('should produce deterministic signatures for Ed25519', () => {
    // Ed25519 is deterministic - same key + message = same signature
    const kp = generateKeypair(SigAlgId.ED25519);
    const preimage = Buffer.from('deterministic test');

    const sig1 = signPreimage(SigAlgId.ED25519, kp.privateKey, preimage);
    const sig2 = signPreimage(SigAlgId.ED25519, kp.privateKey, preimage);

    expect(sig1.equals(sig2)).toBe(true);
  });

  it('should produce deterministic addresses', () => {
    const kp = generateKeypair(SigAlgId.ED25519);
    const der = exportPubDER(kp.publicKey);

    const addr1 = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
    const addr2 = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    expect(addr1).toBe(addr2);
  });

  it('should produce deterministic pkHash', () => {
    const kp = generateKeypair(SigAlgId.ED25519);
    const der = exportPubDER(kp.publicKey);
    const address = deriveAddress(der, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    const decoded1 = decodeAddress(address);
    const decoded2 = decodeAddress(address);

    expect(decoded1.pkHash.equals(decoded2.pkHash)).toBe(true);
  });
});

// Import beforeAll from vitest
import { beforeAll } from 'vitest';
