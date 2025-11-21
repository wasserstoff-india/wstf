/**
 * P2P Service: WebSocket/TCP peer management
 */
import { createServer, Server, Socket } from 'net';
import Fastify from 'fastify';
import crypto from 'crypto';
import { Peer, PeerInfo } from './peer';
import { RateLimiter } from './rateLimit';
import {
  P2PMessage,
  MessageType,
  createPeerHello,
  Inv,
  GetData,
  Data,
  createInv,
  createGetData,
  createData
} from './messages';
import { P2PConfig } from '../config/types';

export class P2PService {
  private tcpServer: Server;
  private peers = new Map<string, Peer>();
  private rateLimiter: RateLimiter;
  private config: P2PConfig;
  private nodeId: string;

  // Inventory tracking (for duplicate suppression)
  private seenTxs = new Set<string>();
  private seenIns = new Set<string>();

  // Callbacks for handling data
  private onTxReceived?: (tx: any) => Promise<void>;
  private onInsReceived?: (ins: any) => Promise<void>;

  constructor(config: P2PConfig) {
    this.config = config;
    this.nodeId = crypto.randomBytes(16).toString('hex');
    this.rateLimiter = new RateLimiter({
      messagesPerSecond: config.rateLimit.messagesPerSecond,
      bytesPerSecond: config.rateLimit.bytesPerSecond,
      windowMs: 1000
    });

    this.tcpServer = createServer((socket) => this.handleConnection(socket));
  }

  /**
   * Start the P2P service
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.tcpServer.listen(this.config.port, '0.0.0.0', () => {
        console.log(`[p2p] listening on ${this.config.port}, nodeId: ${this.nodeId}`);
        resolve();
      });
    });

    // Cleanup old rate limit states every 60 seconds
    setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60000);
  }

  /**
   * Handle incoming connection
   */
  private handleConnection(socket: Socket): void {
    const peerId = crypto.randomBytes(8).toString('hex');
    const peer = new Peer(socket, peerId, this.rateLimiter);

    console.log(`[p2p] new connection from ${peer.info.address}:${peer.info.port} (${peerId})`);

    peer.on('handshake', (hello) => {
      console.log(`[p2p] handshake complete with ${hello.peerId}, version: ${hello.version}`);
      this.peers.set(peerId, peer);
    });

    peer.on('message', (msg: P2PMessage) => {
      this.handleMessage(peer, msg);
    });

    peer.on('close', () => {
      console.log(`[p2p] peer ${peerId} disconnected`);
      this.peers.delete(peerId);
    });

    peer.on('error', (err) => {
      console.error(`[p2p] peer ${peerId} error:`, err.message);
    });
  }

  /**
   * Handle P2P message
   */
  private async handleMessage(peer: Peer, msg: P2PMessage): Promise<void> {
    switch (msg.type) {
      case MessageType.INV:
        await this.handleInv(peer, msg as Inv);
        break;

      case MessageType.GET_DATA:
        await this.handleGetData(peer, msg as GetData);
        break;

      case MessageType.DATA:
        await this.handleData(peer, msg as Data);
        break;

      default:
        // Unknown message type - ignore or log
        break;
    }
  }

  /**
   * Handle Inv (inventory announcement)
   */
  private async handleInv(peer: Peer, inv: Inv): Promise<void> {
    const unseenIds: string[] = [];

    for (const id of inv.ids) {
      const seen = inv.invType === 'tx' ? this.seenTxs.has(id) : this.seenIns.has(id);
      if (!seen) {
        unseenIds.push(id);
      }
    }

    // Request unseen items
    if (unseenIds.length > 0) {
      peer.send(createGetData(inv.invType, unseenIds));
    }
  }

  /**
   * Handle GetData (request for items)
   */
  private async handleGetData(peer: Peer, getData: GetData): Promise<void> {
    // TODO: Fetch items from mempool/INS store and send back
    // For now, this is a placeholder
    console.log(`[p2p] GetData request for ${getData.ids.length} ${getData.invType} items`);
  }

  /**
   * Handle Data (actual tx/INS payload)
   */
  private async handleData(peer: Peer, data: Data): Promise<void> {
    // Mark as seen (duplicate suppression)
    if (data.invType === 'tx') {
      if (this.seenTxs.has(data.id)) {
        return; // Already seen
      }
      this.seenTxs.add(data.id);

      // Call handler if registered
      if (this.onTxReceived) {
        await this.onTxReceived(data.payload);
      }

      // Relay to other peers (gossip once)
      this.broadcast(createInv('tx', [data.id]), peer.info.id);
    } else if (data.invType === 'ins') {
      if (this.seenIns.has(data.id)) {
        return; // Already seen
      }
      this.seenIns.add(data.id);

      // Call handler if registered
      if (this.onInsReceived) {
        await this.onInsReceived(data.payload);
      }

      // Relay to other peers (gossip once)
      this.broadcast(createInv('ins', [data.id]), peer.info.id);
    }
  }

  /**
   * Broadcast a message to all peers except the sender
   */
  broadcast(msg: P2PMessage, excludePeerId?: string): void {
    for (const [id, peer] of this.peers.entries()) {
      if (id !== excludePeerId && peer.isConnected()) {
        peer.send(msg);
      }
    }
  }

  /**
   * Register handler for received transactions
   */
  onTransaction(handler: (tx: any) => Promise<void>): void {
    this.onTxReceived = handler;
  }

  /**
   * Register handler for received INS entries
   */
  onINS(handler: (ins: any) => Promise<void>): void {
    this.onInsReceived = handler;
  }

  /**
   * Get connected peers
   */
  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values()).map(p => p.info);
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Disconnect all peers
      for (const peer of this.peers.values()) {
        peer.disconnect();
      }

      this.tcpServer.close(() => {
        console.log('[p2p] service stopped');
        resolve();
      });
    });
  }
}

/**
 * Start P2P HTTP API (for management)
 */
export async function startP2PAPI(port: number, p2pService: P2PService) {
  const app = Fastify();

  // Get connected peers
  app.get('/p2p/peers', async () => {
    return {
      ok: true,
      peers: p2pService.getPeers()
    };
  });

  // Capabilities endpoint
  app.get('/capabilities', async () => {
    return {
      service: 'p2p',
      version: '1.0.0',
      modules: ['gossip:tx2', 'gossip:ins', 'inv-getdata'],
      endpoints: [
        { method: 'GET', path: '/p2p/peers', description: 'List connected peers' },
        { method: 'POST', path: '/p2p/connect', description: 'Connect to a peer' }
      ]
    };
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[p2p-api] listening on ${port}`);
  return app;
}
