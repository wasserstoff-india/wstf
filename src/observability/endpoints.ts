/**
 * Observability HTTP Endpoints
 *
 * Provides standard endpoints: /health, /readyz, /livez, /metrics
 */
import { FastifyInstance } from 'fastify';
import { HealthService } from './health';
import { MetricsRegistry, globalMetrics } from './metrics';

/**
 * Options for observability routes
 */
export interface ObservabilityOptions {
  health: HealthService;
  metrics?: MetricsRegistry;
  prefix?: string;
}

/**
 * Register observability routes on a Fastify instance
 */
export async function registerObservabilityRoutes(
  app: FastifyInstance,
  options: ObservabilityOptions
): Promise<void> {
  const prefix = options.prefix || '';
  const metrics = options.metrics || globalMetrics;

  // Health endpoint - detailed health check
  app.get(`${prefix}/health`, async (request, reply) => {
    const health = await options.health.getHealth();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    return reply.code(statusCode).send(health);
  });

  // Readiness probe - is the service ready to accept traffic?
  app.get(`${prefix}/readyz`, async (request, reply) => {
    const readiness = await options.health.getReadiness();
    return reply.code(readiness.ready ? 200 : 503).send(readiness);
  });

  // Liveness probe - is the service alive?
  app.get(`${prefix}/livez`, async (request, reply) => {
    const liveness = options.health.getLiveness();
    return reply.code(200).send(liveness);
  });

  // Metrics endpoint - Prometheus format
  app.get(`${prefix}/metrics`, async (request, reply) => {
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .send(metrics.toPrometheus());
  });

  // Metrics endpoint - JSON format
  app.get(`${prefix}/metrics/json`, async (request, reply) => {
    return reply.send(metrics.getSnapshot());
  });
}

/**
 * Create a standalone observability server
 */
export async function createObservabilityServer(
  port: number,
  health: HealthService,
  metrics?: MetricsRegistry
): Promise<FastifyInstance> {
  const { default: Fastify } = await import('fastify');
  const app = Fastify({ logger: false });

  await registerObservabilityRoutes(app, { health, metrics });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[observability] Server listening on port ${port}`);

  return app;
}
