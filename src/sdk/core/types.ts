/**
 * WSTF SDK Core Types
 *
 * Stable type facade for external SDK consumers.
 * These types are safe for downstream use and maintain backward compatibility.
 *
 * @packageDocumentation
 * @module @wasserstoff/wstf-sdk
 */

// ============================================================================
// Branded Primitive Types
// ============================================================================

/**
 * Brand symbol for compile-time type safety.
 * Prevents accidental mixing of different ID types.
 */
declare const __brand: unique symbol;

/**
 * On-chain address (e.g., "gc1abc...")
 *
 * @example
 * ```ts
 * const addr = asAddress('gc1abc...');
 * ```
 */
export type Address = string & { readonly [__brand]: 'Address' };

/**
 * 32-byte hex string (e.g., "0x..." with 64 hex chars)
 *
 * @example
 * ```ts
 * const hash = asHex32('0x' + '0'.repeat(64));
 * ```
 */
export type Hex32 = string & { readonly [__brand]: 'Hex32' };

/**
 * Token identifier (e.g., "tok_btc")
 */
export type TokenId = string & { readonly [__brand]: 'TokenId' };

/**
 * Market identifier (e.g., "mkt_12345678")
 */
export type MarketId = string & { readonly [__brand]: 'MarketId' };

/**
 * Order identifier (e.g., "ord_12345678")
 */
export type OrderId = string & { readonly [__brand]: 'OrderId' };

/**
 * Liquidity grid identifier (e.g., "grid_12345678")
 */
export type GridId = string & { readonly [__brand]: 'GridId' };

/**
 * Trade identifier (e.g., "trade_12345678")
 */
export type TradeId = string & { readonly [__brand]: 'TradeId' };

// ============================================================================
// Type Constructors & Validators
// ============================================================================

/**
 * Validation error thrown when type construction fails.
 */
export class TypeValidationError extends Error {
  constructor(
    public readonly typeName: string,
    public readonly value: unknown,
    public readonly reason: string
  ) {
    super(`Invalid ${typeName}: ${reason}`);
    this.name = 'TypeValidationError';
  }
}

/**
 * Address validation pattern.
 * Must start with "gc" followed by base58check encoded payload.
 */
const ADDRESS_PATTERN = /^gc[1-9A-HJ-NP-Za-km-z]{20,50}$/;

/**
 * Hex32 validation pattern.
 * Must be "0x" followed by exactly 64 hex characters.
 */
const HEX32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * Token ID validation pattern.
 */
const TOKEN_ID_PATTERN = /^tok_[a-zA-Z0-9_]+$/;

/**
 * Market ID validation pattern.
 */
const MARKET_ID_PATTERN = /^mkt_[a-fA-F0-9]+$/;

/**
 * Order ID validation pattern.
 */
const ORDER_ID_PATTERN = /^ord_[a-fA-F0-9]+$/;

/**
 * Grid ID validation pattern.
 */
const GRID_ID_PATTERN = /^grid_[a-fA-F0-9]+$/;

/**
 * Trade ID validation pattern.
 */
const TRADE_ID_PATTERN = /^trade_[a-fA-F0-9]+$/;

/**
 * Create a validated Address.
 *
 * @param value - Raw string to validate
 * @returns Branded Address type
 * @throws TypeValidationError if validation fails
 *
 * @example
 * ```ts
 * const addr = asAddress('gc1abc...');
 * ```
 */
export function asAddress(value: string): Address {
  if (!value || typeof value !== 'string') {
    throw new TypeValidationError('Address', value, 'must be a non-empty string');
  }
  if (!ADDRESS_PATTERN.test(value)) {
    throw new TypeValidationError('Address', value, 'must start with "gc" followed by valid base58check');
  }
  return value as Address;
}

/**
 * Safely try to create an Address, returning null on failure.
 */
export function tryAddress(value: string): Address | null {
  try {
    return asAddress(value);
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid Address.
 */
export function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value);
}

/**
 * Create a validated Hex32.
 *
 * @param value - Raw string to validate
 * @returns Branded Hex32 type
 * @throws TypeValidationError if validation fails
 */
export function asHex32(value: string): Hex32 {
  if (!value || typeof value !== 'string') {
    throw new TypeValidationError('Hex32', value, 'must be a non-empty string');
  }
  if (!HEX32_PATTERN.test(value)) {
    throw new TypeValidationError('Hex32', value, 'must be "0x" followed by 64 hex characters');
  }
  return value as Hex32;
}

