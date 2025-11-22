/**
 * Token Deployer - Simple 2-line deploy patterns for FT, NFT, and SFT
 *
 * Usage:
 *   const ft = await deployer.deployFT({ symbol: 'USDC', decimals: 6 });
 *   await ft.mint(recipient, 1000000n);
 *
 *   const nft = await deployer.deployNFT({ symbol: 'PUNK' });
 *   await nft.mint(recipient, { name: 'Punk #1' });
 */

import {
  TokenId,
  TokenInstanceId,
  TokenClassId,
  TokenType,
  TokenStandard,
  FungibleToken,
  NFTCollection,
  NFTInstance,
  SFTCollection,
  SFTClass,
  FTBalance,
  SFTBalance,
  BaseTokenMetadata,
  TransferRequest,
  isValidSymbol,
  isValidName,
  isValidDecimals,
  isValidRoyaltyBps,
  makeTokenId,
} from './types';
import {
  TokenStore,
  InMemoryTokenStore,
  generateTokenId,
  generateInstanceId,
  generateClassId,
  TokenNotFoundError,
  InsufficientBalanceError,
  TokenPausedError,
  UnauthorizedError,
} from './store';

// ============================================================================
// Deploy Options
// ============================================================================

/** Options for deploying a fungible token */
export interface DeployFTOptions {
  /** Token symbol (2-10 chars, uppercase) */
  symbol: string;
  /** Token name (defaults to symbol) */
  name?: string;
  /** Decimal places (0-18, defaults to 18) */
  decimals?: number;
  /** Initial supply to mint to deployer */
  initialSupply?: bigint;
  /** Maximum supply (0 = unlimited) */
  maxSupply?: bigint;
  /** Is minting enabled after deploy */
  mintable?: boolean;
  /** Is burning enabled */
  burnable?: boolean;
  /** Optional metadata */
  metadata?: BaseTokenMetadata;
}

/** Options for deploying an NFT collection */
export interface DeployNFTOptions {
  /** Collection symbol */
  symbol: string;
  /** Collection name */
  name?: string;
  /** Maximum supply (0 = unlimited) */
  maxSupply?: bigint;
  /** Base URI for token metadata */
  baseUri?: string;
  /** Is minting enabled */
  mintable?: boolean;
  /** Is burning enabled */
  burnable?: boolean;
  /** Royalty percentage in basis points (e.g., 250 = 2.5%) */
  royaltyBps?: number;
  /** Royalty receiver (defaults to deployer) */
  royaltyReceiver?: string;
  /** Collection metadata */
  metadata?: BaseTokenMetadata;
}

/** Options for deploying an SFT collection */
export interface DeploySFTOptions {
  /** Collection symbol */
  symbol: string;
  /** Collection name */
  name?: string;
  /** Base URI */
  baseUri?: string;
  /** Is minting enabled */
  mintable?: boolean;
  /** Is burning enabled */
  burnable?: boolean;
  /** Collection metadata */
  metadata?: BaseTokenMetadata;
}

// ============================================================================
// Token Handles (fluent API)
// ============================================================================

/** Fungible token handle for operations */
export class FTHandle {
  constructor(
    private store: TokenStore,
    private token: FungibleToken,
    private caller: string
  ) {}

  get tokenId(): TokenId {
    return this.token.tokenId;
  }

  get info(): FungibleToken {
    return { ...this.token };
  }

  /** Mint new tokens */
  async mint(to: string, amount: bigint): Promise<void> {
    await this.refresh();

    if (!this.token.mintable) {
      throw new UnauthorizedError('Token is not mintable');
    }
    if (this.token.paused) {
      throw new TokenPausedError(this.token.tokenId);
    }
    if (this.caller !== this.token.owner) {
      throw new UnauthorizedError('Only owner can mint');
    }
    if (this.token.maxSupply > 0n && this.token.totalSupply + amount > this.token.maxSupply) {
      throw new Error('Would exceed max supply');
    }

    // Update balance
    const balance = await this.store.getFTBalance(this.token.tokenId, to) ?? {
      tokenId: this.token.tokenId,
      holder: to,
      balance: 0n,
      locked: 0n,
      version: 0n,
    };
    balance.balance += amount;
    balance.version += 1n;
    await this.store.setFTBalance(balance);

    // Update total supply
    await this.store.updateToken(this.token.tokenId, {
      totalSupply: this.token.totalSupply + amount,
    }, this.token.version);

    await this.refresh();
  }

