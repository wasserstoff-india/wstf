/**
 * Load generator: workers generating txs/programs
 */
import crypto from 'crypto';
import { BenchConfig, BenchMode, LatencyMeasurement, BenchResults } from './types';
import { MetricsCollector } from './metrics';

/**
 * Generate a basic transaction (v1)
 */
function generateBasicTx(from: string, nonce: number): any {
  return {
    version: 1,
    from,
    nonce,
    payloadHash: '00'.repeat(32),
    signatureHex: crypto.randomBytes(64).toString('hex'),
    integrityHash: crypto.randomBytes(32).toString('hex')
  };
}

/**
 * Generate a small v2 transaction (1-3 instructions)
 */
function generateV2Small(from: string, nonce: number): any {
  const stateId = crypto.randomBytes(32).toString('hex');

  const program = [
    {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'REG',
      args: { stateId, type: 'test', owner: from }
    },
    {
      creator: 'sys',
      moduleId: 'SYS',
      method: 'INIT',
      args: {
        stateId,
        expectedVersion: '00'.repeat(32),
        data: { key1: 'value1', key2: 'value2' }
      }
    }
  ];

  return {
    version: 2,
    from,
    nonce,
    programHex: Buffer.from(JSON.stringify(program)).toString('hex'), // Simplified
    reads: [],
    locks: [],
    signatureHex: crypto.randomBytes(64).toString('hex'),
    integrityHash: crypto.randomBytes(32).toString('hex')
  };
}

/**
 * Generate a heavy v2 transaction (10-50 instructions)
 */
function generateV2Heavy(from: string, nonce: number): any {
  const instructions: any[] = [];

  // Generate 20 instructions (mix of REG and UPDATE)
  for (let i = 0; i < 20; i++) {
    const stateId = crypto.randomBytes(32).toString('hex');

    if (i % 2 === 0) {
      instructions.push({
        creator: 'sys',
        moduleId: 'SYS',
        method: 'REG',
        args: { stateId, type: 'heavy', owner: from }
      });
    } else {
      instructions.push({
        creator: 'sys',
        moduleId: 'SYS',
        method: 'UPDATE',
        args: {
          stateId: instructions[i - 1].args.stateId,
          expectedVersion: '00'.repeat(32),
          patch: {
            op: 'put',
            kv: Array.from({ length: 10 }, (_, j) => [`key${j}`, `value${j}`])
          }
        }
      });
    }
  }

  return {
    version: 2,
    from,
    nonce,
    programHex: Buffer.from(JSON.stringify(instructions)).toString('hex'),
    reads: [],
    locks: [],
    signatureHex: crypto.randomBytes(64).toString('hex'),
    integrityHash: crypto.randomBytes(32).toString('hex')
  };
}

/**
 * Generate a transaction based on type
 */
function generateTx(type: string, from: string, nonce: number): any {
  switch (type) {
    case 'basic-v1':
      return generateBasicTx(from, nonce);
    case 'v2-small':
      return generateV2Small(from, nonce);
    case 'v2-heavy':
      return generateV2Heavy(from, nonce);
    default:
      return generateBasicTx(from, nonce);
  }
}

/**
 * Submit a transaction to a target
 */
