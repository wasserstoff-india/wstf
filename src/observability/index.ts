/**
 * Observability Module - Health checks, metrics, and diagnostics
 */

export {
  HealthStatus,
  ComponentHealth,
  HealthResponse,
  ReadinessResponse,
  ReadinessCheck,
  LivenessResponse,
  MetricsSnapshot,
  HistogramSnapshot,
  HealthCheckConfig,
  HealthCheckFn,
  DEFAULT_HEALTH_CONFIG,
} from './types';

export {
  HealthService,
  createStandardChecks,
} from './health';

export {
  Counter,
  Gauge,
  Histogram,
  Timer,
  MetricsRegistry,
  globalMetrics,
} from './metrics';

export {
  ObservabilityOptions,
  registerObservabilityRoutes,
  createObservabilityServer,
} from './endpoints';
