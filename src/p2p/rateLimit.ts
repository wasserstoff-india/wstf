/**
 * Rate limiter for P2P connections (DoS protection)
 */

export interface RateLimitConfig {
  messagesPerSecond: number;
  bytesPerSecond: number;
  windowMs: number; // Time window for rate limiting
}

export interface RateLimitState {
  messageCount: number;
  byteCount: number;
  windowStart: number;
}

export class RateLimiter {
  private states = new Map<string, RateLimitState>();

  constructor(private config: RateLimitConfig = {
    messagesPerSecond: 100,
    bytesPerSecond: 1048576, // 1MB/s
    windowMs: 1000
  }) {}

  /**
   * Check if a peer is allowed to send a message
   * Returns { allowed: true } or { allowed: false, reason: string }
   */
  checkLimit(peerId: string, messageBytes: number): { allowed: boolean; reason?: string } {
    const now = Date.now();
    let state = this.states.get(peerId);

    // Initialize or reset window
    if (!state || now - state.windowStart >= this.config.windowMs) {
      state = {
        messageCount: 0,
        byteCount: 0,
        windowStart: now
      };
      this.states.set(peerId, state);
    }

    // Check message rate
    if (state.messageCount >= this.config.messagesPerSecond) {
      return {
        allowed: false,
        reason: `RATE_LIMIT_MESSAGES: Exceeded ${this.config.messagesPerSecond} messages/second`
      };
    }

    // Check byte rate
    if (state.byteCount + messageBytes > this.config.bytesPerSecond) {
      return {
        allowed: false,
        reason: `RATE_LIMIT_BYTES: Exceeded ${this.config.bytesPerSecond} bytes/second`
      };
    }

    // Update state
    state.messageCount++;
    state.byteCount += messageBytes;

    return { allowed: true };
  }

  /**
   * Clean up old states (prevent memory leak)
   */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs * 2;

    for (const [peerId, state] of this.states.entries()) {
      if (state.windowStart < cutoff) {
        this.states.delete(peerId);
      }
    }
  }

  /**
   * Get current stats for a peer
   */
  getStats(peerId: string): RateLimitState | undefined {
    return this.states.get(peerId);
  }

  /**
   * Reset limits for a peer (e.g., after ban/timeout)
   */
  reset(peerId: string): void {
    this.states.delete(peerId);
  }
}
