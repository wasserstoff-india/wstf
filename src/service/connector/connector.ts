/**
 * Service Connector SDK
 *
 * Provides helpers for HTTP servers to authorize WSTFAuth requests
 * and integrate with the Instruction Runner.
 */

import crypto from 'crypto';
import {
  parseToken,
  validateToken,
  WSTFAuthPayload,
  TokenValidationResult,
  TokenErrorCode,
} from '../../auth/wstf';
import { SigAlgId, MappingAlgId } from '../../crypto/algorithms';
import { decodeAddress } from '../../crypto/address';
import { exportPubDER, Keypair } from '../../crypto/keys';

/**
 * Authorization result
 */
export interface AuthorizationResult {
  authorized: boolean;
  caller?: string;
  programId?: string;
  payload?: WSTFAuthPayload;
  error?: string;
  code?: TokenErrorCode | 'NO_TOKEN' | 'PROGRAM_MISMATCH' | 'PUBKEY_FETCH_FAILED';
}

/**
 * Request context from HTTP headers
 */
export interface RequestContext {
  /** Authorization header value */
  authorization?: string;
  /** X-WSTF-Call-Id header */
  callId?: string;
  /** X-WSTF-Program-Id header */
  programId?: string;
  /** X-WSTF-Caller header */
  caller?: string;
}

/**
 * Public key resolver function type
 * Given an address, returns the public key for signature verification
 */
export type PublicKeyResolver = (address: string) => Promise<crypto.KeyObject | null>;

/**
 * Service connector options
 */
export interface ConnectorOptions {
  /** Expected program ID for this service */
  programId: string;
  /** Function to resolve public keys from addresses */
  resolvePublicKey: PublicKeyResolver;
  /** Whether to require WSTFAuth (vs allowing header-based auth) */
  requireWSTFAuth?: boolean;
  /** Current time override (for testing) */
  nowSeconds?: number;
}

/**
 * Extract request context from HTTP headers
 */
export function extractRequestContext(headers: Record<string, string | undefined>): RequestContext {
  return {
    authorization: headers['authorization'] || headers['Authorization'],
    callId: headers['x-wstf-call-id'] || headers['X-WSTF-Call-Id'],
    programId: headers['x-wstf-program-id'] || headers['X-WSTF-Program-Id'],
    caller: headers['x-wstf-caller'] || headers['X-WSTF-Caller'],
  };
}

/**
 * Get signature algorithm from address
 */
function getSigAlgFromAddress(address: string): SigAlgId {
  try {
    const decoded = decodeAddress(address);
    return decoded.sigAlg;
  } catch {
    return SigAlgId.ED25519; // Default
  }
}

/**
 * Authorize a request using WSTFAuth token or header-based auth
 *
 * @param context - Request context from headers
 * @param options - Connector options
 * @returns Authorization result
 */
export async function authorizeRequest(
  context: RequestContext,
  options: ConnectorOptions
): Promise<AuthorizationResult> {
  const { programId, resolvePublicKey, requireWSTFAuth = false, nowSeconds } = options;

  // Check for Bearer token
  if (context.authorization?.startsWith('Bearer ')) {
    const token = context.authorization.slice(7);
    return authorizeWithToken(token, programId, resolvePublicKey, nowSeconds);
  }

  // Check for WSTF token
  if (context.authorization?.startsWith('WSTF ')) {
    const token = context.authorization.slice(5);
    return authorizeWithToken(token, programId, resolvePublicKey, nowSeconds);
  }

  // Header-based auth (from Instruction Runner)
  if (!requireWSTFAuth && context.caller && context.programId) {
    // Validate program ID matches
    if (context.programId !== programId) {
      return {
        authorized: false,
        error: `Program ID mismatch: expected ${programId}, got ${context.programId}`,
        code: 'PROGRAM_MISMATCH',
      };
    }

    return {
      authorized: true,
      caller: context.caller,
      programId: context.programId,
    };
  }

  return {
    authorized: false,
    error: 'No valid authorization found',
    code: 'NO_TOKEN',
  };
}

/**
 * Authorize using WSTFAuth token
 */