  /** Burn tokens */
  async burn(from: string, amount: bigint): Promise<void> {
    await this.refresh();

    if (!this.token.burnable) {
      throw new UnauthorizedError('Token is not burnable');
    }
    if (this.token.paused) {
      throw new TokenPausedError(this.token.tokenId);
    }

    // Check balance
    const balance = await this.store.getFTBalance(this.token.tokenId, from);
    if (!balance || balance.balance - balance.locked < amount) {
      throw new InsufficientBalanceError(
        this.token.tokenId,
        from,
        amount,
        balance?.balance ?? 0n
      );
    }

    // Check authorization
    if (from !== this.caller) {
      const allowance = await this.store.getFTAllowance(this.token.tokenId, from, this.caller);
      if (!allowance || allowance.amount < amount) {
        throw new UnauthorizedError('Insufficient allowance');
      }
      // Reduce allowance
      allowance.amount -= amount;
      allowance.version += 1n;
      await this.store.setFTAllowance(allowance);
    }

    // Update balance
    balance.balance -= amount;
    balance.version += 1n;
    await this.store.setFTBalance(balance);

    // Update total supply
    await this.store.updateToken(this.token.tokenId, {
      totalSupply: this.token.totalSupply - amount,
    }, this.token.version);

    await this.refresh();
  }

  /** Transfer tokens */
  async transfer(to: string, amount: bigint): Promise<void> {
    await this.transferFrom(this.caller, to, amount);
  }

  /** Transfer tokens from another account */
  async transferFrom(from: string, to: string, amount: bigint): Promise<void> {
    await this.refresh();

    if (this.token.paused) {
      throw new TokenPausedError(this.token.tokenId);
    }

    // Get sender balance
    const fromBalance = await this.store.getFTBalance(this.token.tokenId, from);
    if (!fromBalance || fromBalance.balance - fromBalance.locked < amount) {
      throw new InsufficientBalanceError(
        this.token.tokenId,
        from,
        amount,
        fromBalance?.balance ?? 0n
      );
    }

    // Check authorization if not self
    if (from !== this.caller) {
      const allowance = await this.store.getFTAllowance(this.token.tokenId, from, this.caller);
      if (!allowance || allowance.amount < amount) {
        throw new UnauthorizedError('Insufficient allowance');
      }
      // Reduce allowance
      allowance.amount -= amount;
      allowance.version += 1n;
      await this.store.setFTAllowance(allowance);
    }

    // Update sender balance
    fromBalance.balance -= amount;
    fromBalance.version += 1n;
    await this.store.setFTBalance(fromBalance);

    // Update recipient balance
    const toBalance = await this.store.getFTBalance(this.token.tokenId, to) ?? {
      tokenId: this.token.tokenId,
      holder: to,
      balance: 0n,
      locked: 0n,
      version: 0n,
    };
    toBalance.balance += amount;
    toBalance.version += 1n;
    await this.store.setFTBalance(toBalance);
  }

  /** Approve spender */
  async approve(spender: string, amount: bigint, expiresAt: bigint = 0n): Promise<void> {
    await this.store.setFTAllowance({
      tokenId: this.token.tokenId,
      owner: this.caller,
      spender,
      amount,
      expiresAt,
      version: 0n,
    });
  }

  /** Get balance */
  async balanceOf(holder: string): Promise<bigint> {
    const balance = await this.store.getFTBalance(this.token.tokenId, holder);
    return balance?.balance ?? 0n;
  }

  /** Get allowance */
  async allowance(owner: string, spender: string): Promise<bigint> {
    const allowance = await this.store.getFTAllowance(this.token.tokenId, owner, spender);
    return allowance?.amount ?? 0n;
  }