/**
 * Safely try to create a Hex32, returning null on failure.
 */
export function tryHex32(value: string): Hex32 | null {
  try {
    return asHex32(value);
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid Hex32.
 */
export function isHex32(value: unknown): value is Hex32 {
  return typeof value === 'string' && HEX32_PATTERN.test(value);
}

/**
 * Create a validated TokenId.
 *
 * @param value - Raw string to validate
 * @returns Branded TokenId type
 * @throws TypeValidationError if validation fails
 */
export function asTokenId(value: string): TokenId {
  if (!value || typeof value !== 'string') {
    throw new TypeValidationError('TokenId', value, 'must be a non-empty string');
  }
  if (!TOKEN_ID_PATTERN.test(value)) {
    throw new TypeValidationError('TokenId', value, 'must match pattern "tok_[identifier]"');
  }
  return value as TokenId;
}

/**
 * Safely try to create a TokenId, returning null on failure.
 */
export function tryTokenId(value: string): TokenId | null {
  try {
    return asTokenId(value);
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid TokenId.
 */
export function isTokenId(value: unknown): value is TokenId {
  return typeof value === 'string' && TOKEN_ID_PATTERN.test(value);
}

/**
 * Create a validated MarketId.
 *
 * @param value - Raw string to validate
 * @returns Branded MarketId type
 * @throws TypeValidationError if validation fails
 */
export function asMarketId(value: string): MarketId {
  if (!value || typeof value !== 'string') {
    throw new TypeValidationError('MarketId', value, 'must be a non-empty string');
  }
  if (!MARKET_ID_PATTERN.test(value)) {
    throw new TypeValidationError('MarketId', value, 'must match pattern "mkt_[hex]"');
  }
  return value as MarketId;
}

/**
 * Safely try to create a MarketId, returning null on failure.
 */
export function tryMarketId(value: string): MarketId | null {
  try {
    return asMarketId(value);
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid MarketId.
 */
export function isMarketId(value: unknown): value is MarketId {
  return typeof value === 'string' && MARKET_ID_PATTERN.test(value);
}

/**
 * Create a validated OrderId.
 *
 * @param value - Raw string to validate
 * @returns Branded OrderId type
 * @throws TypeValidationError if validation fails
 */
export function asOrderId(value: string): OrderId {
  if (!value || typeof value !== 'string') {
    throw new TypeValidationError('OrderId', value, 'must be a non-empty string');
  }
  if (!ORDER_ID_PATTERN.test(value)) {
    throw new TypeValidationError('OrderId', value, 'must match pattern "ord_[hex]"');
  }
  return value as OrderId;
}

/**
 * Safely try to create an OrderId, returning null on failure.
 */
export function tryOrderId(value: string): OrderId | null {
  try {
    return asOrderId(value);
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid OrderId.
 */
export function isOrderId(value: unknown): value is OrderId {
  return typeof value === 'string' && ORDER_ID_PATTERN.test(value);
}

/**
 * Create a validated GridId.
 *
 * @param value - Raw string to validate
 * @returns Branded GridId type
 * @throws TypeValidationError if validation fails
 */
export function asGridId(value: string): GridId {
  if (!value || typeof value !== 'string') {
    throw new TypeValidationError('GridId', value, 'must be a non-empty string');
  }
  if (!GRID_ID_PATTERN.test(value)) {
    throw new TypeValidationError('GridId', value, 'must match pattern "grid_[hex]"');
  }
  return value as GridId;
}

/**
 * Safely try to create a GridId, returning null on failure.
 */
export function tryGridId(value: string): GridId | null {
  try {
    return asGridId(value);
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid GridId.
 */
export function isGridId(value: unknown): value is GridId {
  return typeof value === 'string' && GRID_ID_PATTERN.test(value);
}

/**
 * Create a validated TradeId.
 *
 * @param value - Raw string to validate
 * @returns Branded TradeId type
 * @throws TypeValidationError if validation fails
 */
export function asTradeId(value: string): TradeId {
  if (!value || typeof value !== 'string') {
    throw new TypeValidationError('TradeId', value, 'must be a non-empty string');
  }
  if (!TRADE_ID_PATTERN.test(value)) {
    throw new TypeValidationError('TradeId', value, 'must match pattern "trade_[hex]"');
  }
  return value as TradeId;
}

/**
 * Safely try to create a TradeId, returning null on failure.
 */
export function tryTradeId(value: string): TradeId | null {
  try {
    return asTradeId(value);
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid TradeId.
 */
export function isTradeId(value: unknown): value is TradeId {
  return typeof value === 'string' && TRADE_ID_PATTERN.test(value);
}

/**
 * Unsafe cast - use only when you know the value is valid.
 * Prefer the validated constructors (asAddress, asTokenId, etc.) in application code.
 */
export const unsafe = {
  address: (v: string) => v as Address,
  hex32: (v: string) => v as Hex32,
  tokenId: (v: string) => v as TokenId,
  marketId: (v: string) => v as MarketId,
  orderId: (v: string) => v as OrderId,
  gridId: (v: string) => v as GridId,
  tradeId: (v: string) => v as TradeId,
};

// ============================================================================
// Enums
// ============================================================================

/**
 * Signature algorithm identifiers.
 * Maps to internal SigAlgId values.
 */
export enum SigAlg {
  ED25519 = 1,
  SECP256K1 = 2,
}

/**
 * Trust tier for transaction finality.
 * Higher tiers indicate stronger finality guarantees.
 */
export enum TrustTier {
  /** Transaction submitted but not yet validated */
  PREFLIGHT = 0,
  /** Transaction admitted to mempool */
  ADMITTED = 1,
  /** Transaction included in a block */
  INCLUDED = 2,
  /** Transaction buried under k blocks (probabilistic finality) */
  K_DEPTH = 3,
  /** Transaction finalized via cross-chain checkpoint */
  CROSS_CHAIN = 4,
}

/**
 * Order side (bid = buy, ask = sell).
 */
export enum Side {
  BID = 'bid',
  ASK = 'ask',
}

/**
 * Market operational status.
 */
export enum MarketStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CLOSED = 'closed',
}

/**
 * Order execution status.
 */
export enum OrderStatus {
  OPEN = 'open',
  PARTIAL = 'partial',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
}

/**
 * Order execution flags.
 */
export enum OrderFlag {
  /** Post-only: reject if would immediately match */
  POST_ONLY = 'post_only',
  /** Immediate-or-cancel: fill what's possible, cancel rest */
  IOC = 'ioc',
  /** Fill-or-kill: fill entirely or reject */
  FOK = 'fok',
}

/**
 * LP grid spread calculation mode.
 */
export enum SpreadMode {
  /** Arithmetic spread (equal price distance between levels) */
  ARITHMETIC = 'arith',
  /** Geometric spread (equal percentage between levels) */
  GEOMETRIC = 'geom',
}

/**
 * LP grid side bias.
 */
export enum SideBias {
  /** Place orders on both sides */
  BOTH = 'both',
  /** Place orders only on bid side */
  BID_ONLY = 'bid_only',
  /** Place orders only on ask side */
  ASK_ONLY = 'ask_only',
}

// ============================================================================
// Token Types
// ============================================================================

/**
 * Token metadata (static information).
 */
export interface TokenMeta {
  /** Unique token identifier */
  tokenId: TokenId;
  /** Human-readable symbol (e.g., "BTC") */
  symbol: string;
  /** Full token name (e.g., "Bitcoin") */
  name: string;
  /** Decimal precision (e.g., 8 for BTC) */
  decimals: number;
  /** Maximum supply (0 = unlimited) */
  maxSupply: bigint;
  /** Current circulating supply */
  totalSupply: bigint;
  /** Token owner/admin address */
  owner: Address;
  /** Whether minting is allowed */
  mintable: boolean;
  /** Whether burning is allowed */
  burnable: boolean;
}

/**
 * User's token balance.
 */
export interface Balance {
  /** Token identifier */
  tokenId: TokenId;
  /** Account address */
  address: Address;
  /** Available (unlocked) balance */
  available: bigint;
  /** Locked in escrow (orders, grids) */
  locked: bigint;
  /** Total balance (available + locked) */
  total: bigint;
}

// ============================================================================
// Market Types
// ============================================================================

/**
 * Market information and configuration.
 */
export interface MarketInfo {
  /** Unique market identifier */
  marketId: MarketId;
  /** Base token (e.g., BTC in BTC/USDT) */
  baseTokenId: TokenId;
  /** Quote token (e.g., USDT in BTC/USDT) */
  quoteTokenId: TokenId;
  /** Minimum price increment */
  tickSize: bigint;
  /** Minimum order size */
  lotSize: bigint;
  /** Trading fee in basis points (100 = 1%) */
  feeBps: number;
  /** Current market status */
  status: MarketStatus;
  /** Market creator address */
  creator: Address;
  /** Block height when created */
  createdAtHeight: bigint;
}

/**
 * Top-of-book snapshot.
 */
export interface TopOfBook {
  /** Market identifier */
  marketId: MarketId;
  /** Best bid price (null if no bids) */
  bestBid: bigint | null;
  /** Best ask price (null if no asks) */
  bestAsk: bigint | null;
  /** Last trade price (null if no trades) */
  lastPrice: bigint | null;
  /** Spread in ticks (null if no two-sided market) */
  spread: bigint | null;
  /** Timestamp of snapshot */
  timestamp: bigint;
}

/**
 * Order view (public order information).
 */
export interface OrderView {
  /** Unique order identifier */
  orderId: OrderId;
  /** Market identifier */
  marketId: MarketId;
  /** Order owner address */
  owner: Address;
  /** Order side */
  side: Side;
  /** Limit price */
  price: bigint;
  /** Original order size */
  size: bigint;
  /** Remaining unfilled size */
  remaining: bigint;
  /** Current status */
  status: OrderStatus;
  /** Order flags */
  flags: OrderFlag[];
  /** Associated grid (if LP order) */
  gridId?: GridId;
  /** Block height when created */
  createdAt: bigint;
}

/**
 * Price level in orderbook.
 */
export interface PriceLevelView {
  /** Price level */
  price: bigint;
  /** Side of the book */
  side: Side;
  /** Aggregate size at this level */
  size: bigint;
  /** Number of orders at this level */
  orderCount: number;
}

/**
 * Orderbook snapshot.
 */
export interface OrderbookView {
  /** Market identifier */
  marketId: MarketId;
  /** Bid levels (sorted best to worst) */
  bids: PriceLevelView[];
  /** Ask levels (sorted best to worst) */
  asks: PriceLevelView[];
  /** Timestamp of snapshot */
  timestamp: bigint;
}

// ============================================================================
// Trade Types
// ============================================================================

/**
 * Executed trade information.
 */
export interface TradeView {
  /** Unique trade identifier */
  tradeId: TradeId;
  /** Market identifier */
  marketId: MarketId;
  /** Maker (passive) address */
  maker: Address;
  /** Taker (aggressive) address */
  taker: Address;
  /** Trade side from taker's perspective */
  side: Side;
  /** Execution price */
  price: bigint;
  /** Trade size in base token units */
  size: bigint;
  /** Quote amount (price * size) */
  quoteAmount: bigint;
  /** Fee paid by taker */
  takerFee: bigint;
  /** Fee paid/rebate for maker */
  makerFee: bigint;
  /** Block height of execution */
  height: bigint;
  /** Logical timestamp within block */
  timestamp: bigint;
}

// ============================================================================
// LP Grid Types
// ============================================================================

/**
 * LP grid configuration for placing.
 */
export interface LPGridConfig {
  /** Market to place grid on */
  marketId: MarketId;
  /** Center price for the grid */
  centerPrice: bigint;
  /** Price distance around center */
  halfWidth: bigint;
  /** Number of levels per side (max 64) */
  levelsPerSide: number;
  /** Spread calculation mode */
  mode: SpreadMode;
  /** Geometric ratio (for geometric mode, scaled by 1e6) */
  geomRatio?: bigint;
  /** Total base token amount to allocate */
  totalBaseSize: bigint;
  /** Which sides to place orders on */
  sideBias: SideBias;
}

/**
 * LP grid status view.
 */
export interface LPGridView {
  /** Unique grid identifier */
  gridId: GridId;
  /** Market identifier */
  marketId: MarketId;
  /** Grid owner address */
  owner: Address;
  /** Grid configuration */
  config: LPGridConfig;
  /** Current status */
  status: 'active' | 'paused' | 'cancelled';
  /** Order IDs belonging to this grid */
  orderIds: OrderId[];
  /** Block height when created */
  createdAt: bigint;
}

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction receipt with finality information.
 */
export interface TxReceipt {
  /** Transaction hash */
  txHash: Hex32;
  /** Current trust tier */
  trustTier: TrustTier;
  /** Block height (if included) */
  height?: bigint;
  /** Block hash (if included) */
  blockHash?: Hex32;
  /** Transaction index within block */
  txIndex?: number;
  /** Gas used */
  gasUsed: bigint;
  /** Whether transaction succeeded */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
  /** Events emitted */
  events: TxEvent[];
}

/**
 * Transaction event.
 */
export interface TxEvent {
  /** Event type */
  type: string;
  /** Event data (varies by type) */
  data: Record<string, unknown>;
}

/**
 * Options for waiting on transaction finality.
 */
export interface WaitOptions {
  /** Minimum trust tier to wait for */
  minTrust?: TrustTier;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Polling interval in milliseconds */
  pollIntervalMs?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * SDK error codes for exhaustive error handling.
 *
 * @example
 * ```ts
 * switch (result.code) {
 *   case SdkErrorCode.AUTH_EXPIRED:
 *     // Re-authenticate
 *     break;
 *   case SdkErrorCode.INSUFFICIENT_BALANCE:
 *     // Show balance error
 *     break;
 *   // TypeScript ensures all cases are handled
 * }
 * ```
 */
export enum SdkErrorCode {
  // === Authentication Errors (1xx) ===
  /** Auth token missing or invalid format */
  AUTH_INVALID = 'AUTH_INVALID',
  /** Auth token has expired */
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  /** Signature verification failed */
  AUTH_SIGNATURE_FAILED = 'AUTH_SIGNATURE_FAILED',
  /** Insufficient permissions for operation */
  AUTH_PERMISSION_DENIED = 'AUTH_PERMISSION_DENIED',
  /** Token scope doesn't include required operation */
  AUTH_SCOPE_INSUFFICIENT = 'AUTH_SCOPE_INSUFFICIENT',

  // === Network/RPC Errors (2xx) ===
  /** Failed to connect to RPC endpoint */
  NETWORK_CONNECTION_FAILED = 'NETWORK_CONNECTION_FAILED',
  /** Request timed out */
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  /** RPC endpoint returned error */
  NETWORK_RPC_ERROR = 'NETWORK_RPC_ERROR',
  /** Rate limit exceeded */
  NETWORK_RATE_LIMITED = 'NETWORK_RATE_LIMITED',
  /** Invalid response from server */
  NETWORK_INVALID_RESPONSE = 'NETWORK_INVALID_RESPONSE',

  // === Validation Errors (3xx) ===
  /** Invalid input parameter */
  VALIDATION_INVALID_INPUT = 'VALIDATION_INVALID_INPUT',
  /** Required parameter missing */
  VALIDATION_MISSING_PARAM = 'VALIDATION_MISSING_PARAM',
  /** Parameter out of allowed range */
  VALIDATION_OUT_OF_RANGE = 'VALIDATION_OUT_OF_RANGE',
  /** Invalid type format (address, tokenId, etc.) */
  VALIDATION_TYPE_ERROR = 'VALIDATION_TYPE_ERROR',
  /** Invalid price (zero, negative, or exceeds tick) */
  VALIDATION_INVALID_PRICE = 'VALIDATION_INVALID_PRICE',
  /** Invalid size (zero, negative, or below lot) */
  VALIDATION_INVALID_SIZE = 'VALIDATION_INVALID_SIZE',

  // === Chain/State Errors (4xx) ===
  /** Token not found */
  CHAIN_TOKEN_NOT_FOUND = 'CHAIN_TOKEN_NOT_FOUND',
  /** Market not found */
  CHAIN_MARKET_NOT_FOUND = 'CHAIN_MARKET_NOT_FOUND',
  /** Order not found */
  CHAIN_ORDER_NOT_FOUND = 'CHAIN_ORDER_NOT_FOUND',
  /** Grid not found */
  CHAIN_GRID_NOT_FOUND = 'CHAIN_GRID_NOT_FOUND',
  /** Insufficient balance for operation */
  CHAIN_INSUFFICIENT_BALANCE = 'CHAIN_INSUFFICIENT_BALANCE',
  /** Market is paused */
  CHAIN_MARKET_PAUSED = 'CHAIN_MARKET_PAUSED',
  /** Market is closed */
  CHAIN_MARKET_CLOSED = 'CHAIN_MARKET_CLOSED',
  /** Order already cancelled */
  CHAIN_ORDER_CANCELLED = 'CHAIN_ORDER_CANCELLED',
  /** Order already filled */
  CHAIN_ORDER_FILLED = 'CHAIN_ORDER_FILLED',
  /** Would self-trade (maker == taker) */
  CHAIN_SELF_TRADE = 'CHAIN_SELF_TRADE',
  /** Post-only order would cross */
  CHAIN_WOULD_CROSS = 'CHAIN_WOULD_CROSS',
  /** OCC version conflict */
  CHAIN_VERSION_CONFLICT = 'CHAIN_VERSION_CONFLICT',

  // === Transaction Errors (5xx) ===
  /** Transaction submission failed */
  TX_SUBMISSION_FAILED = 'TX_SUBMISSION_FAILED',
  /** Transaction rejected by mempool */
  TX_REJECTED = 'TX_REJECTED',
  /** Transaction execution failed */
  TX_EXECUTION_FAILED = 'TX_EXECUTION_FAILED',
  /** Transaction reverted */
  TX_REVERTED = 'TX_REVERTED',
  /** Insufficient gas */
  TX_INSUFFICIENT_GAS = 'TX_INSUFFICIENT_GAS',
  /** Nonce already used */
  TX_NONCE_USED = 'TX_NONCE_USED',
  /** Wait for finality timed out */
  TX_WAIT_TIMEOUT = 'TX_WAIT_TIMEOUT',

  // === Business Logic Errors (6xx) ===
  /** Operation not supported */
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  /** Operation not yet implemented */
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  /** Resource not found (generic) */
  NOT_FOUND = 'NOT_FOUND',
  /** Operation cancelled by user */
  CANCELLED = 'CANCELLED',

  // === Unknown/Internal Errors (9xx) ===
  /** Unknown error occurred */
  UNKNOWN = 'UNKNOWN',
  /** Internal SDK error */
  INTERNAL = 'INTERNAL',
}

/**
 * Structured SDK error with full context.
 *
 * @example
 * ```ts
 * if (!result.success && result.error) {
 *   console.error(`Error [${result.error.code}]: ${result.error.message}`);
 *   if (result.error.chainCode) {
 *     console.error(`Chain error: ${result.error.chainCode}`);
 *   }
 * }
 * ```
 */
export interface SdkError {
  /** SDK error code for programmatic handling */
  code: SdkErrorCode;
  /** Human-readable error message */
  message: string;
  /** Underlying chain error code (if applicable) */
  chainCode?: string;
  /** Underlying chain error message (if applicable) */
  chainMessage?: string;
  /** Additional error context */
  details?: Record<string, unknown>;
  /** Stack trace (debug builds only) */
  stack?: string;
}

/**
 * Create an SdkError from code and message.
 */
export function createSdkError(
  code: SdkErrorCode,
  message: string,
  details?: Partial<Omit<SdkError, 'code' | 'message'>>
): SdkError {
  return {
    code,
    message,
    ...details,
  };
}

/**
 * Type guard to check if an error is an SdkError.
 */
export function isSdkError(error: unknown): error is SdkError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as SdkError).code === 'string' &&
    Object.values(SdkErrorCode).includes((error as SdkError).code)
  );
}

/**
 * Map chain error codes to SDK error codes.
 */
export function mapChainError(chainCode: string, chainMessage?: string): SdkError {
  const mapping: Record<string, SdkErrorCode> = {
    'TOKEN_NOT_FOUND': SdkErrorCode.CHAIN_TOKEN_NOT_FOUND,
    'MARKET_NOT_FOUND': SdkErrorCode.CHAIN_MARKET_NOT_FOUND,
    'ORDER_NOT_FOUND': SdkErrorCode.CHAIN_ORDER_NOT_FOUND,
    'GRID_NOT_FOUND': SdkErrorCode.CHAIN_GRID_NOT_FOUND,
    'INSUFFICIENT_BALANCE': SdkErrorCode.CHAIN_INSUFFICIENT_BALANCE,
    'MARKET_PAUSED': SdkErrorCode.CHAIN_MARKET_PAUSED,
    'MARKET_CLOSED': SdkErrorCode.CHAIN_MARKET_CLOSED,
    'ORDER_CANCELLED': SdkErrorCode.CHAIN_ORDER_CANCELLED,
    'ORDER_FILLED': SdkErrorCode.CHAIN_ORDER_FILLED,
    'SELF_TRADE': SdkErrorCode.CHAIN_SELF_TRADE,
    'WOULD_CROSS': SdkErrorCode.CHAIN_WOULD_CROSS,
    'VERSION_CONFLICT': SdkErrorCode.CHAIN_VERSION_CONFLICT,
    'AUTH_EXPIRED': SdkErrorCode.AUTH_EXPIRED,
    'AUTH_INVALID': SdkErrorCode.AUTH_INVALID,
    'PERMISSION_DENIED': SdkErrorCode.AUTH_PERMISSION_DENIED,
  };

  const sdkCode = mapping[chainCode] ?? SdkErrorCode.UNKNOWN;

  return {
    code: sdkCode,
    message: chainMessage ?? `Chain error: ${chainCode}`,
    chainCode,
    chainMessage,
  };
}

// ============================================================================
// SDK Result Types
// ============================================================================

/**
 * Generic SDK result wrapper with structured errors.
 *
 * @example Success case:
 * ```ts
 * const result = await sdk.tokens.getBalance(tokenId, address);
 * if (result.success) {
 *   console.log('Balance:', result.data.available);
 * }
 * ```
 *
 * @example Error handling (new style):
 * ```ts
 * if (!result.success) {
 *   if (typeof result.error === 'object' && result.error) {
 *     switch (result.error.code) {
 *       case SdkErrorCode.CHAIN_TOKEN_NOT_FOUND:
 *         // Handle missing token
 *         break;
 *     }
 *   } else {
 *     console.error('Error:', result.error);
 *   }
 * }
 * ```
 */
export interface SdkResult<T> {
  /** Whether operation succeeded */
  success: boolean;
  /** Result data (if successful) */
  data?: T;
  /** Error (string for simple errors, SdkError for structured errors) */
  error?: string | SdkError;
  /** Error code for programmatic handling */
  code?: string;
}

/**
 * Helper to check if an error is a structured SdkError.
 */
export function isStructuredError(error: string | SdkError | undefined): error is SdkError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

/**
 * Create a simple error result.
 */
export function errorResult<T>(message: string, code?: string): SdkResult<T> {
  return {
    success: false,
    error: message,
    code,
  };
}

/**
 * Create a structured error result.
 */
export function structuredErrorResult<T>(error: SdkError): SdkResult<T> {
  return {
    success: false,
    error: error,
    code: error.code,
  };
}

/**
 * Create a success result.
 */
export function successResult<T>(data: T): SdkResult<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Order placement result.
 */
export interface PlaceOrderResult {
  /** Created order ID */
  orderId: OrderId;
  /** Immediate fills (if crossed book) */
  fills: TradeView[];
  /** Remaining unfilled size */
  remainingSize: bigint;
  /** Transaction receipt */
  receipt: TxReceipt;
}

/**
 * Grid creation result.
 */
export interface CreateGridResult {
  /** Created grid ID */
  gridId: GridId;
  /** Created order IDs */
  orderIds: OrderId[];
  /** Number of levels created */
  levelsCreated: number;
  /** Transaction receipt */
  receipt: TxReceipt;
}

/**
 * Cancel order result.
 */
export interface CancelOrderResult {
  /** Cancelled order ID */
  orderId: OrderId;
  /** Amount returned from escrow */
  returnedAmount: bigint;
  /** Transaction receipt */
  receipt: TxReceipt;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum levels per side for LP grids */
export const MAX_LEVELS_PER_SIDE = 64;

/** Maximum matches per single match call */
export const MAX_MATCHES_PER_CALL = 100;

/** Fixed-point scale for geometric ratio (1e6 = 1.0) */
export const GEOM_RATIO_SCALE = 1_000_000n;

/** Default clock skew tolerance in seconds */
export const DEFAULT_CLOCK_SKEW_SECONDS = 30;

/** Default token TTL in seconds */
export const DEFAULT_TOKEN_TTL_SECONDS = 300;
