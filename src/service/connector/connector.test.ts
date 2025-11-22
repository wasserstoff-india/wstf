/**
 * Service Connector Tests
 *
 * Tests for request authorization and service SDK helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  authorizeRequest,
  extractRequestContext,
  createMockKeyResolver,
  createPublicKeyCache,
  successResponse,
  errorResponse,
  authErrorResponse,
  hashResponse,
  createServiceMetadata,
  ConnectorOptions,
  RequestContext,
} from './connector';
import { signToken } from '../../auth/wstf';
import { generateKeypair, exportPubDER } from '../../crypto/keys';
import { deriveAddress } from '../../crypto/address';
import { SigAlgId, MappingAlgId } from '../../crypto/algorithms';

describe('Service Connector', () => {
  let keypair: ReturnType<typeof generateKeypair>;
  let address: string;
  let keyMap: Map<string, crypto.KeyObject>;
  let options: ConnectorOptions;

  beforeEach(() => {
    keypair = generateKeypair(SigAlgId.ED25519);
    const pubDER = exportPubDER(keypair.publicKey);
    address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

    keyMap = new Map();
    keyMap.set(address, keypair.publicKey);

    options = {
      programId: 'test.program/v1',
      resolvePublicKey: createMockKeyResolver(keyMap),
    };
  });

  describe('extractRequestContext', () => {
    it('should extract authorization header', () => {
      const headers = {
        'authorization': 'Bearer token123',
      };
      const ctx = extractRequestContext(headers);
      expect(ctx.authorization).toBe('Bearer token123');
    });

    it('should extract WSTF headers', () => {
      const headers = {
        'x-wstf-call-id': '0x123',
        'x-wstf-program-id': 'test.program/v1',
        'x-wstf-caller': 'gc1alice',
      };
      const ctx = extractRequestContext(headers);
      expect(ctx.callId).toBe('0x123');
      expect(ctx.programId).toBe('test.program/v1');
      expect(ctx.caller).toBe('gc1alice');
    });

    it('should handle case-insensitive headers', () => {
      const headers = {
        'Authorization': 'Bearer token',
        'X-WSTF-Call-Id': '0x456',
      };
      const ctx = extractRequestContext(headers);
      expect(ctx.authorization).toBe('Bearer token');
      expect(ctx.callId).toBe('0x456');
    });
  });

  describe('authorizeRequest with WSTFAuth token', () => {
    it('should authorize valid Bearer token', async () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      const context: RequestContext = {
        authorization: `Bearer ${token}`,
      };

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(true);
      expect(result.caller).toBe(address);
      expect(result.programId).toBe('test.program/v1');
    });

    it('should authorize valid WSTF token', async () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
      });

      const context: RequestContext = {
        authorization: `WSTF ${token}`,
      };

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(true);
    });

    it('should reject expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test.program/v1',
        iat: now - 600,
        exp: now - 300,
      });

      const context: RequestContext = {
        authorization: `Bearer ${token}`,
      };

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('should reject wrong audience', async () => {
      const token = signToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'other.program/v1',
      });

      const context: RequestContext = {
        authorization: `Bearer ${token}`,
      };

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(false);
      expect(result.code).toBe('WRONG_AUDIENCE');
    });

    it('should reject unknown public key', async () => {
      const otherKeypair = generateKeypair(SigAlgId.ED25519);
      const otherPubDER = exportPubDER(otherKeypair.publicKey);
      const otherAddress = deriveAddress(otherPubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);

      const token = signToken(otherKeypair.privateKey, SigAlgId.ED25519, {
        sub: otherAddress,
        aud: 'test.program/v1',
      });

      const context: RequestContext = {
        authorization: `Bearer ${token}`,
      };

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(false);
      expect(result.code).toBe('PUBKEY_FETCH_FAILED');
    });

    it('should reject invalid token format', async () => {
      const context: RequestContext = {
        authorization: 'Bearer invalid_token',
      };

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(false);
      expect(result.code).toBe('INVALID_FORMAT');
    });
  });

  describe('authorizeRequest with header-based auth', () => {
    it('should authorize header-based auth from Instruction Runner', async () => {
      const context: RequestContext = {
        caller: 'gc1alice',
        programId: 'test.program/v1',
        callId: '0x123',
      };

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(true);
      expect(result.caller).toBe('gc1alice');
      expect(result.programId).toBe('test.program/v1');
    });

    it('should reject mismatched program ID', async () => {
      const context: RequestContext = {
        caller: 'gc1alice',
        programId: 'other.program/v1',
        callId: '0x123',
      };

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(false);
      expect(result.code).toBe('PROGRAM_MISMATCH');
    });

    it('should reject header auth when requireWSTFAuth is true', async () => {
      const strictOptions: ConnectorOptions = {
        ...options,
        requireWSTFAuth: true,
      };

      const context: RequestContext = {
        caller: 'gc1alice',
        programId: 'test.program/v1',
        callId: '0x123',
      };

      const result = await authorizeRequest(context, strictOptions);
      expect(result.authorized).toBe(false);
      expect(result.code).toBe('NO_TOKEN');
    });
  });

  describe('authorizeRequest with no auth', () => {
    it('should reject empty context', async () => {
      const context: RequestContext = {};

      const result = await authorizeRequest(context, options);
      expect(result.authorized).toBe(false);
      expect(result.code).toBe('NO_TOKEN');
    });
  });

  describe('Public key cache', () => {
    it('should cache resolved keys', async () => {
      let fetchCount = 0;
      const fetchKey = async (addr: string) => {
        fetchCount++;
        return keyMap.get(addr) ?? null;
      };

      const cachedResolver = createPublicKeyCache(fetchKey, 10000);

      // First call fetches
      const key1 = await cachedResolver(address);
      expect(key1).toBe(keypair.publicKey);
      expect(fetchCount).toBe(1);

      // Second call uses cache
      const key2 = await cachedResolver(address);
      expect(key2).toBe(keypair.publicKey);
      expect(fetchCount).toBe(1);
    });

    it('should handle missing keys', async () => {
      const fetchKey = async () => null;
      const cachedResolver = createPublicKeyCache(fetchKey);

      const result = await cachedResolver('unknown');
      expect(result).toBeNull();
    });
  });

  describe('Response helpers', () => {
    it('should create success response', () => {
      const data = { foo: 'bar' };
      const response = successResponse(data);
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
    });

    it('should create error response', () => {
      const response = errorResponse('Something went wrong', 'ERR_CODE');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Something went wrong');
      expect(response.code).toBe('ERR_CODE');
    });

    it('should create auth error response', () => {
      const authResult = {
        authorized: false,
        error: 'Token expired',
        code: 'EXPIRED' as const,
      };
      const response = authErrorResponse(authResult);
      expect(response.success).toBe(false);
      expect(response.error).toBe('Token expired');
      expect(response.code).toBe('EXPIRED');
    });
  });

  describe('hashResponse', () => {
    it('should hash string data', () => {
      const hash = hashResponse('test data');
      expect(hash.startsWith('0x')).toBe(true);
      expect(hash.length).toBe(66); // 0x + 64 hex chars
    });

    it('should hash buffer data', () => {
      const buf = Buffer.from([1, 2, 3, 4]);
      const hash = hashResponse(buf);
      expect(hash.startsWith('0x')).toBe(true);
    });

    it('should produce deterministic hashes', () => {
      const hash1 = hashResponse('same data');
      const hash2 = hashResponse('same data');
      expect(hash1).toBe(hash2);
    });
  });

  describe('Service metadata', () => {
    it('should create service metadata', () => {
      const metadata = createServiceMetadata(
        'my.service/v1',
        'My Service',
        '1.0.0',
        [
          { path: '/call', method: 'POST', requiresAuth: true },
          { path: '/health', method: 'GET', requiresAuth: false },
        ],
        'A test service'
      );

      expect(metadata.programId).toBe('my.service/v1');
      expect(metadata.name).toBe('My Service');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.description).toBe('A test service');
      expect(metadata.endpoints.length).toBe(2);
    });
  });
});