async function submitTx(target: string, endpoint: string, tx: any): Promise<{ ok: boolean; code?: string; latency: number }> {
  const start = Date.now();

  try {
    const response = await fetch(`${target}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx })
    });

    const latency = Date.now() - start;
    const result = await response.json() as { ok?: boolean; code?: string };

    return {
      ok: result.ok || false,
      code: result.code,
      latency
    };
  } catch (e: any) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      latency: Date.now() - start
    };
  }
}

/**
 * Worker: generate and submit transactions
 */
async function worker(
  workerId: number,
  config: BenchConfig,
  measurements: LatencyMeasurement[],
  results: { success: number; failure: number; errors: Map<string, number> }
): Promise<void> {
  const { scenario, targets, mode } = config;
  const from = `gc1bench${workerId}`;
  let nonce = 1;

  // Determine tx type for this worker
  let txType = scenario.txType;
  if (txType === 'mix' && scenario.distribution) {
    const rand = Math.random();
    if (rand < scenario.distribution['basic-v1']!) {
      txType = 'basic-v1';
    } else if (rand < scenario.distribution['basic-v1']! + scenario.distribution['v2-small']!) {
      txType = 'v2-small';
    } else {
      txType = 'v2-heavy';
    }
  }

  // Generate tx
  const tx = generateTx(txType, from, nonce++);
  const txId = tx.integrityHash;

  // Submit based on mode
  const target = targets[0]; // Simplified: use first target
  const submittedAt = Date.now();

  const submitResult = await submitTx(target.url, target.endpoint, tx);

  const measurement: LatencyMeasurement = {
    txId,
    submittedAt,
    acceptedAt: submitResult.ok ? Date.now() : undefined,
    submitToAccept: submitResult.ok ? submitResult.latency : undefined,
    endToEnd: submitResult.latency
  };

  measurements.push(measurement);

  if (submitResult.ok) {
    results.success++;
  } else {
    results.failure++;
    const code = submitResult.code || 'UNKNOWN';
    results.errors.set(code, (results.errors.get(code) || 0) + 1);
  }
}

/**
 * Run load generator
 */
export async function runLoadGen(config: BenchConfig): Promise<BenchResults> {
  console.log(`[loadgen] Starting benchmark: ${config.scenario.name}`);
  console.log(`[loadgen] Mode: ${config.mode}, Duration: ${config.duration}s, Concurrency: ${config.scenario.concurrency}`);

  const measurements: LatencyMeasurement[] = [];
  const results = {
    success: 0,
    failure: 0,
    errors: new Map<string, number>()
  };

  const metricsCollector = new MetricsCollector();
  const startTime = Date.now();
  const endTime = startTime + config.duration * 1000;

  // Warmup
  if (config.warmup) {
    console.log(`[loadgen] Warming up for ${config.warmup}s...`);
    await new Promise(resolve => setTimeout(resolve, config.warmup! * 1000));
  }

  console.log('[loadgen] Starting load generation...');

  // Generate load
  const workers: Promise<void>[] = [];
  const txPerWorker = Math.ceil(config.scenario.txCount / config.scenario.concurrency);

  for (let i = 0; i < config.scenario.concurrency; i++) {
    for (let j = 0; j < txPerWorker; j++) {
      if (Date.now() >= endTime) {
        break;
      }

      workers.push(worker(i, config, measurements, results));

      // Rate limiting
      if (config.scenario.rateLimit) {
        const delayMs = (1000 / config.scenario.rateLimit) * config.scenario.concurrency;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    if (Date.now() >= endTime) {
      break;
    }
  }

  await Promise.all(workers);

  const actualDuration = (Date.now() - startTime) / 1000;

  console.log(`[loadgen] Load generation complete. Duration: ${actualDuration.toFixed(2)}s`);
  console.log(`[loadgen] Success: ${results.success}, Failure: ${results.failure}`);

  // Compute results
  const submitTps = results.success / actualDuration;

  // Compute latency percentiles
  const submitToAcceptLatencies = measurements
    .filter(m => m.submitToAccept !== undefined)
    .map(m => m.submitToAccept!);

  const endToEndLatencies = measurements
    .filter(m => m.endToEnd !== undefined)
    .map(m => m.endToEnd!);

  const getPercentile = (values: number[], p: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };

  const benchResults: BenchResults = {
    scenario: config.scenario.name,
    mode: config.mode,
    duration: actualDuration,

    submitTps,

    latency: {
      submitToAccept: {
        p50: getPercentile(submitToAcceptLatencies, 50),
        p95: getPercentile(submitToAcceptLatencies, 95),
        p99: getPercentile(submitToAcceptLatencies, 99)
      },
      endToEnd: {
        p50: getPercentile(endToEndLatencies, 50),
        p95: getPercentile(endToEndLatencies, 95),
        p99: getPercentile(endToEndLatencies, 99)
      }
    },

    errors: {
      total: results.failure,
      byCode: Object.fromEntries(results.errors)
    },

    resources: {
      memoryPeakMb: 0, // TODO: Collect from services
      cpuAvgPercent: 0,
      eventLoopLagP95Ms: 0
    },

    txCount: measurements.length,
    successCount: results.success,
    failureCount: results.failure
  };

  return benchResults;
}
