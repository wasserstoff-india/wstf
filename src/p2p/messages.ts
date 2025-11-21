/**
 * P2P message types (CBOR-encoded, length-prefixed)
 */
import cbor from 'cbor';

export enum MessageType {
  PEER_HELLO = 0x01,
  PEER_ACK = 0x02,
  CAPABILITIES = 0x03,
  PING = 0x10,
  PONG = 0x11,
  INV = 0x20,
  GET_DATA = 0x21,
  DATA = 0x22,
  // Headers-first sync messages
  GET_HEADERS = 0x30,
  HEADERS = 0x31,
  GET_BLOCKS = 0x32,
  BLOCKS = 0x33,
  REJECT = 0xff,
}

/**
 * Base message structure
 */
export interface BaseMessage {
  type: MessageType;
  timestamp: number;
}

/**
 * PeerHello: Initial handshake
 */
export interface PeerHello extends BaseMessage {
  type: MessageType.PEER_HELLO;
  peerId: string; // Unique peer identifier (e.g., address or pubkey hash)
  version: string;
  services: string[]; // e.g., ['p2p', 'validator', 'mempool']
}

/**
 * PeerAck: Handshake acknowledgment
 */
export interface PeerAck extends BaseMessage {
  type: MessageType.PEER_ACK;
  peerId: string;
  accepted: boolean;
  reason?: string;
}

/**
 * Capabilities: Service capabilities exchange
 */
export interface Capabilities extends BaseMessage {
  type: MessageType.CAPABILITIES;
  gossip: string[]; // e.g., ['tx2', 'ins']
  modules: string[]; // e.g., ['SYS.REG', 'SYS.VERIFY']
  maxMessageSize: number;
}

/**
 * Ping: Keep-alive
 */
export interface Ping extends BaseMessage {
  type: MessageType.PING;
  nonce: string; // Random nonce for response matching
}

/**
 * Pong: Ping response
 */
export interface Pong extends BaseMessage {
  type: MessageType.PONG;
  nonce: string; // Echo the ping nonce
}

/**
 * Inv: Inventory announcement (I have these items)
 */
export interface Inv extends BaseMessage {
  type: MessageType.INV;
  invType: 'tx' | 'ins'; // Transaction or INS entry
  ids: string[]; // Hashes of items
}

/**
 * GetData: Request for specific items
 */
export interface GetData extends BaseMessage {
  type: MessageType.GET_DATA;
  invType: 'tx' | 'ins';
  ids: string[];
}

/**
 * Data: Actual data payload (tx or INS entry)
 */
export interface Data extends BaseMessage {
  type: MessageType.DATA;
  invType: 'tx' | 'ins';
  id: string; // Hash of the item
  payload: any; // The actual tx or INS entry
}

/**
 * Reject: Error/rejection message
 */
export interface Reject extends BaseMessage {
  type: MessageType.REJECT;
  code: string;
  reason: string;
  rejectType?: MessageType; // Which message type is being rejected
}

/**
 * Compact block header for sync
 */
export interface CompactHeader {
  hash: string;
  parentHash: string;
  height: string; // bigint as string
  timestamp: number;
  target: string;
  nonce: string; // bigint as string
  stateRoot: string;
  txRoot: string;
}

/**
 * GetHeaders: Request headers from a locator
 */
export interface GetHeaders extends BaseMessage {
  type: MessageType.GET_HEADERS;
  /** Block locator hashes (newest first) */
  locator: string[];
  /** Stop hash (request headers up to this, or empty for max) */
  stopHash?: string;
  /** Max headers to return */
  maxHeaders?: number;
}

/**
 * Headers: Response with block headers
 */
export interface Headers extends BaseMessage {
  type: MessageType.HEADERS;
  /** Array of compact headers */
  headers: CompactHeader[];
}

/**
 * GetBlocks: Request full blocks by hash
 */
export interface GetBlocks extends BaseMessage {
  type: MessageType.GET_BLOCKS;
  /** Block hashes to request */
  hashes: string[];
}

/**
 * Blocks: Response with full blocks
 */