  /** Pause token (owner only) */
  async pause(): Promise<void> {
    await this.refresh();
    if (this.caller !== this.token.owner) {
      throw new UnauthorizedError('Only owner can pause');
    }
    await this.store.updateToken(this.token.tokenId, { paused: true }, this.token.version);
    await this.refresh();
  }

  /** Unpause token (owner only) */
  async unpause(): Promise<void> {
    await this.refresh();
    if (this.caller !== this.token.owner) {
      throw new UnauthorizedError('Only owner can unpause');
    }
    await this.store.updateToken(this.token.tokenId, { paused: false }, this.token.version);
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const token = await this.store.getToken(this.token.tokenId);
    if (!token || token.type !== 'FT') {
      throw new TokenNotFoundError(this.token.tokenId);
    }
    this.token = token as FungibleToken;
  }
}

/** NFT collection handle */
export class NFTHandle {
  private mintNonce = 0n;

  constructor(
    private store: TokenStore,
    private collection: NFTCollection,
    private caller: string
  ) {}

  get tokenId(): TokenId {
    return this.collection.tokenId;
  }

  get info(): NFTCollection {
    return { ...this.collection };
  }

  /** Mint a new NFT */
  async mint(to: string, metadata?: BaseTokenMetadata, tokenUri?: string): Promise<TokenInstanceId> {
    await this.refresh();

    if (!this.collection.mintable) {
      throw new UnauthorizedError('Collection is not mintable');
    }
    if (this.collection.paused) {
      throw new TokenPausedError(this.collection.tokenId);
    }
    if (this.caller !== this.collection.owner) {
      throw new UnauthorizedError('Only owner can mint');
    }
    if (this.collection.maxSupply > 0n && this.collection.totalSupply >= this.collection.maxSupply) {
      throw new Error('Would exceed max supply');
    }

    const instanceId = generateInstanceId(this.collection.tokenId, this.mintNonce++);
    const now = BigInt(Date.now());

    const instance: NFTInstance = {
      tokenId: this.collection.tokenId,
      instanceId,
      owner: to,
      tokenUri,
      metadata,
      mintedAt: now,
      mintedBy: this.caller,
      locked: false,
      version: 0n,
    };

    await this.store.createNFTInstance(instance);

    // Update collection supply
    await this.store.updateToken(this.collection.tokenId, {
      totalSupply: this.collection.totalSupply + 1n,
    }, this.collection.version);

    await this.refresh();
    return instanceId;
  }

  /** Burn an NFT */
  async burn(instanceId: TokenInstanceId): Promise<void> {
    await this.refresh();

    if (!this.collection.burnable) {
      throw new UnauthorizedError('Collection is not burnable');
    }

    const instance = await this.store.getNFTInstance(this.collection.tokenId, instanceId);
    if (!instance) {
      throw new Error(`NFT instance not found: ${instanceId}`);
    }
    if (instance.owner !== this.caller && !await this.isApprovedOrOperator(instance, this.caller)) {
      throw new UnauthorizedError('Not authorized to burn');
    }

    // Transfer to zero address (effective burn)
    await this.store.updateNFTInstance(this.collection.tokenId, instanceId, {
      owner: '0x0000000000000000000000000000000000000000',
    }, instance.version);

    // Update supply
    await this.store.updateToken(this.collection.tokenId, {
      totalSupply: this.collection.totalSupply - 1n,
    }, this.collection.version);

    await this.refresh();
  }

  /** Transfer an NFT */
  async transfer(to: string, instanceId: TokenInstanceId): Promise<void> {
    await this.transferFrom(this.caller, to, instanceId);
  }

  /** Transfer an NFT from another account */
  async transferFrom(from: string, to: string, instanceId: TokenInstanceId): Promise<void> {
    await this.refresh();

    if (this.collection.paused) {
      throw new TokenPausedError(this.collection.tokenId);
    }

    const instance = await this.store.getNFTInstance(this.collection.tokenId, instanceId);
    if (!instance) {
      throw new Error(`NFT instance not found: ${instanceId}`);
    }
    if (instance.owner !== from) {
      throw new Error('Not the owner');
    }
    if (instance.locked) {
      throw new Error('NFT is locked');
    }

    // Check authorization
    if (from !== this.caller && !await this.isApprovedOrOperator(instance, this.caller)) {
      throw new UnauthorizedError('Not authorized to transfer');
    }

    // Update ownership
    await this.store.updateNFTInstance(this.collection.tokenId, instanceId, {
      owner: to,
    }, instance.version);

    // Clear approval
    await this.store.setNFTApproval(null, this.collection.tokenId, instanceId);
  }

