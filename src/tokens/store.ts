/**
 * Token Store - State management for FT, NFT, and SFT tokens
 *
 * Provides CRUD operations with optimistic concurrency control.
 */

import {
  TokenId,
  TokenInstanceId,
  TokenClassId,
  TokenType,
  FungibleToken,
  NFTCollection,
  NFTInstance,
  SFTCollection,
  SFTClass,
  FTBalance,
  FTAllowance,
  SFTBalance,
  NFTApproval,
  NFTOperatorApproval,
  SFTOperatorApproval,
  AnyToken,
  TransferRequest,
  MintRequest,
  BurnRequest,
  makeTokenId,
  makeTokenInstanceId,
  makeTokenClassId,
  isFT,
  isNFT,
  isSFT,
  ZERO_ADDRESS,
} from './types';

// ============================================================================
// Store Interface
// ============================================================================

export interface TokenStore {
  // Token CRUD
  createToken(token: AnyToken): Promise<void>;
  getToken(tokenId: TokenId): Promise<AnyToken | undefined>;
  updateToken(tokenId: TokenId, updates: Partial<AnyToken>, expectedVersion: bigint): Promise<void>;
  listTokens(type?: TokenType, creator?: string): Promise<AnyToken[]>;

  // FT Operations
  getFTBalance(tokenId: TokenId, holder: string): Promise<FTBalance | undefined>;
  setFTBalance(balance: FTBalance): Promise<void>;
  getFTAllowance(tokenId: TokenId, owner: string, spender: string): Promise<FTAllowance | undefined>;
  setFTAllowance(allowance: FTAllowance): Promise<void>;

  // NFT Operations
  createNFTInstance(instance: NFTInstance): Promise<void>;
  getNFTInstance(tokenId: TokenId, instanceId: TokenInstanceId): Promise<NFTInstance | undefined>;
  updateNFTInstance(tokenId: TokenId, instanceId: TokenInstanceId, updates: Partial<NFTInstance>, expectedVersion: bigint): Promise<void>;
  listNFTInstances(tokenId: TokenId, owner?: string): Promise<NFTInstance[]>;
  getNFTApproval(tokenId: TokenId, instanceId: TokenInstanceId): Promise<NFTApproval | undefined>;
  setNFTApproval(approval: NFTApproval | null, tokenId: TokenId, instanceId: TokenInstanceId): Promise<void>;
  getNFTOperatorApproval(tokenId: TokenId, owner: string, operator: string): Promise<boolean>;
  setNFTOperatorApproval(approval: NFTOperatorApproval): Promise<void>;

  // SFT Operations
  createSFTClass(cls: SFTClass): Promise<void>;
  getSFTClass(tokenId: TokenId, classId: TokenClassId): Promise<SFTClass | undefined>;
  updateSFTClass(tokenId: TokenId, classId: TokenClassId, updates: Partial<SFTClass>, expectedVersion: bigint): Promise<void>;
  listSFTClasses(tokenId: TokenId): Promise<SFTClass[]>;
  getSFTBalance(tokenId: TokenId, classId: TokenClassId, holder: string): Promise<SFTBalance | undefined>;
  setSFTBalance(balance: SFTBalance): Promise<void>;
  getSFTOperatorApproval(tokenId: TokenId, owner: string, operator: string): Promise<boolean>;
  setSFTOperatorApproval(approval: SFTOperatorApproval): Promise<void>;
}

// ============================================================================
// Errors
// ============================================================================

export class TokenNotFoundError extends Error {
  constructor(public tokenId: TokenId) {
    super(`Token not found: ${tokenId}`);
    this.name = 'TokenNotFoundError';
  }
}

export class TokenExistsError extends Error {
  constructor(public tokenId: TokenId) {
    super(`Token already exists: ${tokenId}`);
    this.name = 'TokenExistsError';
  }
}

export class TokenConcurrencyError extends Error {
  constructor(
    public tokenId: TokenId,
    public expectedVersion: bigint,
    public actualVersion: bigint
  ) {
    super(`Concurrency conflict on token ${tokenId}: expected v${expectedVersion}, got v${actualVersion}`);
    this.name = 'TokenConcurrencyError';
  }
}