export interface Blocks extends BaseMessage {
  type: MessageType.BLOCKS;
  /** Array of serialized blocks */
  blocks: any[]; // Serialized Block objects
}

export type P2PMessage =
  | PeerHello
  | PeerAck
  | Capabilities
  | Ping
  | Pong
  | Inv
  | GetData
  | Data
  | GetHeaders
  | Headers
  | GetBlocks
  | Blocks
  | Reject;

/**
 * Encode a message with length prefix
 * Format: [4-byte length (BE)] [CBOR payload]
 */
export function encodeMessage(msg: P2PMessage): Buffer {
  const cborPayload = cbor.encode(msg);
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32BE(cborPayload.length, 0);
  return Buffer.concat([lengthPrefix, cborPayload]);
}

/**
 * Decode a length-prefixed message
 * Returns { message, bytesRead } or throws if truncated
 */
export function decodeMessage(buffer: Buffer): { message: P2PMessage; bytesRead: number } {
  if (buffer.length < 4) {
    throw new Error('BUFFER_TRUNCATED: Need at least 4 bytes for length prefix');
  }

  const length = buffer.readUInt32BE(0);
  if (buffer.length < 4 + length) {
    throw new Error(`BUFFER_TRUNCATED: Expected ${4 + length} bytes, got ${buffer.length}`);
  }

  const cborPayload = buffer.slice(4, 4 + length);
  const message = cbor.decode(cborPayload) as P2PMessage;

  return { message, bytesRead: 4 + length };
}

/**
 * Helper: Create a PeerHello message
 */
export function createPeerHello(peerId: string, version: string, services: string[]): PeerHello {
  return {
    type: MessageType.PEER_HELLO,
    timestamp: Date.now(),
    peerId,
    version,
    services
  };
}

/**
 * Helper: Create a Ping message
 */
export function createPing(): Ping {
  return {
    type: MessageType.PING,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(7)
  };
}

/**
 * Helper: Create a Pong response
 */
export function createPong(nonce: string): Pong {
  return {
    type: MessageType.PONG,
    timestamp: Date.now(),
    nonce
  };
}

/**
 * Helper: Create an Inv message
 */
export function createInv(invType: 'tx' | 'ins', ids: string[]): Inv {
  return {
    type: MessageType.INV,
    timestamp: Date.now(),
    invType,
    ids
  };
}

/**
 * Helper: Create a GetData message
 */
export function createGetData(invType: 'tx' | 'ins', ids: string[]): GetData {
  return {
    type: MessageType.GET_DATA,
    timestamp: Date.now(),
    invType,
    ids
  };
}

/**
 * Helper: Create a Data message
 */
export function createData(invType: 'tx' | 'ins', id: string, payload: any): Data {
  return {
    type: MessageType.DATA,
    timestamp: Date.now(),
    invType,
    id,
    payload
  };
}

/**
 * Helper: Create a Reject message
 */
export function createReject(code: string, reason: string, rejectType?: MessageType): Reject {
  return {
    type: MessageType.REJECT,
    timestamp: Date.now(),
    code,
    reason,
    rejectType
  };
}

/**
 * Helper: Create a GetHeaders message
 */
export function createGetHeaders(locator: string[], stopHash?: string, maxHeaders?: number): GetHeaders {
  return {
    type: MessageType.GET_HEADERS,
    timestamp: Date.now(),
    locator,
    stopHash,
    maxHeaders
  };
}

/**
 * Helper: Create a Headers message
 */
export function createHeaders(headers: CompactHeader[]): Headers {
  return {
    type: MessageType.HEADERS,
    timestamp: Date.now(),
    headers
  };
}

/**
 * Helper: Create a GetBlocks message
 */
export function createGetBlocks(hashes: string[]): GetBlocks {
  return {
    type: MessageType.GET_BLOCKS,
    timestamp: Date.now(),
    hashes
  };
}

/**
 * Helper: Create a Blocks message
 */
export function createBlocks(blocks: any[]): Blocks {
  return {
    type: MessageType.BLOCKS,
    timestamp: Date.now(),
    blocks
  };
}
