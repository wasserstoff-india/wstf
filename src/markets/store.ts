/**
 * Markets Module - State Store
 *
 * KV store abstraction for market state with OCC (Optimistic Concurrency Control).
 * Follows patterns from tokens/store.ts and vars/store.ts.
 */

import {
  MarketId,
  OrderId,
  GridId,
  TradeId,
  Market,
  Order,
  Trade,
  LiquidityGrid,
  TopOfBook,
  PriceLevel,
  MarketEscrow,
  Side,
  makeMarketIdRaw,
  makeOrderIdRaw,
  makeGridIdRaw,
} from './types';
import { TokenId } from '../tokens/types';

// ============================================================================
// Error Types
// ============================================================================

export class MarketNotFoundError extends Error {
  constructor(public marketId: MarketId) {
    super(`Market not found: ${marketId}`);
    this.name = 'MarketNotFoundError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(public orderId: OrderId) {
    super(`Order not found: ${orderId}`);
    this.name = 'OrderNotFoundError';
  }
}

export class GridNotFoundError extends Error {
  constructor(public gridId: GridId) {
    super(`Grid not found: ${gridId}`);
    this.name = 'GridNotFoundError';
  }
}

export class MarketConcurrencyError extends Error {
  constructor(
    public entityType: 'market' | 'order' | 'grid' | 'level' | 'escrow' | 'top',
    public entityId: string,
    public expectedVersion: bigint,
    public actualVersion: bigint
  ) {
    super(`Concurrency conflict on ${entityType} ${entityId}: expected v${expectedVersion}, got v${actualVersion}`);
    this.name = 'MarketConcurrencyError';
  }
}

export class InsufficientEscrowError extends Error {
  constructor(
    public marketId: MarketId,
    public owner: string,
    public tokenId: TokenId,
    public required: bigint,
    public available: bigint
  ) {
    super(`Insufficient escrow: need ${required}, have ${available}`);
    this.name = 'InsufficientEscrowError';
  }
}

// ============================================================================
// Store Interface
// ============================================================================

export interface MarketStore {
  // Market CRUD
  createMarket(market: Market): Promise<void>;
  getMarket(marketId: MarketId): Promise<Market | undefined>;
  updateMarket(marketId: MarketId, updates: Partial<Market>, expectedVersion: bigint): Promise<void>;
  listMarkets(status?: Market['status']): Promise<Market[]>;

  // Order CRUD
  createOrder(order: Order): Promise<void>;
  getOrder(orderId: OrderId): Promise<Order | undefined>;
  updateOrder(orderId: OrderId, updates: Partial<Order>, expectedVersion: bigint): Promise<void>;
  deleteOrder(orderId: OrderId): Promise<void>;
  getOrdersByMarket(marketId: MarketId, side?: Side): Promise<Order[]>;
  getOrdersByOwner(owner: string): Promise<Order[]>;

  // Price Level Management
  getLevel(marketId: MarketId, side: Side, price: bigint): Promise<PriceLevel | undefined>;
  setLevel(level: PriceLevel): Promise<void>;
  deleteLevel(marketId: MarketId, side: Side, price: bigint): Promise<void>;
  getLevelsByMarket(marketId: MarketId, side: Side, limit?: number): Promise<PriceLevel[]>;

  // Top of Book
  getTopOfBook(marketId: MarketId): Promise<TopOfBook | undefined>;
  setTopOfBook(top: TopOfBook): Promise<void>;

  // Escrow
  getEscrow(marketId: MarketId, owner: string, tokenId: TokenId): Promise<MarketEscrow | undefined>;
  setEscrow(escrow: MarketEscrow): Promise<void>;
  adjustEscrow(marketId: MarketId, owner: string, tokenId: TokenId, delta: bigint): Promise<void>;

  // Liquidity Grids
  createGrid(grid: LiquidityGrid): Promise<void>;
  getGrid(gridId: GridId): Promise<LiquidityGrid | undefined>;
  updateGrid(gridId: GridId, updates: Partial<LiquidityGrid>, expectedVersion: bigint): Promise<void>;
  deleteGrid(gridId: GridId): Promise<void>;
  getGridsByMarket(marketId: MarketId): Promise<LiquidityGrid[]>;
  getGridsByOwner(owner: string): Promise<LiquidityGrid[]>;

  // Trades (append-only)
  recordTrade(trade: Trade): Promise<void>;
  getTrade(tradeId: TradeId): Promise<Trade | undefined>;
  getTradesByMarket(marketId: MarketId, limit?: number, afterHeight?: bigint): Promise<Trade[]>;
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

export class InMemoryMarketStore implements MarketStore {
  private markets = new Map<MarketId, Market>();
  private orders = new Map<OrderId, Order>();
  private grids = new Map<GridId, LiquidityGrid>();
  private trades = new Map<TradeId, Trade>();
  private topOfBooks = new Map<MarketId, TopOfBook>();

