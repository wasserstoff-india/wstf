/**
 * Health Service Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HealthService } from './health';

describe('HealthService', () => {
  let health: HealthService;

  beforeEach(() => {
    health = new HealthService('1.0.0');
  });

  it('should report healthy with no checks', async () => {
    const result = await health.getHealth();
    expect(result.status).toBe('healthy');
    expect(result.version).toBe('1.0.0');
  });

  it('should register and run health checks', async () => {
    health.register('test', async () => ({ healthy: true, message: 'OK' }));

    const result = await health.getHealth();
    expect(result.components.length).toBe(1);
    expect(result.components[0].name).toBe('test');
    expect(result.components[0].status).toBe('healthy');
  });

  it('should report degraded when non-critical check fails', async () => {
    health.register('test', async () => ({ healthy: false, message: 'Error' }), false);

    // Run checks multiple times to exceed failure threshold
    await health.getHealth();
    await health.getHealth();
    await health.getHealth();

    const result = await health.getHealth();
    expect(result.status).toBe('degraded');
  });

  it('should report unhealthy when critical check fails', async () => {
    health.register('critical', async () => ({ healthy: false, message: 'Critical failure' }), true);

    // Run checks multiple times to exceed failure threshold
    for (let i = 0; i < 4; i++) {
      await health.getHealth();
    }

    const result = await health.getHealth();
    expect(result.status).toBe('unhealthy');
  });

  it('should return readiness status', async () => {
    health.register('db', async () => ({ healthy: true }));

    const readiness = await health.getReadiness();
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.length).toBe(1);
  });

  it('should always return alive for liveness', () => {
    const liveness = health.getLiveness();
    expect(liveness.alive).toBe(true);
    expect(liveness.timestamp).toBeGreaterThan(0);
  });

  it('should track uptime', async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    const result = await health.getHealth();
    expect(result.uptime).toBeGreaterThan(0);
  });

  it('should unregister checks', async () => {
    health.register('test', async () => ({ healthy: true }));
    health.unregister('test');

    const result = await health.getHealth();
    expect(result.components.length).toBe(0);
  });

  it('should return cached health without running checks', async () => {
    health.register('test', async () => ({ healthy: true, message: 'OK' }));

    // Run once to populate cache
    await health.getHealth();

    // Get cached without running
    const cached = health.getCachedHealth();
    expect(cached.components.length).toBe(1);
  });
});