  /** Approve address for specific NFT */
  async approve(approved: string, instanceId: TokenInstanceId, expiresAt: bigint = 0n): Promise<void> {
    const instance = await this.store.getNFTInstance(this.collection.tokenId, instanceId);
    if (!instance) {
      throw new Error(`NFT instance not found: ${instanceId}`);
    }
    if (instance.owner !== this.caller) {
      throw new UnauthorizedError('Not the owner');
    }

    await this.store.setNFTApproval({
      tokenId: this.collection.tokenId,
      instanceId,
      owner: this.caller,
      approved,
      expiresAt,
    }, this.collection.tokenId, instanceId);
  }

  /** Set operator approval for all */
  async setApprovalForAll(operator: string, approved: boolean): Promise<void> {
    await this.store.setNFTOperatorApproval({
      tokenId: this.collection.tokenId,
      owner: this.caller,
      operator,
      approved,
    });
  }

  /** Get owner of NFT */
  async ownerOf(instanceId: TokenInstanceId): Promise<string | undefined> {
    const instance = await this.store.getNFTInstance(this.collection.tokenId, instanceId);
    return instance?.owner;
  }

  /** List NFTs owned by address */
  async tokensOf(owner: string): Promise<NFTInstance[]> {
    return this.store.listNFTInstances(this.collection.tokenId, owner);
  }

  private async isApprovedOrOperator(instance: NFTInstance, address: string): Promise<boolean> {
    // Check single approval
    const approval = await this.store.getNFTApproval(this.collection.tokenId, instance.instanceId);
    if (approval && approval.approved === address) {
      if (approval.expiresAt === 0n || approval.expiresAt > BigInt(Date.now())) {
        return true;
      }
    }

    // Check operator approval
    return this.store.getNFTOperatorApproval(this.collection.tokenId, instance.owner, address);
  }

  private async refresh(): Promise<void> {
    const token = await this.store.getToken(this.collection.tokenId);
    if (!token || token.type !== 'NFT') {
      throw new TokenNotFoundError(this.collection.tokenId);
    }
    this.collection = token as NFTCollection;
  }
}

/** SFT collection handle */
export class SFTHandle {
  private classNonce = 0n;

  constructor(
    private store: TokenStore,
    private collection: SFTCollection,
    private caller: string
  ) {}

  get tokenId(): TokenId {
    return this.collection.tokenId;
  }

  get info(): SFTCollection {
    return { ...this.collection };
  }

  /** Create a new token class */
  async createClass(
    name: string,
    options: {
      maxSupply?: bigint;
      fungible?: boolean;
      metadata?: BaseTokenMetadata;
      tokenUri?: string;
    } = {}
  ): Promise<TokenClassId> {
    await this.refresh();

    if (this.caller !== this.collection.owner) {
      throw new UnauthorizedError('Only owner can create classes');
    }

    const classId = generateClassId(this.collection.tokenId, name, this.classNonce++);
    const now = BigInt(Date.now());

    const cls: SFTClass = {
      tokenId: this.collection.tokenId,
      classId,
      name,
      totalSupply: 0n,
      maxSupply: options.maxSupply ?? 0n,
      fungible: options.fungible ?? true,
      metadata: options.metadata,
      tokenUri: options.tokenUri,
      createdAt: now,
      version: 0n,
    };

    await this.store.createSFTClass(cls);
    return classId;
  }

