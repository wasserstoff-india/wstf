/**
 * Metrics collector and aggregator
 */
import { ServiceMetrics } from './types';

/**
 * Simple in-memory metrics store
 */
export class MetricsStore {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(key: string, value = 1): void {
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  recordValue(key: string, value: number): void {
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
  }

  getCounter(key: string): number {
    return this.counters.get(key) || 0;
  }

  getPercentile(key: string, percentile: number): number {
    const values = this.histograms.get(key);
    if (!values || values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = {};

    // Add counters
    for (const [key, value] of this.counters.entries()) {
      result[key] = value;
    }

    // Add histogram percentiles
    for (const [key, values] of this.histograms.entries()) {
      if (values.length > 0) {
        result[`${key}_p50`] = this.getPercentile(key, 50);
        result[`${key}_p95`] = this.getPercentile(key, 95);
        result[`${key}_p99`] = this.getPercentile(key, 99);
        result[`${key}_count`] = values.length;
      }
    }

    return result;
  }

  clear(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}

/**
 * Global metrics instance for each service
 */
export const globalMetrics = new MetricsStore();

/**
 * Metrics collector (polls service /metrics endpoints)
 */
export class MetricsCollector {
  private snapshots: ServiceMetrics[] = [];

  async collect(serviceUrl: string, serviceName: string): Promise<ServiceMetrics | null> {
    try {
      const response = await fetch(`${serviceUrl}/metrics`);
      if (!response.ok) {
        return null;
      }

      const metrics = await response.json();

      const snapshot: ServiceMetrics = {
        service: serviceName,
        timestamp: Date.now(),
        metrics
      };

      this.snapshots.push(snapshot);
      return snapshot;
    } catch (e) {
      return null;
    }
  }

  getSnapshots(): ServiceMetrics[] {
    return this.snapshots;
  }

  getDelta(metric: string, startTime: number, endTime: number): number {
    const snapshots = this.snapshots.filter(
      s => s.timestamp >= startTime && s.timestamp <= endTime
    );

    if (snapshots.length < 2) {
      return 0;
    }

    const first = snapshots[0].metrics[metric as keyof ServiceMetrics['metrics']] || 0;
    const last = snapshots[snapshots.length - 1].metrics[metric as keyof ServiceMetrics['metrics']] || 0;

    return (last as number) - (first as number);
  }

  clear(): void {
    this.snapshots = [];
  }
}

/**
 * Process metrics (memory, CPU, event loop)
 */
export function getProcessMetrics(): {
  memory_rss_mb: number;
  cpu_percent: number;
  event_loop_lag_ms: number;
} {
  const mem = process.memoryUsage();

  return {
    memory_rss_mb: Math.round(mem.rss / 1024 / 1024),
    cpu_percent: 0, // TODO: Implement CPU tracking
    event_loop_lag_ms: 0 // TODO: Implement event loop lag tracking
  };
}
