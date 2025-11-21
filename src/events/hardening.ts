/**
 * SSE Hardening Module
 *
 * Provides rate limiting, connection management, and graceful degradation
 * for the SSE service.
 */
import { EventEmitter } from 'events';

/**
 * Rate limiter for event emission
 */
export interface RateLimitConfig {
  /** Max events per second per client */
  maxEventsPerSecond: number;
  /** Max events per second global */
  maxGlobalEventsPerSecond: number;
  /** Burst allowance (tokens) */
  burstAllowance: number;
  /** Token refill rate (per second) */
  refillRate: number;
}

/**
 * Default rate limit config
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxEventsPerSecond: 100,
  maxGlobalEventsPerSecond: 10000,
  burstAllowance: 50,
  refillRate: 100,
};

/**
 * Token bucket for rate limiting
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number;

  constructor(maxTokens: number, refillRate: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token
   */
  consume(count: number = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Connection health tracker
 */
export interface ConnectionHealth {
  clientId: string;
  connectedAt: number;
  lastActivity: number;
  eventsSent: number;
  eventsDropped: number;
  writeErrors: number;
  latencyMs: number[];
  healthy: boolean;
}

/**
 * Connection manager with health tracking
 */
export class ConnectionManager extends EventEmitter {
  private health = new Map<string, ConnectionHealth>();
  private rateLimiters = new Map<string, TokenBucket>();
  private globalRateLimiter: TokenBucket;
  private config: RateLimitConfig;

  // Stats
  private totalEventsSent = 0;
  private totalEventsDropped = 0;
  private totalConnectionErrors = 0;

  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {
    super();
    this.config = config;
    this.globalRateLimiter = new TokenBucket(
      config.burstAllowance * 10,
      config.maxGlobalEventsPerSecond
    );
  }

  /**
   * Register a new connection
   */
  register(clientId: string): void {
    this.health.set(clientId, {
      clientId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      eventsSent: 0,
      eventsDropped: 0,
      writeErrors: 0,
      latencyMs: [],
      healthy: true,
    });

    this.rateLimiters.set(
      clientId,
      new TokenBucket(this.config.burstAllowance, this.config.maxEventsPerSecond)
    );
  }

  /**
   * Unregister a connection
   */
  unregister(clientId: string): void {
    this.health.delete(clientId);
    this.rateLimiters.delete(clientId);
  }

  /**
   * Check if client can receive an event (rate limiting)
   */
  canSend(clientId: string): boolean {
    // Check global rate limit
    if (!this.globalRateLimiter.consume()) {
      return false;
    }

    // Check per-client rate limit
    const limiter = this.rateLimiters.get(clientId);
    if (!limiter || !limiter.consume()) {
      return false;
    }

    return true;
  }

  /**
   * Record successful event send
   */
  recordSend(clientId: string, latencyMs?: number): void {
    const h = this.health.get(clientId);
    if (!h) return;

    h.eventsSent++;
    h.lastActivity = Date.now();
    this.totalEventsSent++;

    if (latencyMs !== undefined) {
      h.latencyMs.push(latencyMs);
      // Keep only last 100 latency samples
      if (h.latencyMs.length > 100) {
        h.latencyMs.shift();
      }
    }
  }

  /**
   * Record dropped event
   */
  recordDrop(clientId: string): void {
    const h = this.health.get(clientId);
    if (!h) return;

    h.eventsDropped++;
    this.totalEventsDropped++;
  }

  /**
   * Record write error
   */
  recordError(clientId: string): void {
    const h = this.health.get(clientId);
    if (!h) return;

    h.writeErrors++;
    this.totalConnectionErrors++;

    // Mark unhealthy if too many errors
    if (h.writeErrors > 5) {
      h.healthy = false;
      this.emit('client:unhealthy', { clientId, errors: h.writeErrors });
    }
  }

  /**
   * Get client health
   */
  getHealth(clientId: string): ConnectionHealth | undefined {
    return this.health.get(clientId);
  }

  /**
   * Get all unhealthy clients
   */
  getUnhealthyClients(): string[] {
    const unhealthy: string[] = [];
    for (const [id, h] of this.health) {
      if (!h.healthy) {
        unhealthy.push(id);
      }
    }
    return unhealthy;
  }

  /**
   * Check for stale connections
   */
  checkStale(timeoutMs: number): string[] {
    const now = Date.now();
    const stale: string[] = [];

    for (const [id, h] of this.health) {
      if (now - h.lastActivity > timeoutMs) {
        stale.push(id);
      }
    }

    return stale;
  }

  /**
   * Get global stats
   */
  getStats(): {
    totalConnections: number;
    healthyConnections: number;
    totalEventsSent: number;
    totalEventsDropped: number;
    totalConnectionErrors: number;
    globalTokens: number;
  } {
    let healthyCount = 0;
    for (const h of this.health.values()) {
      if (h.healthy) healthyCount++;
    }

    return {
      totalConnections: this.health.size,
      healthyConnections: healthyCount,
      totalEventsSent: this.totalEventsSent,
      totalEventsDropped: this.totalEventsDropped,
      totalConnectionErrors: this.totalConnectionErrors,
      globalTokens: this.globalRateLimiter.getTokens(),
    };
  }

  /**
   * Get average latency for a client
   */
  getAverageLatency(clientId: string): number | undefined {
    const h = this.health.get(clientId);
    if (!h || h.latencyMs.length === 0) return undefined;

    const sum = h.latencyMs.reduce((a, b) => a + b, 0);
    return sum / h.latencyMs.length;
  }
}

/**
 * Graceful degradation modes
 */
export enum DegradationMode {
  NORMAL = 'NORMAL',
  /** Drop non-essential events */
  LIGHT = 'LIGHT',
  /** Only send critical events */
  HEAVY = 'HEAVY',
  /** Reject new connections */
  CRITICAL = 'CRITICAL',
}

/**
 * Graceful degradation config
 */
export interface DegradationConfig {
  /** CPU threshold for LIGHT mode (%) */
  lightThreshold: number;
  /** CPU threshold for HEAVY mode (%) */
  heavyThreshold: number;
  /** CPU threshold for CRITICAL mode (%) */
  criticalThreshold: number;
  /** Event queue size for LIGHT mode */
  queueLightThreshold: number;
  /** Event queue size for HEAVY mode */
  queueHeavyThreshold: number;
}

/**
 * Default degradation config
 */
export const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  lightThreshold: 70,
  heavyThreshold: 85,
  criticalThreshold: 95,
  queueLightThreshold: 1000,
  queueHeavyThreshold: 5000,
};