  // Compound key: `${marketId}:${side}:${price}`
  private levels = new Map<string, PriceLevel>();

  // Compound key: `${marketId}:${owner}:${tokenId}`
  private escrows = new Map<string, MarketEscrow>();

  // -------------------------------------------------------------------------
  // Market Operations
  // -------------------------------------------------------------------------

  async createMarket(market: Market): Promise<void> {
    if (this.markets.has(market.marketId)) {
      throw new Error(`Market already exists: ${market.marketId}`);
    }
    this.markets.set(market.marketId, this.clone(market));
  }

  async getMarket(marketId: MarketId): Promise<Market | undefined> {
    const m = this.markets.get(marketId);
    return m ? this.clone(m) : undefined;
  }

  async updateMarket(marketId: MarketId, updates: Partial<Market>, expectedVersion: bigint): Promise<void> {
    const existing = this.markets.get(marketId);
    if (!existing) throw new MarketNotFoundError(marketId);
    if (existing.version !== expectedVersion) {
      throw new MarketConcurrencyError('market', marketId, expectedVersion, existing.version);
    }
    const updated = { ...existing, ...updates, version: existing.version + 1n };
    this.markets.set(marketId, updated);
  }

  async listMarkets(status?: Market['status']): Promise<Market[]> {
    const all = Array.from(this.markets.values());
    if (status) return all.filter(m => m.status === status).map(m => this.clone(m));
    return all.map(m => this.clone(m));
  }

  // -------------------------------------------------------------------------
  // Order Operations
  // -------------------------------------------------------------------------

  async createOrder(order: Order): Promise<void> {
    if (this.orders.has(order.orderId)) {
      throw new Error(`Order already exists: ${order.orderId}`);
    }
    this.orders.set(order.orderId, this.clone(order));
  }

  async getOrder(orderId: OrderId): Promise<Order | undefined> {
    const o = this.orders.get(orderId);
    return o ? this.clone(o) : undefined;
  }

  async updateOrder(orderId: OrderId, updates: Partial<Order>, expectedVersion: bigint): Promise<void> {
    const existing = this.orders.get(orderId);
    if (!existing) throw new OrderNotFoundError(orderId);
    if (existing.version !== expectedVersion) {
      throw new MarketConcurrencyError('order', orderId, expectedVersion, existing.version);
    }
    const updated = { ...existing, ...updates, version: existing.version + 1n };
    this.orders.set(orderId, updated);
  }

  async deleteOrder(orderId: OrderId): Promise<void> {
    this.orders.delete(orderId);
  }

  async getOrdersByMarket(marketId: MarketId, side?: Side): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(o => o.marketId === marketId && (!side || o.side === side))
      .map(o => this.clone(o));
  }

  async getOrdersByOwner(owner: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(o => o.owner === owner)
      .map(o => this.clone(o));
  }

  // -------------------------------------------------------------------------
  // Price Level Operations
  // -------------------------------------------------------------------------

  private levelKey(marketId: MarketId, side: Side, price: bigint): string {
    return `${marketId}:${side}:${price}`;
  }

  async getLevel(marketId: MarketId, side: Side, price: bigint): Promise<PriceLevel | undefined> {
    const level = this.levels.get(this.levelKey(marketId, side, price));
    return level ? this.clone(level) : undefined;
  }

  async setLevel(level: PriceLevel): Promise<void> {
    this.levels.set(this.levelKey(level.marketId, level.side, level.price), this.clone(level));
  }

  async deleteLevel(marketId: MarketId, side: Side, price: bigint): Promise<void> {
    this.levels.delete(this.levelKey(marketId, side, price));
  }

  async getLevelsByMarket(marketId: MarketId, side: Side, limit?: number): Promise<PriceLevel[]> {
    const levels = Array.from(this.levels.values())
      .filter(l => l.marketId === marketId && l.side === side)
      .sort((a, b) => {
        // Bids: highest price first; Asks: lowest price first
        if (side === 'bid') return Number(b.price - a.price);
        return Number(a.price - b.price);
      });
    if (limit) return levels.slice(0, limit).map(l => this.clone(l));
    return levels.map(l => this.clone(l));
  }

  // -------------------------------------------------------------------------
  // Top of Book Operations
  // -------------------------------------------------------------------------

  async getTopOfBook(marketId: MarketId): Promise<TopOfBook | undefined> {
    const top = this.topOfBooks.get(marketId);
    return top ? this.clone(top) : undefined;
  }

