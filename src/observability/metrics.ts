/**
 * Metrics Service - Simple metrics collection
 *
 * Provides counters, gauges, and histograms for observability.
 */
import { MetricsSnapshot, HistogramSnapshot } from './types';

/**
 * Counter - monotonically increasing value
 */
export class Counter {
  private value: number = 0;

  inc(amount: number = 1): void {
    this.value += amount;
  }

  get(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

/**
 * Gauge - value that can go up or down
 */
export class Gauge {
  private value: number = 0;

  set(value: number): void {
    this.value = value;
  }

  inc(amount: number = 1): void {
    this.value += amount;
  }

  dec(amount: number = 1): void {
    this.value -= amount;
  }

  get(): number {
    return this.value;
  }
}

/**
 * Histogram - distribution of values
 */
export class Histogram {
  private values: number[] = [];
  private maxSamples: number;

  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
  }

  observe(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSamples) {
      this.values.shift();
    }
  }

  getSnapshot(): HistogramSnapshot {
    if (this.values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      sum,
      min: sorted[0],
      max: sorted[count - 1],
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  reset(): void {
    this.values = [];
  }
}

/**
 * Timer - convenience wrapper for timing operations
 */
export class Timer {
  private histogram: Histogram;

  constructor(histogram: Histogram) {
    this.histogram = histogram;
  }

  time<T>(fn: () => T): T {
    const start = Date.now();
    try {
      return fn();
    } finally {
      this.histogram.observe(Date.now() - start);
    }
  }

  async timeAsync<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.histogram.observe(Date.now() - start);
    }
  }

  startTimer(): () => number {
    const start = Date.now();
    return () => {
      const elapsed = Date.now() - start;
      this.histogram.observe(elapsed);
      return elapsed;
    };
  }
}

/**
 * Metrics Registry
 */
export class MetricsRegistry {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  /**
   * Get or create a counter
   */
  counter(name: string): Counter {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = new Counter();
      this.counters.set(name, counter);
    }
    return counter;
  }

  /**
   * Get or create a gauge
   */
  gauge(name: string): Gauge {
    let gauge = this.gauges.get(name);
    if (!gauge) {
      gauge = new Gauge();
      this.gauges.set(name, gauge);
    }
    return gauge;
  }

  /**
   * Get or create a histogram
   */
  histogram(name: string, maxSamples: number = 1000): Histogram {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = new Histogram(maxSamples);
      this.histograms.set(name, histogram);
    }
    return histogram;
  }

  /**
   * Create a timer for a histogram
   */
  timer(name: string): Timer {
    return new Timer(this.histogram(name));
  }

  /**
   * Get metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const countersObj: Record<string, number> = {};
    const gaugesObj: Record<string, number> = {};
    const histogramsObj: Record<string, HistogramSnapshot> = {};

    for (const [name, counter] of this.counters) {
      countersObj[name] = counter.get();
    }

    for (const [name, gauge] of this.gauges) {
      gaugesObj[name] = gauge.get();
    }

    for (const [name, histogram] of this.histograms) {
      histogramsObj[name] = histogram.getSnapshot();
    }

    return {
      timestamp: Date.now(),
      counters: countersObj,
      gauges: gaugesObj,
      histograms: histogramsObj,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.reset();
    }
    for (const gauge of this.gauges.values()) {
      gauge.set(0);
    }
    for (const histogram of this.histograms.values()) {
      histogram.reset();
    }
  }

  /**
   * Get Prometheus-style text output
   */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const [name, counter] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${counter.get()}`);
    }

    for (const [name, gauge] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${gauge.get()}`);
    }

    for (const [name, histogram] of this.histograms) {
      const snap = histogram.getSnapshot();
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_count ${snap.count}`);
      lines.push(`${name}_sum ${snap.sum}`);
      lines.push(`${name}_p50 ${snap.p50}`);
      lines.push(`${name}_p95 ${snap.p95}`);
      lines.push(`${name}_p99 ${snap.p99}`);
    }

    return lines.join('\n');
  }
}

/**
 * Global metrics registry
 */
export const globalMetrics = new MetricsRegistry();
