/**
 * P2P Peer connection handler
 */
import { Socket } from 'net';
import { EventEmitter } from 'events';
import {
  P2PMessage,
  MessageType,
  encodeMessage,
  decodeMessage,
  createPeerHello,
  createPong,
  createReject,
  PeerHello,
  Ping
} from './messages';
import { RateLimiter } from './rateLimit';

export interface PeerInfo {
  id: string;
  address: string;
  port: number;
  version?: string;
  services?: string[];
  handshakeComplete: boolean;
  lastSeen: number;
}

export class Peer extends EventEmitter {
  private socket: Socket;
  private buffer: Buffer = Buffer.alloc(0);
  private rateLimiter: RateLimiter;
  public info: PeerInfo;

  constructor(
    socket: Socket,
    peerId: string,
    rateLimiter: RateLimiter
  ) {
    super();
    this.socket = socket;
    this.rateLimiter = rateLimiter;

    const addr = socket.remoteAddress || 'unknown';
    const port = socket.remotePort || 0;

    this.info = {
      id: peerId,
      address: addr,
      port,
      handshakeComplete: false,
      lastSeen: Date.now()
    };

    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.socket.on('data', (data) => this.handleData(data));
    this.socket.on('error', (err) => this.emit('error', err));
    this.socket.on('close', () => this.emit('close'));
  }

  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.info.lastSeen = Date.now();

    // Try to decode messages from buffer
    while (this.buffer.length >= 4) {
      try {
        const { message, bytesRead } = decodeMessage(this.buffer);

        // Rate limit check
        const limitCheck = this.rateLimiter.checkLimit(this.info.id, bytesRead);
        if (!limitCheck.allowed) {
          this.send(createReject('RATE_LIMIT_EXCEEDED', limitCheck.reason || 'Rate limit exceeded'));
          this.disconnect();
          return;
        }

        // Remove processed bytes
        this.buffer = this.buffer.slice(bytesRead);

        // Handle message
        this.handleMessage(message);
      } catch (e: any) {
        if (e.message.includes('BUFFER_TRUNCATED')) {
          // Need more data
          break;
        } else {
          // Invalid message
          this.emit('error', e);
          this.disconnect();
          return;
        }
      }
    }
  }

  private handleMessage(msg: P2PMessage): void {
    // Handle handshake
    if (msg.type === MessageType.PEER_HELLO) {
      const hello = msg as PeerHello;
      this.info.version = hello.version;
      this.info.services = hello.services;
      this.info.handshakeComplete = true;
      this.emit('handshake', hello);
      return;
    }

    // Require handshake before other messages
    if (!this.info.handshakeComplete) {
      this.send(createReject('HANDSHAKE_REQUIRED', 'PeerHello required first'));
      this.disconnect();
      return;
    }

    // Handle ping/pong
    if (msg.type === MessageType.PING) {
      const ping = msg as Ping;
      this.send(createPong(ping.nonce));
      return;
    }

    // Emit all other messages
    this.emit('message', msg);
  }

  /**
   * Send a message to the peer
   */
  send(msg: P2PMessage): void {
    try {
      const encoded = encodeMessage(msg);
      this.socket.write(encoded);
    } catch (e) {
      this.emit('error', e);
    }
  }

  /**
   * Disconnect from peer
   */
  disconnect(): void {
    this.socket.destroy();
  }

  /**
   * Check if peer is connected
   */
  isConnected(): boolean {
    return !this.socket.destroyed;
  }
}