  async setTopOfBook(top: TopOfBook): Promise<void> {
    this.topOfBooks.set(top.marketId, this.clone(top));
  }

  // -------------------------------------------------------------------------
  // Escrow Operations
  // -------------------------------------------------------------------------

  private escrowKey(marketId: MarketId, owner: string, tokenId: TokenId): string {
    return `${marketId}:${owner}:${tokenId}`;
  }

  async getEscrow(marketId: MarketId, owner: string, tokenId: TokenId): Promise<MarketEscrow | undefined> {
    const escrow = this.escrows.get(this.escrowKey(marketId, owner, tokenId));
    return escrow ? this.clone(escrow) : undefined;
  }

  async setEscrow(escrow: MarketEscrow): Promise<void> {
    this.escrows.set(this.escrowKey(escrow.marketId, escrow.owner, escrow.tokenId), this.clone(escrow));
  }

  async adjustEscrow(marketId: MarketId, owner: string, tokenId: TokenId, delta: bigint): Promise<void> {
    const key = this.escrowKey(marketId, owner, tokenId);
    const existing = this.escrows.get(key);

    if (!existing) {
      if (delta < 0n) {
        throw new InsufficientEscrowError(marketId, owner, tokenId, -delta, 0n);
      }
      this.escrows.set(key, {
        marketId,
        owner,
        tokenId,
        lockedAmount: delta,
        version: 1n,
      });
      return;
    }

    const newAmount = existing.lockedAmount + delta;
    if (newAmount < 0n) {
      throw new InsufficientEscrowError(marketId, owner, tokenId, -delta, existing.lockedAmount);
    }

    if (newAmount === 0n) {
      this.escrows.delete(key);
    } else {
      this.escrows.set(key, { ...existing, lockedAmount: newAmount, version: existing.version + 1n });
    }
  }

  // -------------------------------------------------------------------------
  // Grid Operations
  // -------------------------------------------------------------------------

  async createGrid(grid: LiquidityGrid): Promise<void> {
    if (this.grids.has(grid.gridId)) {
      throw new Error(`Grid already exists: ${grid.gridId}`);
    }
    this.grids.set(grid.gridId, this.clone(grid));
  }

  async getGrid(gridId: GridId): Promise<LiquidityGrid | undefined> {
    const g = this.grids.get(gridId);
    return g ? this.clone(g) : undefined;
  }

  async updateGrid(gridId: GridId, updates: Partial<LiquidityGrid>, expectedVersion: bigint): Promise<void> {
    const existing = this.grids.get(gridId);
    if (!existing) throw new GridNotFoundError(gridId);
    if (existing.version !== expectedVersion) {
      throw new MarketConcurrencyError('grid', gridId, expectedVersion, existing.version);
    }
    const updated = { ...existing, ...updates, version: existing.version + 1n };
    this.grids.set(gridId, updated);
  }

  async deleteGrid(gridId: GridId): Promise<void> {
    this.grids.delete(gridId);
  }

  async getGridsByMarket(marketId: MarketId): Promise<LiquidityGrid[]> {
    return Array.from(this.grids.values())
      .filter(g => g.marketId === marketId)
      .map(g => this.clone(g));
  }

  async getGridsByOwner(owner: string): Promise<LiquidityGrid[]> {
    return Array.from(this.grids.values())
      .filter(g => g.owner === owner)
      .map(g => this.clone(g));
  }

  // -------------------------------------------------------------------------
  // Trade Operations
  // -------------------------------------------------------------------------

  async recordTrade(trade: Trade): Promise<void> {
    this.trades.set(trade.tradeId, this.clone(trade));
  }

  async getTrade(tradeId: TradeId): Promise<Trade | undefined> {
    const t = this.trades.get(tradeId);
    return t ? this.clone(t) : undefined;
  }

  async getTradesByMarket(marketId: MarketId, limit?: number, afterHeight?: bigint): Promise<Trade[]> {
    let trades = Array.from(this.trades.values())
      .filter(t => t.marketId === marketId)
      .filter(t => !afterHeight || t.height > afterHeight)
      .sort((a, b) => Number(b.height - a.height) || Number(b.timestamp - a.timestamp));

    if (limit) trades = trades.slice(0, limit);
    return trades.map(t => this.clone(t));
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? `__bigint:${v}` : v), (_, v) => {
      if (typeof v === 'string' && v.startsWith('__bigint:')) {
        return BigInt(v.slice(9));
      }
      return v;
    });
  }

  /** Clear all state (for testing) */
  clear(): void {
    this.markets.clear();
    this.orders.clear();
    this.grids.clear();
    this.trades.clear();
    this.topOfBooks.clear();
    this.levels.clear();
    this.escrows.clear();
  }
}
