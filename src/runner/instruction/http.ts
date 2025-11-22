/**
 * HTTP Runner
 *
 * Executes HTTP requests to external APIs in response to CALL_LOCAL events.
 * Includes security features like domain allowlisting.
 */

import crypto from 'crypto';
import {
  ProgramConfig,
  CallRequest,
  ExecutionResult,
} from './types';

/**
 * Execute an HTTP request
 */
export async function executeHttp(
  request: CallRequest,
  config: ProgramConfig
): Promise<ExecutionResult> {
  const startTime = Date.now();

  if (!config.urlTemplate) {
    return {
      callId: request.callId,
      programId: request.programId,
      status: 'error',
      responseHash: '0x' + '0'.repeat(64),
      errorMessage: 'No URL template configured for HTTP runner',
      durationMs: Date.now() - startTime,
    };
  }

  // Build URL with template substitution
  let url = config.urlTemplate
    .replace('{callId}', request.callId)
    .replace('{programId}', request.programId)
    .replace('{caller}', request.caller);

  // Validate domain
  try {
    const urlObj = new URL(url);
    if (config.allowedDomains && config.allowedDomains.length > 0) {
      if (!config.allowedDomains.includes(urlObj.hostname)) {
        return {
          callId: request.callId,
          programId: request.programId,
          status: 'error',
          responseHash: '0x' + '0'.repeat(64),
          errorMessage: `Domain ${urlObj.hostname} not in allowlist`,
          durationMs: Date.now() - startTime,
        };
      }
    }
  } catch {
    return {
      callId: request.callId,
      programId: request.programId,
      status: 'error',
      responseHash: '0x' + '0'.repeat(64),
      errorMessage: `Invalid URL: ${url}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Setup abort controller for timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.limits.timeoutMs);

  try {
    // Build request options
    const method = config.method || 'POST';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-WSTF-Call-Id': request.callId,
      'X-WSTF-Program-Id': request.programId,
      'X-WSTF-Caller': request.caller,
      ...config.headers,
    };

    // Build body
    let body: string | undefined;
    if (method !== 'GET') {
      body = JSON.stringify({
        callId: request.callId,
        programId: request.programId,
        caller: request.caller,
        payload: request.payload,
        txId: request.txId,
        blockHeight: request.blockHeight.toString(),
        timestamp: request.timestamp,
      });
    }

    // Make request
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;

    // Read response
    const responseBuffer = Buffer.from(await response.arrayBuffer());

    // Truncate if too large
    const truncatedResponse = responseBuffer.length > config.limits.maxResponseBytes
      ? responseBuffer.slice(0, config.limits.maxResponseBytes)
      : responseBuffer;

    const responseHash = crypto.createHash('sha256')
      .update(truncatedResponse)
      .digest('hex');

    if (response.ok) {
      return {
        callId: request.callId,
        programId: request.programId,
        status: 'ok',
        response: truncatedResponse,
        responseHash: `0x${responseHash}`,
        durationMs,
        httpStatus: response.status,
      };
    } else {
      return {
        callId: request.callId,
        programId: request.programId,
        status: 'error',
        responseHash: `0x${responseHash}`,
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
        durationMs,
        httpStatus: response.status,
      };
    }
  } catch (err: any) {
    clearTimeout(timeout);

    const isTimeout = err.name === 'AbortError';
    return {
      callId: request.callId,
      programId: request.programId,
      status: 'error',
      responseHash: '0x' + '0'.repeat(64),
      errorMessage: isTimeout
        ? `Timeout after ${config.limits.timeoutMs}ms`
        : `HTTP error: ${err.message}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Validate HTTP program config
 */
export function validateHttpConfig(config: ProgramConfig): {
  valid: boolean;
  error?: string;
} {
  if (config.runner !== 'http') {
    return { valid: false, error: 'Not an HTTP runner config' };
  }

  if (!config.urlTemplate) {
    return { valid: false, error: 'urlTemplate is required for HTTP runner' };
  }

  try {
    // Validate URL template is parseable (with dummy substitutions)
    const testUrl = config.urlTemplate
      .replace('{callId}', 'test')
      .replace('{programId}', 'test')
      .replace('{caller}', 'test');
    new URL(testUrl);
  } catch {
    return { valid: false, error: 'Invalid URL template' };
  }

  if (!config.limits) {
    return { valid: false, error: 'limits is required' };
  }

  if (config.limits.timeoutMs <= 0) {
    return { valid: false, error: 'timeoutMs must be positive' };
  }

  // Security: require allowedDomains
  if (!config.allowedDomains || config.allowedDomains.length === 0) {
    return { valid: false, error: 'allowedDomains is required for HTTP runner' };
  }

  return { valid: true };
}