  /** Mint tokens of a class */
  async mint(to: string, classId: TokenClassId, amount: bigint): Promise<void> {
    await this.refresh();

    if (!this.collection.mintable) {
      throw new UnauthorizedError('Collection is not mintable');
    }
    if (this.collection.paused) {
      throw new TokenPausedError(this.collection.tokenId);
    }
    if (this.caller !== this.collection.owner) {
      throw new UnauthorizedError('Only owner can mint');
    }

    const cls = await this.store.getSFTClass(this.collection.tokenId, classId);
    if (!cls) {
      throw new Error(`Class not found: ${classId}`);
    }
    if (cls.maxSupply > 0n && cls.totalSupply + amount > cls.maxSupply) {
      throw new Error('Would exceed class max supply');
    }

    // Update balance
    const balance = await this.store.getSFTBalance(this.collection.tokenId, classId, to) ?? {
      tokenId: this.collection.tokenId,
      classId,
      holder: to,
      balance: 0n,
      locked: 0n,
      version: 0n,
    };
    balance.balance += amount;
    balance.version += 1n;
    await this.store.setSFTBalance(balance);

    // Update class supply
    await this.store.updateSFTClass(this.collection.tokenId, classId, {
      totalSupply: cls.totalSupply + amount,
    }, cls.version);
  }

  /** Transfer tokens */
  async transfer(to: string, classId: TokenClassId, amount: bigint): Promise<void> {
    await this.transferFrom(this.caller, to, classId, amount);
  }

  /** Transfer tokens from another account */
  async transferFrom(from: string, to: string, classId: TokenClassId, amount: bigint): Promise<void> {
    await this.refresh();

    if (this.collection.paused) {
      throw new TokenPausedError(this.collection.tokenId);
    }

    // Check balance
    const fromBalance = await this.store.getSFTBalance(this.collection.tokenId, classId, from);
    if (!fromBalance || fromBalance.balance - fromBalance.locked < amount) {
      throw new InsufficientBalanceError(
        this.collection.tokenId,
        from,
        amount,
        fromBalance?.balance ?? 0n
      );
    }

    // Check authorization
    if (from !== this.caller) {
      const isOperator = await this.store.getSFTOperatorApproval(this.collection.tokenId, from, this.caller);
      if (!isOperator) {
        throw new UnauthorizedError('Not authorized');
      }
    }

    // Update balances
    fromBalance.balance -= amount;
    fromBalance.version += 1n;
    await this.store.setSFTBalance(fromBalance);

    const toBalance = await this.store.getSFTBalance(this.collection.tokenId, classId, to) ?? {
      tokenId: this.collection.tokenId,
      classId,
      holder: to,
      balance: 0n,
      locked: 0n,
      version: 0n,
    };
    toBalance.balance += amount;
    toBalance.version += 1n;
    await this.store.setSFTBalance(toBalance);
  }

  /** Set operator approval */
  async setApprovalForAll(operator: string, approved: boolean): Promise<void> {
    await this.store.setSFTOperatorApproval({
      tokenId: this.collection.tokenId,
      owner: this.caller,
      operator,
      approved,
    });
  }

  /** Get balance */
  async balanceOf(holder: string, classId: TokenClassId): Promise<bigint> {
    const balance = await this.store.getSFTBalance(this.collection.tokenId, classId, holder);
    return balance?.balance ?? 0n;
  }

  /** List classes */
  async listClasses(): Promise<SFTClass[]> {
    return this.store.listSFTClasses(this.collection.tokenId);
  }

  private async refresh(): Promise<void> {
    const token = await this.store.getToken(this.collection.tokenId);
    if (!token || token.type !== 'SFT') {
      throw new TokenNotFoundError(this.collection.tokenId);
    }
    this.collection = token as SFTCollection;
  }
}

// ============================================================================
// Token Deployer
// ============================================================================

/** Token deployer for simple token creation */
export class TokenDeployer {
  private nonce = 0n;

  constructor(
    private store: TokenStore,
    private deployer: string
  ) {}