export class InsufficientBalanceError extends Error {
  constructor(
    public tokenId: TokenId,
    public holder: string,
    public required: bigint,
    public available: bigint
  ) {
    super(`Insufficient balance: ${holder} has ${available}, needs ${required}`);
    this.name = 'InsufficientBalanceError';
  }
}

export class TokenPausedError extends Error {
  constructor(public tokenId: TokenId) {
    super(`Token is paused: ${tokenId}`);
    this.name = 'TokenPausedError';
  }
}

export class UnauthorizedError extends Error {
  constructor(public message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

export class InMemoryTokenStore implements TokenStore {
  private tokens = new Map<TokenId, AnyToken>();
  private ftBalances = new Map<string, FTBalance>(); // tokenId:holder
  private ftAllowances = new Map<string, FTAllowance>(); // tokenId:owner:spender
  private nftInstances = new Map<string, NFTInstance>(); // tokenId:instanceId
  private nftApprovals = new Map<string, NFTApproval>(); // tokenId:instanceId
  private nftOperatorApprovals = new Map<string, boolean>(); // tokenId:owner:operator
  private sftClasses = new Map<string, SFTClass>(); // tokenId:classId
  private sftBalances = new Map<string, SFTBalance>(); // tokenId:classId:holder
  private sftOperatorApprovals = new Map<string, boolean>(); // tokenId:owner:operator

  // -------------------------------------------------------------------------
  // Token CRUD
  // -------------------------------------------------------------------------

  async createToken(token: AnyToken): Promise<void> {
    if (this.tokens.has(token.tokenId)) {
      throw new TokenExistsError(token.tokenId);
    }
    this.tokens.set(token.tokenId, this.cloneToken(token));
  }

  async getToken(tokenId: TokenId): Promise<AnyToken | undefined> {
    const token = this.tokens.get(tokenId);
    return token ? this.cloneToken(token) : undefined;
  }

  async updateToken(tokenId: TokenId, updates: Partial<AnyToken>, expectedVersion: bigint): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw new TokenNotFoundError(tokenId);
    }
    if (token.version !== expectedVersion) {
      throw new TokenConcurrencyError(tokenId, expectedVersion, token.version);
    }

    const updated = {
      ...token,
      ...updates,
      tokenId, // prevent overwrite
      type: token.type, // prevent type change
      version: token.version + 1n,
    } as AnyToken;

    this.tokens.set(tokenId, updated);
  }

  async listTokens(type?: TokenType, creator?: string): Promise<AnyToken[]> {
    let result = Array.from(this.tokens.values());
    if (type) {
      result = result.filter(t => t.type === type);
    }
    if (creator) {
      result = result.filter(t => t.creator === creator);
    }
    return result.map(t => this.cloneToken(t));
  }

  // -------------------------------------------------------------------------
  // FT Operations
  // -------------------------------------------------------------------------

  private ftBalanceKey(tokenId: TokenId, holder: string): string {
    return `${tokenId}:${holder}`;
  }

  private ftAllowanceKey(tokenId: TokenId, owner: string, spender: string): string {
    return `${tokenId}:${owner}:${spender}`;
  }

  async getFTBalance(tokenId: TokenId, holder: string): Promise<FTBalance | undefined> {
    const balance = this.ftBalances.get(this.ftBalanceKey(tokenId, holder));
    return balance ? { ...balance } : undefined;
  }

  async setFTBalance(balance: FTBalance): Promise<void> {
    this.ftBalances.set(this.ftBalanceKey(balance.tokenId, balance.holder), { ...balance });
  }

  async getFTAllowance(tokenId: TokenId, owner: string, spender: string): Promise<FTAllowance | undefined> {
    const allowance = this.ftAllowances.get(this.ftAllowanceKey(tokenId, owner, spender));
    return allowance ? { ...allowance } : undefined;
  }