async function authorizeWithToken(
  token: string,
  expectedProgramId: string,
  resolvePublicKey: PublicKeyResolver,
  nowSeconds?: number
): Promise<AuthorizationResult> {
  // Parse token to get subject address
  const parsed = parseToken(token);
  if (!parsed) {
    return {
      authorized: false,
      error: 'Invalid token format',
      code: 'INVALID_FORMAT',
    };
  }

  const { sub: callerAddress, aud: tokenProgramId } = parsed.payload;

  // Check program ID matches
  if (tokenProgramId !== expectedProgramId) {
    return {
      authorized: false,
      error: `Wrong audience: expected ${expectedProgramId}, got ${tokenProgramId}`,
      code: 'WRONG_AUDIENCE',
    };
  }

  // Resolve public key for the caller
  const publicKey = await resolvePublicKey(callerAddress);
  if (!publicKey) {
    return {
      authorized: false,
      caller: callerAddress,
      programId: tokenProgramId,
      error: 'Could not resolve public key for address',
      code: 'PUBKEY_FETCH_FAILED',
    };
  }

  // Get signature algorithm from address
  const sigAlg = getSigAlgFromAddress(callerAddress);

  // Validate token
  const validation = validateToken(token, publicKey, sigAlg, expectedProgramId, nowSeconds);
  if (!validation.valid) {
    return {
      authorized: false,
      caller: callerAddress,
      programId: tokenProgramId,
      error: validation.error,
      code: validation.code,
    };
  }

  return {
    authorized: true,
    caller: callerAddress,
    programId: tokenProgramId,
    payload: validation.payload,
  };
}

/**
 * "Closed Box" Secure Context
 * 
 * Securely gates access to sensitive variables and environment data.
 */
export class SecureContext {
  private secrets = new Map<string, any>();

  constructor(private authorizedCallers?: string[]) { }

  /**
   * Set a secret in the closed box
   */
  setSecret(key: string, value: any) {
    this.secrets.set(key, value);
  }

  /**
   * Access a secret if the caller is authorized
   */
  getSecret(caller: string, key: string): any {
    if (this.authorizedCallers && !this.authorizedCallers.includes(caller)) {
      throw new Error(`Caller ${caller} is not authorized to access secrets`);
    }
    return this.secrets.get(key);
  }

  /**
   * Run an action with full access to secrets
   */
  async runWithSecrets(caller: string, action: (secrets: Map<string, any>) => Promise<any>): Promise<any> {
    if (this.authorizedCallers && !this.authorizedCallers.includes(caller)) {
      throw new Error(`Unauthorized access by ${caller}`);
    }
    return action(new Map(this.secrets));
  }
}

/**
 * Standardized Method Request Handler
 */
export async function handleStandardRequest(
  methodId: number,
  caller: string,
  data: any,
  context: SecureContext
): Promise<ServiceResponse> {
  // Logic to route based on methodId (0x70, 0x71, etc.)
  // This would be customized by the specific RPC implementation
  return successResponse({ methodId, caller, processedAt: Date.now() });
}

/**
 * Create an in-memory public key cache
 */
export function createPublicKeyCache(
  fetchKey: PublicKeyResolver,
  ttlMs: number = 60000
): PublicKeyResolver {
  const cache = new Map<string, { key: crypto.KeyObject; expiresAt: number }>();

  return async (address: string): Promise<crypto.KeyObject | null> => {
    const now = Date.now();
    const cached = cache.get(address);

    if (cached && cached.expiresAt > now) {
      return cached.key;
    }

    const key = await fetchKey(address);
    if (key) {
      cache.set(address, { key, expiresAt: now + ttlMs });
    } else {
      cache.delete(address);
    }

    return key;
  };
}

/**
 * Create a mock public key resolver for testing
 */
export function createMockKeyResolver(
  keys: Map<string, crypto.KeyObject>
): PublicKeyResolver {
  return async (address: string) => keys.get(address) ?? null;
}

/**
 * Response builder for consistent error responses
 */
export interface ServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Create a success response
 */
export function successResponse<T>(data: T): ServiceResponse<T> {
  return { success: true, data };
}

/**
 * Create an error response
 */
export function errorResponse(error: string, code?: string): ServiceResponse {
  return { success: false, error, code };
}

/**
 * Create an auth error response
 */
export function authErrorResponse(result: AuthorizationResult): ServiceResponse {
  return {
    success: false,
    error: result.error ?? 'Unauthorized',
    code: result.code ?? 'UNAUTHORIZED',
  };
}

/**
 * Hash response data for verification
 */
export function hashResponse(data: Buffer | string): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return '0x' + crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Service metadata for discovery
 */
export interface ServiceMetadata {
  programId: string;
  name: string;
  version: string;
  description?: string;
  endpoints: EndpointMetadata[];
}

/**
 * Endpoint metadata
 */
export interface EndpointMetadata {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description?: string;
  requiresAuth: boolean;
}

/**
 * Create service metadata
 */
export function createServiceMetadata(
  programId: string,
  name: string,
  version: string,
  endpoints: EndpointMetadata[],
  description?: string
): ServiceMetadata {
  return { programId, name, version, description, endpoints };
}