  /** Deploy a fungible token */
  async deployFT(options: DeployFTOptions): Promise<FTHandle> {
    // Validate
    if (!isValidSymbol(options.symbol)) {
      throw new Error('Invalid symbol: must be 2-10 uppercase alphanumeric chars');
    }
    const name = options.name ?? options.symbol;
    if (!isValidName(name)) {
      throw new Error('Invalid name: must be 1-64 chars');
    }
    const decimals = options.decimals ?? 18;
    if (!isValidDecimals(decimals)) {
      throw new Error('Invalid decimals: must be 0-18');
    }

    const tokenId = generateTokenId(this.deployer, options.symbol, this.nonce++);
    const now = BigInt(Date.now());

    const token: FungibleToken = {
      tokenId,
      type: 'FT',
      standard: TokenStandard.FT_V1,
      name,
      symbol: options.symbol,
      decimals,
      totalSupply: 0n,
      maxSupply: options.maxSupply ?? 0n,
      creator: this.deployer,
      owner: this.deployer,
      mintable: options.mintable ?? true,
      burnable: options.burnable ?? true,
      paused: false,
      createdAt: now,
      version: 0n,
      metadata: options.metadata,
    };

    await this.store.createToken(token);

    const handle = new FTHandle(this.store, token, this.deployer);

    // Mint initial supply if specified
    if (options.initialSupply && options.initialSupply > 0n) {
      await handle.mint(this.deployer, options.initialSupply);
    }

    return handle;
  }

  /** Deploy an NFT collection */
  async deployNFT(options: DeployNFTOptions): Promise<NFTHandle> {
    if (!isValidSymbol(options.symbol)) {
      throw new Error('Invalid symbol');
    }
    const name = options.name ?? options.symbol;
    if (!isValidName(name)) {
      throw new Error('Invalid name');
    }
    if (options.royaltyBps !== undefined && !isValidRoyaltyBps(options.royaltyBps)) {
      throw new Error('Invalid royalty: must be 0-10000 bps');
    }

    const tokenId = generateTokenId(this.deployer, options.symbol, this.nonce++);
    const now = BigInt(Date.now());

    const collection: NFTCollection = {
      tokenId,
      type: 'NFT',
      standard: TokenStandard.NFT_V1,
      name,
      symbol: options.symbol,
      totalSupply: 0n,
      maxSupply: options.maxSupply ?? 0n,
      creator: this.deployer,
      owner: this.deployer,
      baseUri: options.baseUri,
      mintable: options.mintable ?? true,
      burnable: options.burnable ?? true,
      paused: false,
      royaltyBps: options.royaltyBps ?? 0,
      royaltyReceiver: options.royaltyReceiver ?? this.deployer,
      createdAt: now,
      version: 0n,
      metadata: options.metadata,
    };

    await this.store.createToken(collection);
    return new NFTHandle(this.store, collection, this.deployer);
  }

  /** Deploy an SFT collection */
  async deploySFT(options: DeploySFTOptions): Promise<SFTHandle> {
    if (!isValidSymbol(options.symbol)) {
      throw new Error('Invalid symbol');
    }
    const name = options.name ?? options.symbol;
    if (!isValidName(name)) {
      throw new Error('Invalid name');
    }

    const tokenId = generateTokenId(this.deployer, options.symbol, this.nonce++);
    const now = BigInt(Date.now());

    const collection: SFTCollection = {
      tokenId,
      type: 'SFT',
      standard: TokenStandard.SFT_V1,
      name,
      symbol: options.symbol,
      creator: this.deployer,
      owner: this.deployer,
      baseUri: options.baseUri,
      mintable: options.mintable ?? true,
      burnable: options.burnable ?? true,
      paused: false,
      createdAt: now,
      version: 0n,
      metadata: options.metadata,
    };

    await this.store.createToken(collection);
    return new SFTHandle(this.store, collection, this.deployer);
  }

  /** Get a handle for an existing token */
  async getToken(tokenId: TokenId): Promise<FTHandle | NFTHandle | SFTHandle> {
    const token = await this.store.getToken(tokenId);
    if (!token) {
      throw new TokenNotFoundError(tokenId);
    }

    switch (token.type) {
      case 'FT':
        return new FTHandle(this.store, token as FungibleToken, this.deployer);
      case 'NFT':
        return new NFTHandle(this.store, token as NFTCollection, this.deployer);
      case 'SFT':
        return new SFTHandle(this.store, token as SFTCollection, this.deployer);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createDeployer(store: TokenStore, deployer: string): TokenDeployer {
  return new TokenDeployer(store, deployer);
}
