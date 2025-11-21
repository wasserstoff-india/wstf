/**
 * Observability Types - Health checks, metrics, and diagnostics
 */

/**
 * Health status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Component health check result
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
  lastCheck: number;
}

/**
 * Overall health response
 */
export interface HealthResponse {
  status: HealthStatus;
  version: string;
  uptime: number;
  timestamp: number;
  components: ComponentHealth[];
}

/**
 * Readiness check result
 */
export interface ReadinessResponse {
  ready: boolean;
  checks: ReadinessCheck[];
}

export interface ReadinessCheck {
  name: string;
  ready: boolean;
  message?: string;
}

/**
 * Liveness check result
 */
export interface LivenessResponse {
  alive: boolean;
  timestamp: number;
}

/**
 * Metrics snapshot
 */
export interface MetricsSnapshot {
  timestamp: number;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSnapshot>;
}

export interface HistogramSnapshot {
  count: number;
  sum: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Check interval in ms */
  intervalMs: number;
  /** Timeout for each check in ms */
  timeoutMs: number;
  /** Number of failures before marking unhealthy */
  failureThreshold: number;
  /** Number of successes before marking healthy */
  successThreshold: number;
}

export const DEFAULT_HEALTH_CONFIG: HealthCheckConfig = {
  intervalMs: 10000,
  timeoutMs: 5000,
  failureThreshold: 3,
  successThreshold: 1,
};

/**
 * Health check function type
 */
export type HealthCheckFn = () => Promise<{ healthy: boolean; message?: string }>;