/**
 * Essential event types (always delivered)
 */
export const ESSENTIAL_EVENT_TYPES = [
  'cross_chain_final',
  'reorg_undo',
  'mempool_reject',
];

/**
 * Graceful degradation controller
 */
export class DegradationController {
  private mode: DegradationMode = DegradationMode.NORMAL;
  private config: DegradationConfig;
  private modeChangeCallbacks: Array<(mode: DegradationMode) => void> = [];

  constructor(config: DegradationConfig = DEFAULT_DEGRADATION_CONFIG) {
    this.config = config;
  }

  /**
   * Update degradation mode based on system metrics
   */
  updateMetrics(cpuUsage: number, queueSize: number): void {
    let newMode: DegradationMode;

    if (cpuUsage >= this.config.criticalThreshold || queueSize >= this.config.queueHeavyThreshold * 2) {
      newMode = DegradationMode.CRITICAL;
    } else if (cpuUsage >= this.config.heavyThreshold || queueSize >= this.config.queueHeavyThreshold) {
      newMode = DegradationMode.HEAVY;
    } else if (cpuUsage >= this.config.lightThreshold || queueSize >= this.config.queueLightThreshold) {
      newMode = DegradationMode.LIGHT;
    } else {
      newMode = DegradationMode.NORMAL;
    }

    if (newMode !== this.mode) {
      this.mode = newMode;
      for (const cb of this.modeChangeCallbacks) {
        cb(newMode);
      }
    }
  }

  /**
   * Check if an event type should be delivered
   */
  shouldDeliver(eventType: string): boolean {
    switch (this.mode) {
      case DegradationMode.NORMAL:
        return true;

      case DegradationMode.LIGHT:
        // Drop some non-essential events
        return !['preflight_ok', 'preflight_conflict'].includes(eventType);

      case DegradationMode.HEAVY:
        // Only essential events
        return ESSENTIAL_EVENT_TYPES.includes(eventType);

      case DegradationMode.CRITICAL:
        // Only cross_chain_final
        return eventType === 'cross_chain_final';
    }
  }

  /**
   * Check if new connections should be accepted
   */
  acceptConnections(): boolean {
    return this.mode !== DegradationMode.CRITICAL;
  }

  /**
   * Get current mode
   */
  getMode(): DegradationMode {
    return this.mode;
  }

  /**
   * Register mode change callback
   */
  onModeChange(callback: (mode: DegradationMode) => void): void {
    this.modeChangeCallbacks.push(callback);
  }

  /**
   * Force a specific mode (for testing)
   */
  forceMode(mode: DegradationMode): void {
    this.mode = mode;
    for (const cb of this.modeChangeCallbacks) {
      cb(mode);
    }
  }
}