  async setFTAllowance(allowance: FTAllowance): Promise<void> {
    this.ftAllowances.set(
      this.ftAllowanceKey(allowance.tokenId, allowance.owner, allowance.spender),
      { ...allowance }
    );
  }

  // -------------------------------------------------------------------------
  // NFT Operations
  // -------------------------------------------------------------------------

  private nftKey(tokenId: TokenId, instanceId: TokenInstanceId): string {
    return `${tokenId}:${instanceId}`;
  }

  private nftOperatorKey(tokenId: TokenId, owner: string, operator: string): string {
    return `${tokenId}:${owner}:${operator}`;
  }

  async createNFTInstance(instance: NFTInstance): Promise<void> {
    const key = this.nftKey(instance.tokenId, instance.instanceId);
    if (this.nftInstances.has(key)) {
      throw new Error(`NFT instance already exists: ${key}`);
    }
    this.nftInstances.set(key, { ...instance });
  }

  async getNFTInstance(tokenId: TokenId, instanceId: TokenInstanceId): Promise<NFTInstance | undefined> {
    const instance = this.nftInstances.get(this.nftKey(tokenId, instanceId));
    return instance ? { ...instance } : undefined;
  }

  async updateNFTInstance(
    tokenId: TokenId,
    instanceId: TokenInstanceId,
    updates: Partial<NFTInstance>,
    expectedVersion: bigint
  ): Promise<void> {
    const key = this.nftKey(tokenId, instanceId);
    const instance = this.nftInstances.get(key);
    if (!instance) {
      throw new Error(`NFT instance not found: ${key}`);
    }
    if (instance.version !== expectedVersion) {
      throw new TokenConcurrencyError(tokenId, expectedVersion, instance.version);
    }

    this.nftInstances.set(key, {
      ...instance,
      ...updates,
      tokenId,
      instanceId,
      version: instance.version + 1n,
    });
  }

  async listNFTInstances(tokenId: TokenId, owner?: string): Promise<NFTInstance[]> {
    const prefix = `${tokenId}:`;
    const result: NFTInstance[] = [];

    for (const [key, instance] of this.nftInstances) {
      if (key.startsWith(prefix)) {
        if (!owner || instance.owner === owner) {
          result.push({ ...instance });
        }
      }
    }

    return result;
  }

  async getNFTApproval(tokenId: TokenId, instanceId: TokenInstanceId): Promise<NFTApproval | undefined> {
    const approval = this.nftApprovals.get(this.nftKey(tokenId, instanceId));
    return approval ? { ...approval } : undefined;
  }

  async setNFTApproval(approval: NFTApproval | null, tokenId: TokenId, instanceId: TokenInstanceId): Promise<void> {
    const key = this.nftKey(tokenId, instanceId);
    if (approval) {
      this.nftApprovals.set(key, { ...approval });
    } else {
      this.nftApprovals.delete(key);
    }
  }

  async getNFTOperatorApproval(tokenId: TokenId, owner: string, operator: string): Promise<boolean> {
    return this.nftOperatorApprovals.get(this.nftOperatorKey(tokenId, owner, operator)) ?? false;
  }

  async setNFTOperatorApproval(approval: NFTOperatorApproval): Promise<void> {
    this.nftOperatorApprovals.set(
      this.nftOperatorKey(approval.tokenId, approval.owner, approval.operator),
      approval.approved
    );
  }

  // -------------------------------------------------------------------------
  // SFT Operations
  // -------------------------------------------------------------------------

  private sftClassKey(tokenId: TokenId, classId: TokenClassId): string {
    return `${tokenId}:${classId}`;
  }

  private sftBalanceKey(tokenId: TokenId, classId: TokenClassId, holder: string): string {
    return `${tokenId}:${classId}:${holder}`;
  }

  private sftOperatorKey(tokenId: TokenId, owner: string, operator: string): string {
    return `${tokenId}:${owner}:${operator}`;
  }

  async createSFTClass(cls: SFTClass): Promise<void> {
    const key = this.sftClassKey(cls.tokenId, cls.classId);
    if (this.sftClasses.has(key)) {
      throw new Error(`SFT class already exists: ${key}`);
    }
    this.sftClasses.set(key, { ...cls });
  }

