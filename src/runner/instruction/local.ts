/**
 * Local Process Runner
 *
 * Executes local programs (CLI tools) in response to CALL_LOCAL events.
 * Handles process spawning, timeout, and output capture.
 */

import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import {
  ProgramConfig,
  CallRequest,
  ExecutionResult,
} from './types';

/**
 * Execute a local program
 */
export async function executeLocal(
  request: CallRequest,
  config: ProgramConfig
): Promise<ExecutionResult> {
  const startTime = Date.now();

  if (!config.cmd || config.cmd.length === 0) {
    return {
      callId: request.callId,
      programId: request.programId,
      status: 'error',
      responseHash: '0x' + '0'.repeat(64),
      errorMessage: 'No command configured for local runner',
      durationMs: Date.now() - startTime,
    };
  }

  return new Promise((resolve) => {
    const [command, ...args] = config.cmd!;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let finished = false;

    // Spawn process
    const child: ChildProcess = spawn(command, args, {
      cwd: config.cwd,
      env: {
        ...process.env,
        ...config.env,
        // Pass call context as env vars
        WSTF_CALL_ID: request.callId,
        WSTF_PROGRAM_ID: request.programId,
        WSTF_CALLER: request.caller,
        WSTF_PAYLOAD: request.payload,
        WSTF_TX_ID: request.txId,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Timeout handler
    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        child.kill('SIGKILL');
        resolve({
          callId: request.callId,
          programId: request.programId,
          status: 'error',
          responseHash: '0x' + '0'.repeat(64),
          errorMessage: `Timeout after ${config.limits.timeoutMs}ms`,
          durationMs: Date.now() - startTime,
        });
      }
    }, config.limits.timeoutMs);

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
      if (stdout.length + data.length <= config.limits.maxResponseBytes) {
        stdout = Buffer.concat([stdout, data]);
      }
    });

    // Capture stderr
    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length + data.length <= 4096) {
        stderr = Buffer.concat([stderr, data]);
      }
    });

    // Write payload to stdin (ignore EPIPE if process exits before write)
    if (request.payload && request.payload !== '0x') {
      const payloadBuffer = Buffer.from(request.payload.slice(2), 'hex');
      child.stdin?.on('error', () => {}); // Ignore write errors
      child.stdin?.write(payloadBuffer);
    }
    child.stdin?.on('error', () => {}); // Ignore close errors
    child.stdin?.end();

    // Handle process exit
    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);

      const durationMs = Date.now() - startTime;
      const responseHash = crypto.createHash('sha256')
        .update(stdout)
        .digest('hex');

      if (code === 0) {
        resolve({
          callId: request.callId,
          programId: request.programId,
          status: 'ok',
          response: stdout,
          responseHash: `0x${responseHash}`,
          durationMs,
          exitCode: code,
        });
      } else {
        resolve({
          callId: request.callId,
          programId: request.programId,
          status: 'error',
          responseHash: `0x${responseHash}`,
          errorMessage: stderr.toString('utf8') || `Exit code ${code}`,
          durationMs,
          exitCode: code ?? undefined,
        });
      }
    });

    // Handle spawn errors
    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);

      resolve({
        callId: request.callId,
        programId: request.programId,
        status: 'error',
        responseHash: '0x' + '0'.repeat(64),
        errorMessage: `Spawn error: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Validate local program config
 */
export function validateLocalConfig(config: ProgramConfig): {
  valid: boolean;
  error?: string;
} {
  if (config.runner !== 'local') {
    return { valid: false, error: 'Not a local runner config' };
  }

  if (!config.cmd || config.cmd.length === 0) {
    return { valid: false, error: 'cmd is required for local runner' };
  }

  if (!config.limits) {
    return { valid: false, error: 'limits is required' };
  }

  if (config.limits.timeoutMs <= 0) {
    return { valid: false, error: 'timeoutMs must be positive' };
  }

  return { valid: true };
}
