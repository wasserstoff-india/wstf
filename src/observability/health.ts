/**
 * Health Check Service
 *
 * Provides /health, /readyz, and /livez endpoints for Kubernetes-style probes.
 */
import {
  HealthStatus,
  ComponentHealth,
  HealthResponse,
  ReadinessResponse,
  ReadinessCheck,
  LivenessResponse,
  HealthCheckConfig,
  HealthCheckFn,
  DEFAULT_HEALTH_CONFIG,
} from './types';

/**
 * Health check registry entry
 */
interface RegisteredCheck {
  name: string;
  check: HealthCheckFn;
  critical: boolean; // If critical check fails, overall status is unhealthy
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastResult?: ComponentHealth;
}

/**
 * Health Check Service
 */
export class HealthService {
  private config: HealthCheckConfig;
  private checks: Map<RegisteredCheck['name'], RegisteredCheck> = new Map();
  private startTime: number;
  private version: string;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(version: string = '0.1.0', config: Partial<HealthCheckConfig> = {}) {
    this.version = version;
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Register a health check
   */
  register(name: string, check: HealthCheckFn, critical: boolean = false): void {
    this.checks.set(name, {
      name,
      check,
      critical,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    });
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Run a single health check
   */
  private async runCheck(entry: RegisteredCheck): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const timeoutPromise = new Promise<{ healthy: false; message: string }>((resolve) => {
        setTimeout(() => resolve({ healthy: false, message: 'Check timed out' }), this.config.timeoutMs);
      });

      const result = await Promise.race([entry.check(), timeoutPromise]);
      const latencyMs = Date.now() - start;

      if (result.healthy) {
        entry.consecutiveSuccesses++;
        entry.consecutiveFailures = 0;
      } else {
        entry.consecutiveFailures++;
        entry.consecutiveSuccesses = 0;
      }

      const status = this.determineStatus(entry, result.healthy);

      entry.lastResult = {
        name: entry.name,
        status,
        message: result.message,
        latencyMs,
        lastCheck: Date.now(),
      };

      return entry.lastResult;
    } catch (error) {
      entry.consecutiveFailures++;
      entry.consecutiveSuccesses = 0;
      const latencyMs = Date.now() - start;

      entry.lastResult = {
        name: entry.name,
        status: entry.consecutiveFailures >= this.config.failureThreshold ? 'unhealthy' : 'degraded',
        message: error instanceof Error ? error.message : 'Check failed',
        latencyMs,
        lastCheck: Date.now(),
      };

      return entry.lastResult;
    }
  }

  /**
   * Determine status based on thresholds
   */
  private determineStatus(entry: RegisteredCheck, currentlyHealthy: boolean): HealthStatus {
    if (currentlyHealthy && entry.consecutiveSuccesses >= this.config.successThreshold) {
      return 'healthy';
    }
    if (entry.consecutiveFailures >= this.config.failureThreshold) {
      return 'unhealthy';
    }
    if (entry.consecutiveFailures > 0) {
      return 'degraded';
    }
    return currentlyHealthy ? 'healthy' : 'degraded';
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<ComponentHealth[]> {
    const results: ComponentHealth[] = [];
    for (const entry of this.checks.values()) {
      results.push(await this.runCheck(entry));
    }
    return results;
  }

  /**
   * Get overall health status
   */
  async getHealth(): Promise<HealthResponse> {
    const components = await this.runAllChecks();

    // Determine overall status
    let overallStatus: HealthStatus = 'healthy';
    let hasCriticalFailure = false;

    for (const entry of this.checks.values()) {
      if (!entry.lastResult) continue;

      if (entry.critical && entry.lastResult.status === 'unhealthy') {
        hasCriticalFailure = true;
        break;
      }

      if (entry.lastResult.status === 'degraded' || entry.lastResult.status === 'unhealthy') {
        if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }
    }

    if (hasCriticalFailure) {
      overallStatus = 'unhealthy';
    }

    return {
      status: overallStatus,
      version: this.version,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
      components,
    };
  }

  /**
   * Get readiness status (is the service ready to accept traffic?)
   */
  async getReadiness(): Promise<ReadinessResponse> {
    const health = await this.getHealth();
    const checks: ReadinessCheck[] = health.components.map(c => ({
      name: c.name,
      ready: c.status !== 'unhealthy',
      message: c.message,
    }));

    return {
      ready: health.status !== 'unhealthy',
      checks,
    };
  }

  /**
   * Get liveness status (is the service alive?)
   */
  getLiveness(): LivenessResponse {
    // Liveness is always true if the process is running
    return {
      alive: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.runAllChecks().catch(err => {
        console.error('[health] Periodic check failed:', err);
      });
    }, this.config.intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Get cached results without running checks
   */
  getCachedHealth(): HealthResponse {
    const components: ComponentHealth[] = [];
    let overallStatus: HealthStatus = 'healthy';

    for (const entry of this.checks.values()) {
      if (entry.lastResult) {
        components.push(entry.lastResult);

        if (entry.critical && entry.lastResult.status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (entry.lastResult.status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } else {
        // No result yet - consider degraded
        components.push({
          name: entry.name,
          status: 'degraded',
          message: 'Not yet checked',
          lastCheck: 0,
        });
        if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }
    }

    return {
      status: overallStatus,
      version: this.version,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
      components,
    };
  }
}

/**
 * Create standard health checks for common components
 */
export function createStandardChecks() {
  return {
    memory: async (): Promise<{ healthy: boolean; message?: string }> => {
      const used = process.memoryUsage();
      const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
      const usage = used.heapUsed / used.heapTotal;

      if (usage > 0.95) {
        return { healthy: false, message: `Heap critical: ${heapUsedMB}MB / ${heapTotalMB}MB` };
      }
      if (usage > 0.8) {
        return { healthy: true, message: `Heap high: ${heapUsedMB}MB / ${heapTotalMB}MB` };
      }
      return { healthy: true, message: `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB` };
    },

    eventLoop: async (): Promise<{ healthy: boolean; message?: string }> => {
      const start = Date.now();
      return new Promise((resolve) => {
        setImmediate(() => {
          const lag = Date.now() - start;
          if (lag > 100) {
            resolve({ healthy: false, message: `Event loop lag: ${lag}ms` });
          } else if (lag > 50) {
            resolve({ healthy: true, message: `Event loop lag: ${lag}ms (elevated)` });
          } else {
            resolve({ healthy: true, message: `Event loop lag: ${lag}ms` });
          }
        });
      });
    },
  };
}