  async getSFTClass(tokenId: TokenId, classId: TokenClassId): Promise<SFTClass | undefined> {
    const cls = this.sftClasses.get(this.sftClassKey(tokenId, classId));
    return cls ? { ...cls } : undefined;
  }

  async updateSFTClass(
    tokenId: TokenId,
    classId: TokenClassId,
    updates: Partial<SFTClass>,
    expectedVersion: bigint
  ): Promise<void> {
    const key = this.sftClassKey(tokenId, classId);
    const cls = this.sftClasses.get(key);
    if (!cls) {
      throw new Error(`SFT class not found: ${key}`);
    }
    if (cls.version !== expectedVersion) {
      throw new TokenConcurrencyError(tokenId, expectedVersion, cls.version);
    }

    this.sftClasses.set(key, {
      ...cls,
      ...updates,
      tokenId,
      classId,
      version: cls.version + 1n,
    });
  }

  async listSFTClasses(tokenId: TokenId): Promise<SFTClass[]> {
    const prefix = `${tokenId}:`;
    const result: SFTClass[] = [];

    for (const [key, cls] of this.sftClasses) {
      if (key.startsWith(prefix)) {
        result.push({ ...cls });
      }
    }

    return result;
  }

  async getSFTBalance(tokenId: TokenId, classId: TokenClassId, holder: string): Promise<SFTBalance | undefined> {
    const balance = this.sftBalances.get(this.sftBalanceKey(tokenId, classId, holder));
    return balance ? { ...balance } : undefined;
  }

  async setSFTBalance(balance: SFTBalance): Promise<void> {
    this.sftBalances.set(
      this.sftBalanceKey(balance.tokenId, balance.classId, balance.holder),
      { ...balance }
    );
  }

  async getSFTOperatorApproval(tokenId: TokenId, owner: string, operator: string): Promise<boolean> {
    return this.sftOperatorApprovals.get(this.sftOperatorKey(tokenId, owner, operator)) ?? false;
  }

  async setSFTOperatorApproval(approval: SFTOperatorApproval): Promise<void> {
    this.sftOperatorApprovals.set(
      this.sftOperatorKey(approval.tokenId, approval.owner, approval.operator),
      approval.approved
    );
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private cloneToken(token: AnyToken): AnyToken {
    return JSON.parse(JSON.stringify(token, (_key, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    ), (_key, value) => {
      if (typeof value === 'string' && value.endsWith('n') && /^\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
      }
      return value;
    });
  }

  clear(): void {
    this.tokens.clear();
    this.ftBalances.clear();
    this.ftAllowances.clear();
    this.nftInstances.clear();
    this.nftApprovals.clear();
    this.nftOperatorApprovals.clear();
    this.sftClasses.clear();
    this.sftBalances.clear();
    this.sftOperatorApprovals.clear();
  }

  stats(): {
    tokens: number;
    ftBalances: number;
    nftInstances: number;
    sftClasses: number;
  } {
    return {
      tokens: this.tokens.size,
      ftBalances: this.ftBalances.size,
      nftInstances: this.nftInstances.size,
      sftClasses: this.sftClasses.size,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createTokenStore(): TokenStore {
  return new InMemoryTokenStore();
}

// ============================================================================
// ID Generators
// ============================================================================

import crypto from 'crypto';

function simpleHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function generateTokenId(creator: string, symbol: string, nonce: bigint): TokenId {
  const input = `token:${creator}:${symbol}:${nonce}`;
  return makeTokenId(`tok_${simpleHash(input)}`);
}

export function generateInstanceId(tokenId: TokenId, nonce: bigint): TokenInstanceId {
  const input = `instance:${tokenId}:${nonce}`;
  return makeTokenInstanceId(`inst_${simpleHash(input)}`);
}

export function generateClassId(tokenId: TokenId, name: string, nonce: bigint): TokenClassId {
  const input = `class:${tokenId}:${name}:${nonce}`;
  return makeTokenClassId(`cls_${simpleHash(input)}`);
}
