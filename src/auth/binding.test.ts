/**
 * WSTFAuth Binding Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  signBoundToken,
  validateBoundToken,
  bindMethod,
  bindPath,
  bindScopes,
  bindBody,
  hashBody,
  matchMethod,
  matchPath,
  normalizePath,
  extractScopes,
  hasScopes,
  hasAnyScope,
  boundToken,
  BoundTokenBuilder,
  createRouteValidator,
  BoundPayload,
  HttpMethod,
} from './binding';
import { generateKeypair, exportPubDER } from '../crypto/keys';
import { deriveAddress } from '../crypto/address';
import { SigAlgId, MappingAlgId } from '../crypto/algorithms';

describe('WSTFAuth Binding', () => {
  let keypair: ReturnType<typeof generateKeypair>;
  let address: string;

  beforeEach(() => {
    keypair = generateKeypair(SigAlgId.ED25519);
    const pubDER = exportPubDER(keypair.publicKey);
    address = deriveAddress(pubDER, MappingAlgId.SIMPLE_HASH, SigAlgId.ED25519);
  });

  describe('Path Matching', () => {
    it('should match exact paths', () => {
      expect(matchPath('/users', '/users')).toBe(true);
      expect(matchPath('/users/123', '/users/123')).toBe(true);
      expect(matchPath('/users', '/groups')).toBe(false);
    });

    it('should normalize paths before matching', () => {
      expect(matchPath('/users/', '/users')).toBe(true);
      expect(matchPath('users', '/users')).toBe(true);
      expect(matchPath('/users', 'users/')).toBe(true);
    });

    it('should match single segment wildcards', () => {
      expect(matchPath('/users/*', '/users/123')).toBe(true);
      expect(matchPath('/users/*', '/users/abc')).toBe(true);
      expect(matchPath('/users/*', '/users/123/profile')).toBe(false);
    });

    it('should match parameter placeholders', () => {
      expect(matchPath('/users/:id', '/users/123')).toBe(true);
      expect(matchPath('/users/:id', '/users/abc')).toBe(true);
      expect(matchPath('/users/:id/posts', '/users/123/posts')).toBe(true);
      expect(matchPath('/users/:id', '/users/123/profile')).toBe(false);
    });

    it('should match glob patterns', () => {
      expect(matchPath('/users/**', '/users/123')).toBe(true);
      expect(matchPath('/users/**', '/users/123/profile')).toBe(true);
      expect(matchPath('/users/**', '/users/123/profile/edit')).toBe(true);
      expect(matchPath('/api/**', '/api/v1/users')).toBe(true);
    });

    it('should not match shorter actual paths', () => {
      expect(matchPath('/users/123', '/users')).toBe(false);
      expect(matchPath('/a/b/c', '/a/b')).toBe(false);
    });
  });

  describe('Method Matching', () => {
    it('should match methods case-insensitively', () => {
      expect(matchMethod('GET', 'GET')).toBe(true);
      expect(matchMethod('GET', 'get')).toBe(true);
      expect(matchMethod('POST', 'post')).toBe(true);
      expect(matchMethod('GET', 'POST')).toBe(false);
    });
  });

  describe('Path Normalization', () => {
    it('should add leading slash', () => {
      expect(normalizePath('users')).toBe('/users');
    });

    it('should remove trailing slash', () => {
      expect(normalizePath('/users/')).toBe('/users');
    });

    it('should preserve root path', () => {
      expect(normalizePath('/')).toBe('/');
    });

    it('should trim whitespace', () => {
      expect(normalizePath('  /users  ')).toBe('/users');
    });
  });

  describe('Scope Extraction', () => {
    it('should extract scopes from string', () => {
      const payload = { sub: 'test', aud: 'test', iat: 0, exp: 0, scp: 'read write admin' } as BoundPayload;
      const scopes = extractScopes(payload);
      expect(scopes.has('read')).toBe(true);
      expect(scopes.has('write')).toBe(true);
      expect(scopes.has('admin')).toBe(true);
    });

    it('should extract scopes from array', () => {
      const payload = { sub: 'test', aud: 'test', iat: 0, exp: 0, scp: ['read', 'write'] } as BoundPayload;
      const scopes = extractScopes(payload);
      expect(scopes.has('read')).toBe(true);
      expect(scopes.has('write')).toBe(true);
    });

    it('should return empty set for missing scopes', () => {
      const payload = { sub: 'test', aud: 'test', iat: 0, exp: 0 } as BoundPayload;
      const scopes = extractScopes(payload);
      expect(scopes.size).toBe(0);
    });
  });

  describe('Scope Checking', () => {
    it('should check all required scopes', () => {
      const payload = { sub: 'test', aud: 'test', iat: 0, exp: 0, scp: 'read write admin' } as BoundPayload;
      expect(hasScopes(payload, ['read', 'write'])).toBe(true);
      expect(hasScopes(payload, ['read', 'delete'])).toBe(false);
    });

    it('should check any of scopes', () => {
      const payload = { sub: 'test', aud: 'test', iat: 0, exp: 0, scp: 'read' } as BoundPayload;
      expect(hasAnyScope(payload, ['read', 'write'])).toBe(true);
      expect(hasAnyScope(payload, ['write', 'delete'])).toBe(false);
    });
  });

  describe('Body Hashing', () => {
    it('should hash body consistently', () => {
      const body = '{"foo":"bar"}';
      const hash1 = hashBody(body);
      const hash2 = hashBody(body);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different bodies', () => {
      const hash1 = hashBody('body1');
      const hash2 = hashBody('body2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle Buffer input', () => {
      const body = Buffer.from('test');
      const hash = hashBody(body);
      expect(hash).toHaveLength(64); // sha256 hex length
    });
  });

  describe('Payload Binding Helpers', () => {
    it('should bind method', () => {
      const payload = bindMethod({ sub: 'test', aud: 'svc' }, 'POST');
      expect(payload.mtd).toBe('POST');
    });

    it('should bind path', () => {
      const payload = bindPath({ sub: 'test', aud: 'svc' }, '/api/users');
      expect(payload.pth).toBe('/api/users');
    });

    it('should bind scopes', () => {
      const payload = bindScopes({ sub: 'test', aud: 'svc' }, ['read', 'write']);
      expect(payload.scp).toBe('read write');
    });

    it('should bind body', () => {
      const payload = bindBody({ sub: 'test', aud: 'svc' }, '{"test":true}');
      expect(payload.hsh).toBeDefined();
      expect(payload.hsh).toHaveLength(64);
    });
  });

  describe('Token Signing and Validation', () => {
    it('should sign and validate bound token', () => {
      const token = signBoundToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test-service',
        mtd: 'POST',
        pth: '/api/users',
      });

      const result = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { method: 'POST', path: '/api/users' }
      );

      expect(result.valid).toBe(true);
      expect(result.boundPayload?.mtd).toBe('POST');
      expect(result.boundPayload?.pth).toBe('/api/users');
    });

    it('should reject method mismatch', () => {
      const token = signBoundToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test-service',
        mtd: 'POST',
      });

      const result = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { method: 'GET' }
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('METHOD_MISMATCH');
    });

    it('should reject path mismatch', () => {
      const token = signBoundToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test-service',
        pth: '/api/users',
      });

      const result = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { path: '/api/admin' }
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('PATH_MISMATCH');
    });

    it('should validate required scopes', () => {
      const token = signBoundToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test-service',
        scp: 'read write',
      });

      const valid = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { requiredScopes: ['read'] }
      );
      expect(valid.valid).toBe(true);

      const invalid = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { requiredScopes: ['read', 'admin'] }
      );
      expect(invalid.valid).toBe(false);
      expect(invalid.code).toBe('SCOPE_MISMATCH');
    });

    it('should validate body hash', () => {
      const body = '{"action":"create"}';
      const token = signBoundToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test-service',
        hsh: hashBody(body),
      });

      const valid = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { body }
      );
      expect(valid.valid).toBe(true);

      const invalid = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { body: '{"action":"delete"}' }
      );
      expect(invalid.valid).toBe(false);
      expect(invalid.code).toBe('BODY_HASH_MISMATCH');
    });
  });

  describe('BoundTokenBuilder', () => {
    it('should build token with fluent API', () => {
      const token = boundToken(address, 'test-service')
        .method('POST')
        .path('/api/users')
        .scopes('read', 'write')
        .ttlSeconds(60)
        .sign(keypair.privateKey, SigAlgId.ED25519);

      const result = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { method: 'POST', path: '/api/users', requiredScopes: ['read'] }
      );

      expect(result.valid).toBe(true);
    });

    it('should accumulate scopes', () => {
      const builder = boundToken(address, 'test-service')
        .scopes('read')
        .scopes('write', 'admin');

      const payload = builder.getPayload();
      expect(payload.scp).toContain('read');
      expect(payload.scp).toContain('write');
      expect(payload.scp).toContain('admin');
    });

    it('should add custom claims', () => {
      const token = boundToken(address, 'test-service')
        .claim('customField', 'customValue')
        .tokenId('unique-id-123')
        .sign(keypair.privateKey, SigAlgId.ED25519);

      const result = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service'
      );

      expect(result.valid).toBe(true);
      expect(result.boundPayload?.jti).toBe('unique-id-123');
      expect((result.boundPayload as any).customField).toBe('customValue');
    });

    it('should bind body hash', () => {
      const body = '{"data":"test"}';
      const token = boundToken(address, 'test-service')
        .body(body)
        .sign(keypair.privateKey, SigAlgId.ED25519);

      const result = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        { body }
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('Route Validator', () => {
    it('should find exact route binding', () => {
      const validator = createRouteValidator([
        { method: 'GET', path: '/users' },
        { method: 'POST', path: '/users', requiredScopes: ['write'] },
        { method: 'DELETE', path: '/users/:id', requiredScopes: ['admin'] },
      ]);

      const getBinding = validator.findBinding('GET', '/users');
      expect(getBinding).toBeDefined();
      expect(getBinding?.method).toBe('GET');

      const postBinding = validator.findBinding('POST', '/users');
      expect(postBinding).toBeDefined();
      expect(postBinding?.requiredScopes).toContain('write');
    });

    it('should find pattern-matched route', () => {
      const validator = createRouteValidator([
        { method: 'GET', path: '/users/:id' },
        { method: 'GET', path: '/api/**' },
      ]);

      const paramBinding = validator.findBinding('GET', '/users/123');
      expect(paramBinding).toBeDefined();

      const globBinding = validator.findBinding('GET', '/api/v1/data');
      expect(globBinding).toBeDefined();
      expect(globBinding?.path).toBe('/api/**');
    });

    it('should validate token against route', () => {
      const validator = createRouteValidator([
        { method: 'POST', path: '/api/data', requiredScopes: ['write'] },
      ]);

      const token = signBoundToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test-service',
        mtd: 'POST',
        pth: '/api/data',
        scp: 'write',
      });

      const result = validator.validate(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        'POST',
        '/api/data'
      );

      expect(result.valid).toBe(true);
    });

    it('should reject no route binding', () => {
      const validator = createRouteValidator([
        { method: 'GET', path: '/users' },
      ]);

      const token = signBoundToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test-service',
      });

      const result = validator.validate(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        'POST',
        '/admin'
      );

      expect(result.valid).toBe(false);
    });

    it('should validate body hash when required', () => {
      const validator = createRouteValidator([
        { method: 'POST', path: '/api/secure', requireBodyHash: true },
      ]);

      const body = '{"sensitive":"data"}';
      const token = signBoundToken(keypair.privateKey, SigAlgId.ED25519, {
        sub: address,
        aud: 'test-service',
        mtd: 'POST',
        pth: '/api/secure',
        hsh: hashBody(body),
      });

      const valid = validator.validate(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        'POST',
        '/api/secure',
        body
      );
      expect(valid.valid).toBe(true);

      const invalid = validator.validate(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'test-service',
        'POST',
        '/api/secure',
        '{"different":"data"}'
      );
      expect(invalid.valid).toBe(false);
    });
  });

  describe('Integration with Gate', () => {
    it('should create tokens compatible with auth gate', () => {
      // Create a token with full binding
      const token = boundToken(address, 'api-service')
        .method('POST')
        .path('/api/v1/users')
        .scopes('user:create', 'api:access')
        .body('{"name":"test"}')
        .ttlSeconds(300)
        .sign(keypair.privateKey, SigAlgId.ED25519);

      // Validate with matching request
      const result = validateBoundToken(
        token,
        keypair.publicKey,
        SigAlgId.ED25519,
        'api-service',
        {
          method: 'POST',
          path: '/api/v1/users',
          requiredScopes: ['user:create'],
          body: '{"name":"test"}',
        }
      );

      expect(result.valid).toBe(true);
      expect(result.boundPayload?.mtd).toBe('POST');
      expect(result.boundPayload?.pth).toBe('/api/v1/users');
    });
  });
});
