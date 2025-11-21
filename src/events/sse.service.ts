/**
 * SSE (Server-Sent Events) Service for real-time transaction tracking
 */
import { EventEmitter } from 'events';
import crypto from 'crypto';
import {
  TxEvent,
  TxEventType,
  EventFilter,
  SSEConfig,
  DEFAULT_SSE_CONFIG,
} from './types';

/**
 * Connected client
 */
interface SSEClient {
  id: string;
  ip: string;
  filter: EventFilter;
  buffer: TxEvent[];
  lastEventId: string;
  connectedAt: number;
  write: (data: string) => boolean;
  close: () => void;
}

/**
 * SSE Service
 */
export class SSEService extends EventEmitter {
  private config: SSEConfig;
  private clients = new Map<string, SSEClient>();
  private clientsByIp = new Map<string, Set<string>>();
  private recentEvents: TxEvent[] = [];
  private heartbeatInterval?: NodeJS.Timeout;
  private eventIdCounter = 0;

  constructor(config: Partial<SSEConfig> = {}) {
    super();
    this.config = { ...DEFAULT_SSE_CONFIG, ...config };
  }

  /**
   * Start the SSE service
   */
  start(): void {
    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
      this.cleanupOldEvents();
    }, this.config.heartbeatMs);
  }

  /**
   * Stop the SSE service
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    // Close all clients
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();
    this.clientsByIp.clear();
  }

  /**
   * Add a new client
   */
  addClient(
    ip: string,
    filter: EventFilter,
    write: (data: string) => boolean,
    close: () => void,
    lastEventId?: string
  ): { ok: boolean; clientId?: string; error?: string } {
    // Check total client limit
    if (this.clients.size >= this.config.maxTotalClients) {
      return { ok: false, error: 'MAX_CLIENTS_REACHED' };
    }

    // Check per-IP limit
    const ipClients = this.clientsByIp.get(ip);
    if (ipClients && ipClients.size >= this.config.maxClientsPerIp) {
      return { ok: false, error: 'MAX_CLIENTS_PER_IP' };
    }

    const clientId = crypto.randomBytes(16).toString('hex');

    const client: SSEClient = {
      id: clientId,
      ip,
      filter,
      buffer: [],
      lastEventId: lastEventId || '',
      connectedAt: Date.now(),
      write,
      close,
    };

    this.clients.set(clientId, client);

    if (!ipClients) {
      this.clientsByIp.set(ip, new Set([clientId]));
    } else {
      ipClients.add(clientId);
    }

    // Send any missed events if lastEventId provided
    if (lastEventId) {
      this.replayEvents(client, lastEventId);
    }

    this.emit('client:connected', { clientId, ip, filter });

    return { ok: true, clientId };
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);

    const ipClients = this.clientsByIp.get(client.ip);
    if (ipClients) {
      ipClients.delete(clientId);
      if (ipClients.size === 0) {
        this.clientsByIp.delete(client.ip);
      }
    }

    this.emit('client:disconnected', { clientId, ip: client.ip });
  }

  /**
   * Broadcast an event to matching clients
   */
  broadcast(event: TxEvent): void {
    // Assign event ID
    const eventId = `${Date.now()}-${++this.eventIdCounter}`;
    const eventWithId = { ...event, id: eventId };

    // Store for replay
    this.recentEvents.push(eventWithId);

    // Broadcast to matching clients
    let sentCount = 0;
    for (const client of this.clients.values()) {
      if (this.matchesFilter(eventWithId, client.filter)) {
        if (this.sendToClient(client, eventWithId)) {
          sentCount++;
        }
      }
    }

    this.emit('event:broadcast', { event: eventWithId, sentCount });
  }

  /**
   * Check if event matches filter
   */
  private matchesFilter(event: TxEvent, filter: EventFilter): boolean {
    // Filter by event type
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.type as TxEventType)) {
        return false;
      }
    }

    // Filter by address
    if (filter.addr) {
      if ('from' in event && event.from !== filter.addr) {
        return false;
      }
    }

    // Filter by txId
    if (filter.txId) {
      if ('txId' in event && event.txId !== filter.txId) {
        return false;
      }
    }

    // Note: stateId filter would require looking up tx metadata
    // For now, we don't filter by stateId at the SSE level

    return true;
  }

  /**
   * Send event to a client
   */
  private sendToClient(client: SSEClient, event: TxEvent): boolean {
    const data = this.formatSSE(event);

    try {
      const success = client.write(data);
      if (success) {
        client.lastEventId = event.id;
      } else {
        // Buffer if write fails (backpressure)
        if (client.buffer.length < this.config.maxBufferSize) {
          client.buffer.push(event);
        } else {
          // Drop oldest
          client.buffer.shift();
          client.buffer.push(event);
          this.emit('client:buffer_overflow', { clientId: client.id });
        }
      }
      return success;
    } catch (e) {
      // Client probably disconnected
      this.removeClient(client.id);
      return false;
    }
  }

  /**
   * Format event as SSE
   */
  private formatSSE(event: TxEvent): string {
    return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * Replay events since lastEventId
   */
  private replayEvents(client: SSEClient, lastEventId: string): void {
    let found = false;
    for (const event of this.recentEvents) {
      if (found && this.matchesFilter(event, client.filter)) {
        this.sendToClient(client, event);
      }
      if (event.id === lastEventId) {
        found = true;
      }
    }
  }

  /**
   * Send heartbeat to all clients
   */
  private sendHeartbeat(): void {
    const heartbeat = `:heartbeat ${Date.now()}\n\n`;

    for (const client of this.clients.values()) {
      try {
        client.write(heartbeat);

        // Flush buffer if any
        while (client.buffer.length > 0) {
          const event = client.buffer[0];
          if (this.sendToClient(client, event)) {
            client.buffer.shift();
          } else {
            break;
          }
        }
      } catch (e) {
        this.removeClient(client.id);
      }
    }
  }

  /**
   * Cleanup old events from retention buffer
   */
  private cleanupOldEvents(): void {
    const cutoff = Date.now() - this.config.retentionMs;
    this.recentEvents = this.recentEvents.filter(e => e.ts > cutoff);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalClients: number;
    clientsByIp: Record<string, number>;
    recentEventsCount: number;
    bufferOverflows: number;
  } {
    const clientsByIp: Record<string, number> = {};
    for (const [ip, clients] of this.clientsByIp.entries()) {
      clientsByIp[ip] = clients.size;
    }

    return {
      totalClients: this.clients.size,
      clientsByIp,
      recentEventsCount: this.recentEvents.length,
      bufferOverflows: 0, // TODO: track this
    };
  }

  /**
   * Helper: Emit transaction events
   */
  emitPreflightOk(txId: string, from: string): void {
    this.broadcast({
      id: '',
      ts: Date.now(),
      type: 'preflight_ok',
      txId,
      from,
      tier: 0,
    });
  }

  emitMempoolAdmit(txId: string, from: string, nonce: bigint): void {
    this.broadcast({
      id: '',
      ts: Date.now(),
      type: 'mempool_admit',
      txId,
      from,
      nonce: nonce.toString(),
      tier: 1,
    });
  }

  emitBlockInclude(txId: string, from: string, blockHash: string, blockHeight: bigint, txIndex: number): void {
    this.broadcast({
      id: '',
      ts: Date.now(),
      type: 'block_include',
      txId,
      from,
      blockHash,
      blockHeight: blockHeight.toString(),
      txIndex,
      tier: 2,
    });
  }

  emitKDepth(txId: string, from: string, blockHash: string, depth: number): void {
    this.broadcast({
      id: '',
      ts: Date.now(),
      type: 'k_depth',
      txId,
      from,
      blockHash,
      depth,
      tier: 3,
    });
  }

  emitCrossChainFinal(txId: string, from: string, journalTxHash: string, chain: string): void {
    this.broadcast({
      id: '',
      ts: Date.now(),
      type: 'cross_chain_final',
      txId,
      from,
      journalTxHash,
      chain,
      tier: 4,
    });
  }

  emitReorgUndo(txId: string, from: string, fromTier: number, orphanedBlockHash: string): void {
    this.broadcast({
      id: '',
      ts: Date.now(),
      type: 'reorg_undo',
      txId,
      from,
      fromTier,
      orphanedBlockHash,
    });
  }
}
