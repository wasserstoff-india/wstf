/**
 * Token Instruction Handlers
 *
 * SYS.TOK_* instruction handlers for on-chain token operations.
 * These handlers are invoked by the instruction runner when processing
 * token-related system calls.
 */

import {
  TokenId,
  TokenInstanceId,
  TokenClassId,
  TokenType,
  TokenStandard,
  FungibleToken,
  NFTCollection,
  SFTCollection,
  makeTokenId,
  makeTokenInstanceId,
  makeTokenClassId,
  isValidSymbol,
  isValidName,
  isValidDecimals,
  isValidRoyaltyBps,
  isFT,
  isNFT,
  isSFT,
  BaseTokenMetadata,
} from './types';
import {
  TokenStore,
  generateTokenId,
  generateInstanceId,
  generateClassId,
  TokenNotFoundError,
  InsufficientBalanceError,
  TokenPausedError,
  UnauthorizedError,
} from './store';
import { SYS_SELECTORS } from '../instructions/opcodes';

// ============================================================================
// Handler Context
// ============================================================================

/**
 * Context provided to token handlers
 */
export interface TokenHandlerContext {
  /** Caller address (from tx sender) */
  caller: string;
  /** Current block height */
  blockHeight: bigint;
  /** Current timestamp */
  timestamp: bigint;
  /** Transaction ID */
  txId: string;
  /** Nonce for ID generation */
  nonce: bigint;
}

/**
 * Handler result
 */
export interface HandlerResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  gasUsed?: bigint;
}

// ============================================================================
// Instruction Payloads
// ============================================================================

/** Deploy token payload */
export interface DeployTokenPayload {
  type: TokenType;
  symbol: string;
  name?: string;
  decimals?: number; // FT only
  maxSupply?: bigint;
  initialSupply?: bigint; // FT only
  mintable?: boolean;
  burnable?: boolean;
  royaltyBps?: number; // NFT only
  royaltyReceiver?: string; // NFT only
  baseUri?: string; // NFT/SFT
  metadata?: BaseTokenMetadata;
}

/** Mint payload */
export interface MintPayload {
  tokenId: TokenId;
  to: string;
  amount?: bigint; // FT/SFT
  classId?: TokenClassId; // SFT
  tokenUri?: string; // NFT
  metadata?: BaseTokenMetadata; // NFT
}

/** Burn payload */
export interface BurnPayload {
  tokenId: TokenId;
  from?: string; // defaults to caller
  amount?: bigint; // FT/SFT
  instanceId?: TokenInstanceId; // NFT
  classId?: TokenClassId; // SFT
}

/** Transfer payload */
export interface TransferPayload {
  tokenId: TokenId;
  to: string;
  amount?: bigint; // FT/SFT
  instanceId?: TokenInstanceId; // NFT
  classId?: TokenClassId; // SFT
}

/** TransferFrom payload */
export interface TransferFromPayload {
  tokenId: TokenId;
  from: string;
  to: string;
  amount?: bigint;
  instanceId?: TokenInstanceId;
  classId?: TokenClassId;
}

/** Approve payload */
export interface ApprovePayload {
  tokenId: TokenId;
  spender: string;
  amount?: bigint; // FT
  instanceId?: TokenInstanceId; // NFT
  expiresAt?: bigint;
}

/** SetApprovalForAll payload */
export interface SetApprovalForAllPayload {
  tokenId: TokenId;
  operator: string;
  approved: boolean;
}

/** CreateClass payload (SFT) */
export interface CreateClassPayload {
  tokenId: TokenId;
  name: string;
  maxSupply?: bigint;
  fungible?: boolean;
  metadata?: BaseTokenMetadata;
  tokenUri?: string;
}

/** GetToken payload */
export interface GetTokenPayload {
  tokenId: TokenId;
}

/** GetBalance payload */
export interface GetBalancePayload {
  tokenId: TokenId;
  holder: string;
  classId?: TokenClassId; // SFT
}

/** GetAllowance payload */
export interface GetAllowancePayload {
  tokenId: TokenId;
  owner: string;
  spender: string;
}

// ============================================================================
// Token Handler Class
// ============================================================================

/**
 * Token instruction handler
 *
 * Processes SYS.TOK_* instructions and updates token state.
 */
export class TokenHandler {
  constructor(private store: TokenStore) {}

  // --------------------------------------------------------------------------
  // Deploy
  // --------------------------------------------------------------------------

  async handleDeploy(
    ctx: TokenHandlerContext,
    payload: DeployTokenPayload
  ): Promise<HandlerResult<{ tokenId: TokenId }>> {
    // Validate common fields
    if (!isValidSymbol(payload.symbol)) {
      return { success: false, error: 'Invalid symbol: must be 2-10 uppercase alphanumeric' };
    }
    const name = payload.name ?? payload.symbol;
    if (!isValidName(name)) {
      return { success: false, error: 'Invalid name: must be 1-64 chars' };
    }

    const tokenId = generateTokenId(ctx.caller, payload.symbol, ctx.nonce);
    const now = ctx.timestamp;

    switch (payload.type) {
      case 'FT': {
        const decimals = payload.decimals ?? 18;
        if (!isValidDecimals(decimals)) {
          return { success: false, error: 'Invalid decimals: must be 0-18' };
        }

        const token: FungibleToken = {
          tokenId,
          type: 'FT',
          standard: TokenStandard.FT_V1,
          name,
          symbol: payload.symbol,
          decimals,
          totalSupply: 0n,
          maxSupply: payload.maxSupply ?? 0n,
          creator: ctx.caller,
          owner: ctx.caller,
          mintable: payload.mintable ?? true,
          burnable: payload.burnable ?? true,
          paused: false,
          createdAt: now,
          version: 0n,
          metadata: payload.metadata,
        };

        await this.store.createToken(token);

        // Mint initial supply if specified
        if (payload.initialSupply && payload.initialSupply > 0n) {
          if (token.maxSupply > 0n && payload.initialSupply > token.maxSupply) {
            return { success: false, error: 'Initial supply exceeds max supply' };
          }

          await this.store.setFTBalance({
            tokenId,
            holder: ctx.caller,
            balance: payload.initialSupply,
            locked: 0n,
            version: 0n,
          });

          await this.store.updateToken(tokenId, { totalSupply: payload.initialSupply }, 0n);
        }
        break;
      }

      case 'NFT': {
        if (payload.royaltyBps !== undefined && !isValidRoyaltyBps(payload.royaltyBps)) {
          return { success: false, error: 'Invalid royalty: must be 0-10000 bps' };
        }

        const collection: NFTCollection = {
          tokenId,
          type: 'NFT',
          standard: TokenStandard.NFT_V1,
          name,
          symbol: payload.symbol,
          totalSupply: 0n,
          maxSupply: payload.maxSupply ?? 0n,
          creator: ctx.caller,
          owner: ctx.caller,
          baseUri: payload.baseUri,
          mintable: payload.mintable ?? true,
          burnable: payload.burnable ?? true,
          paused: false,
          royaltyBps: payload.royaltyBps ?? 0,
          royaltyReceiver: payload.royaltyReceiver ?? ctx.caller,
          createdAt: now,
          version: 0n,
          metadata: payload.metadata,
        };

        await this.store.createToken(collection);
        break;
      }

      case 'SFT': {
        const collection: SFTCollection = {
          tokenId,
          type: 'SFT',
          standard: TokenStandard.SFT_V1,
          name,
          symbol: payload.symbol,
          creator: ctx.caller,
          owner: ctx.caller,
          baseUri: payload.baseUri,
          mintable: payload.mintable ?? true,
          burnable: payload.burnable ?? true,
          paused: false,
          createdAt: now,
          version: 0n,
          metadata: payload.metadata,
        };

        await this.store.createToken(collection);
        break;
      }

      default:
        return { success: false, error: `Unknown token type: ${payload.type}` };
    }

    return { success: true, data: { tokenId }, gasUsed: 50000n };
  }

  // --------------------------------------------------------------------------
  // Mint
  // --------------------------------------------------------------------------

  async handleMint(
    ctx: TokenHandlerContext,
    payload: MintPayload
  ): Promise<HandlerResult<{ instanceId?: TokenInstanceId }>> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    if (token.paused) {
      return { success: false, error: 'Token is paused' };
    }

    if (!token.mintable) {
      return { success: false, error: 'Token is not mintable' };
    }

    if (ctx.caller !== token.owner) {
      return { success: false, error: 'Only owner can mint' };
    }

    switch (token.type) {
      case 'FT': {
        const ft = token as FungibleToken;
        const amount = payload.amount ?? 0n;
        if (amount <= 0n) {
          return { success: false, error: 'Amount must be positive' };
        }

        if (ft.maxSupply > 0n && ft.totalSupply + amount > ft.maxSupply) {
          return { success: false, error: 'Would exceed max supply' };
        }

        const balance = await this.store.getFTBalance(payload.tokenId, payload.to) ?? {
          tokenId: payload.tokenId,
          holder: payload.to,
          balance: 0n,
          locked: 0n,
          version: 0n,
        };

        balance.balance += amount;
        balance.version += 1n;
        await this.store.setFTBalance(balance);
        await this.store.updateToken(payload.tokenId, { totalSupply: ft.totalSupply + amount }, ft.version);
        break;
      }

      case 'NFT': {
        const nft = token as NFTCollection;
        if (nft.maxSupply > 0n && nft.totalSupply >= nft.maxSupply) {
          return { success: false, error: 'Would exceed max supply' };
        }

        const instanceId = generateInstanceId(payload.tokenId, ctx.nonce);
        await this.store.createNFTInstance({
          tokenId: payload.tokenId,
          instanceId,
          owner: payload.to,
          tokenUri: payload.tokenUri,
          metadata: payload.metadata,
          mintedAt: ctx.timestamp,
          mintedBy: ctx.caller,
          locked: false,
          version: 0n,
        });

        await this.store.updateToken(payload.tokenId, { totalSupply: nft.totalSupply + 1n }, nft.version);
        return { success: true, data: { instanceId }, gasUsed: 30000n };
      }

      case 'SFT': {
        if (!payload.classId) {
          return { success: false, error: 'Class ID required for SFT mint' };
        }

        const cls = await this.store.getSFTClass(payload.tokenId, payload.classId);
        if (!cls) {
          return { success: false, error: 'Class not found' };
        }

        const amount = payload.amount ?? 0n;
        if (amount <= 0n) {
          return { success: false, error: 'Amount must be positive' };
        }

        if (cls.maxSupply > 0n && cls.totalSupply + amount > cls.maxSupply) {
          return { success: false, error: 'Would exceed class max supply' };
        }

        const balance = await this.store.getSFTBalance(payload.tokenId, payload.classId, payload.to) ?? {
          tokenId: payload.tokenId,
          classId: payload.classId,
          holder: payload.to,
          balance: 0n,
          locked: 0n,
          version: 0n,
        };

        balance.balance += amount;
        balance.version += 1n;
        await this.store.setSFTBalance(balance);
        await this.store.updateSFTClass(payload.tokenId, payload.classId, { totalSupply: cls.totalSupply + amount }, cls.version);
        break;
      }
    }

    return { success: true, gasUsed: 30000n };
  }

  // --------------------------------------------------------------------------
  // Burn
  // --------------------------------------------------------------------------

  async handleBurn(
    ctx: TokenHandlerContext,
    payload: BurnPayload
  ): Promise<HandlerResult> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    if (!token.burnable) {
      return { success: false, error: 'Token is not burnable' };
    }

    const from = payload.from ?? ctx.caller;

    switch (token.type) {
      case 'FT': {
        const ft = token as FungibleToken;
        const amount = payload.amount ?? 0n;
        if (amount <= 0n) {
          return { success: false, error: 'Amount must be positive' };
        }

        const balance = await this.store.getFTBalance(payload.tokenId, from);
        if (!balance || balance.balance - balance.locked < amount) {
          return { success: false, error: 'Insufficient balance' };
        }

        // Check authorization
        if (from !== ctx.caller) {
          const allowance = await this.store.getFTAllowance(payload.tokenId, from, ctx.caller);
          if (!allowance || allowance.amount < amount) {
            return { success: false, error: 'Insufficient allowance' };
          }
          allowance.amount -= amount;
          allowance.version += 1n;
          await this.store.setFTAllowance(allowance);
        }

        balance.balance -= amount;
        balance.version += 1n;
        await this.store.setFTBalance(balance);
        await this.store.updateToken(payload.tokenId, { totalSupply: ft.totalSupply - amount }, ft.version);
        break;
      }

      case 'NFT': {
        if (!payload.instanceId) {
          return { success: false, error: 'Instance ID required for NFT burn' };
        }

        const instance = await this.store.getNFTInstance(payload.tokenId, payload.instanceId);
        if (!instance) {
          return { success: false, error: 'NFT instance not found' };
        }

        if (instance.owner !== ctx.caller) {
          // Check approval
          const isApproved = await this.checkNFTAuthorization(payload.tokenId, instance, ctx.caller);
          if (!isApproved) {
            return { success: false, error: 'Not authorized to burn' };
          }
        }

        const nft = token as NFTCollection;
        await this.store.updateNFTInstance(payload.tokenId, payload.instanceId, {
          owner: '0x0000000000000000000000000000000000000000',
        }, instance.version);
        await this.store.updateToken(payload.tokenId, { totalSupply: nft.totalSupply - 1n }, nft.version);
        break;
      }

      case 'SFT': {
        if (!payload.classId) {
          return { success: false, error: 'Class ID required for SFT burn' };
        }

        const amount = payload.amount ?? 0n;
        if (amount <= 0n) {
          return { success: false, error: 'Amount must be positive' };
        }

        const balance = await this.store.getSFTBalance(payload.tokenId, payload.classId, from);
        if (!balance || balance.balance - balance.locked < amount) {
          return { success: false, error: 'Insufficient balance' };
        }

        // Check authorization
        if (from !== ctx.caller) {
          const isOperator = await this.store.getSFTOperatorApproval(payload.tokenId, from, ctx.caller);
          if (!isOperator) {
            return { success: false, error: 'Not authorized' };
          }
        }

        const cls = await this.store.getSFTClass(payload.tokenId, payload.classId);
        if (!cls) {
          return { success: false, error: 'Class not found' };
        }

        balance.balance -= amount;
        balance.version += 1n;
        await this.store.setSFTBalance(balance);
        await this.store.updateSFTClass(payload.tokenId, payload.classId, { totalSupply: cls.totalSupply - amount }, cls.version);
        break;
      }
    }

    return { success: true, gasUsed: 25000n };
  }

  // --------------------------------------------------------------------------
  // Transfer
  // --------------------------------------------------------------------------

  async handleTransfer(
    ctx: TokenHandlerContext,
    payload: TransferPayload
  ): Promise<HandlerResult> {
    return this.handleTransferFrom(ctx, {
      tokenId: payload.tokenId,
      from: ctx.caller,
      to: payload.to,
      amount: payload.amount,
      instanceId: payload.instanceId,
      classId: payload.classId,
    });
  }

  async handleTransferFrom(
    ctx: TokenHandlerContext,
    payload: TransferFromPayload
  ): Promise<HandlerResult> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    if (token.paused) {
      return { success: false, error: 'Token is paused' };
    }

    switch (token.type) {
      case 'FT': {
        const amount = payload.amount ?? 0n;
        if (amount <= 0n) {
          return { success: true, gasUsed: 5000n }; // No-op for zero transfer
        }

        const fromBalance = await this.store.getFTBalance(payload.tokenId, payload.from);
        if (!fromBalance || fromBalance.balance - fromBalance.locked < amount) {
          return { success: false, error: 'Insufficient balance' };
        }

        // Check authorization
        if (payload.from !== ctx.caller) {
          const allowance = await this.store.getFTAllowance(payload.tokenId, payload.from, ctx.caller);
          if (!allowance || allowance.amount < amount) {
            return { success: false, error: 'Insufficient allowance' };
          }
          allowance.amount -= amount;
          allowance.version += 1n;
          await this.store.setFTAllowance(allowance);
        }

        fromBalance.balance -= amount;
        fromBalance.version += 1n;
        await this.store.setFTBalance(fromBalance);

        const toBalance = await this.store.getFTBalance(payload.tokenId, payload.to) ?? {
          tokenId: payload.tokenId,
          holder: payload.to,
          balance: 0n,
          locked: 0n,
          version: 0n,
        };
        toBalance.balance += amount;
        toBalance.version += 1n;
        await this.store.setFTBalance(toBalance);
        break;
      }

      case 'NFT': {
        if (!payload.instanceId) {
          return { success: false, error: 'Instance ID required for NFT transfer' };
        }

        const instance = await this.store.getNFTInstance(payload.tokenId, payload.instanceId);
        if (!instance) {
          return { success: false, error: 'NFT instance not found' };
        }

        if (instance.owner !== payload.from) {
          return { success: false, error: 'Not the owner' };
        }

        if (instance.locked) {
          return { success: false, error: 'NFT is locked' };
        }

        // Check authorization
        if (payload.from !== ctx.caller) {
          const isApproved = await this.checkNFTAuthorization(payload.tokenId, instance, ctx.caller);
          if (!isApproved) {
            return { success: false, error: 'Not authorized to transfer' };
          }
        }

        await this.store.updateNFTInstance(payload.tokenId, payload.instanceId, {
          owner: payload.to,
        }, instance.version);

        // Clear approval
        await this.store.setNFTApproval(null, payload.tokenId, payload.instanceId);
        break;
      }

      case 'SFT': {
        if (!payload.classId) {
          return { success: false, error: 'Class ID required for SFT transfer' };
        }

        const amount = payload.amount ?? 0n;
        if (amount <= 0n) {
          return { success: true, gasUsed: 5000n };
        }

        const fromBalance = await this.store.getSFTBalance(payload.tokenId, payload.classId, payload.from);
        if (!fromBalance || fromBalance.balance - fromBalance.locked < amount) {
          return { success: false, error: 'Insufficient balance' };
        }

        // Check authorization
        if (payload.from !== ctx.caller) {
          const isOperator = await this.store.getSFTOperatorApproval(payload.tokenId, payload.from, ctx.caller);
          if (!isOperator) {
            return { success: false, error: 'Not authorized' };
          }
        }

        fromBalance.balance -= amount;
        fromBalance.version += 1n;
        await this.store.setSFTBalance(fromBalance);

        const toBalance = await this.store.getSFTBalance(payload.tokenId, payload.classId, payload.to) ?? {
          tokenId: payload.tokenId,
          classId: payload.classId,
          holder: payload.to,
          balance: 0n,
          locked: 0n,
          version: 0n,
        };
        toBalance.balance += amount;
        toBalance.version += 1n;
        await this.store.setSFTBalance(toBalance);
        break;
      }
    }

    return { success: true, gasUsed: 20000n };
  }

  // --------------------------------------------------------------------------
  // Approve
  // --------------------------------------------------------------------------

  async handleApprove(
    ctx: TokenHandlerContext,
    payload: ApprovePayload
  ): Promise<HandlerResult> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    switch (token.type) {
      case 'FT': {
        await this.store.setFTAllowance({
          tokenId: payload.tokenId,
          owner: ctx.caller,
          spender: payload.spender,
          amount: payload.amount ?? 0n,
          expiresAt: payload.expiresAt ?? 0n,
          version: 0n,
        });
        break;
      }

      case 'NFT': {
        if (!payload.instanceId) {
          return { success: false, error: 'Instance ID required for NFT approval' };
        }

        const instance = await this.store.getNFTInstance(payload.tokenId, payload.instanceId);
        if (!instance) {
          return { success: false, error: 'NFT instance not found' };
        }

        if (instance.owner !== ctx.caller) {
          return { success: false, error: 'Not the owner' };
        }

        await this.store.setNFTApproval({
          tokenId: payload.tokenId,
          instanceId: payload.instanceId,
          owner: ctx.caller,
          approved: payload.spender,
          expiresAt: payload.expiresAt ?? 0n,
        }, payload.tokenId, payload.instanceId);
        break;
      }

      default:
        return { success: false, error: 'Approve not supported for this token type' };
    }

    return { success: true, gasUsed: 15000n };
  }

  async handleSetApprovalForAll(
    ctx: TokenHandlerContext,
    payload: SetApprovalForAllPayload
  ): Promise<HandlerResult> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    switch (token.type) {
      case 'NFT':
        await this.store.setNFTOperatorApproval({
          tokenId: payload.tokenId,
          owner: ctx.caller,
          operator: payload.operator,
          approved: payload.approved,
        });
        break;

      case 'SFT':
        await this.store.setSFTOperatorApproval({
          tokenId: payload.tokenId,
          owner: ctx.caller,
          operator: payload.operator,
          approved: payload.approved,
        });
        break;

      default:
        return { success: false, error: 'Operator approval not supported for FT' };
    }

    return { success: true, gasUsed: 15000n };
  }

  // --------------------------------------------------------------------------
  // Pause/Unpause
  // --------------------------------------------------------------------------

  async handlePause(
    ctx: TokenHandlerContext,
    payload: GetTokenPayload
  ): Promise<HandlerResult> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    if (ctx.caller !== token.owner) {
      return { success: false, error: 'Only owner can pause' };
    }

    await this.store.updateToken(payload.tokenId, { paused: true }, token.version);
    return { success: true, gasUsed: 10000n };
  }

  async handleUnpause(
    ctx: TokenHandlerContext,
    payload: GetTokenPayload
  ): Promise<HandlerResult> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    if (ctx.caller !== token.owner) {
      return { success: false, error: 'Only owner can unpause' };
    }

    await this.store.updateToken(payload.tokenId, { paused: false }, token.version);
    return { success: true, gasUsed: 10000n };
  }

  // --------------------------------------------------------------------------
  // Create Class (SFT)
  // --------------------------------------------------------------------------

  async handleCreateClass(
    ctx: TokenHandlerContext,
    payload: CreateClassPayload
  ): Promise<HandlerResult<{ classId: TokenClassId }>> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    if (token.type !== 'SFT') {
      return { success: false, error: 'Create class only for SFT' };
    }

    if (ctx.caller !== token.owner) {
      return { success: false, error: 'Only owner can create classes' };
    }

    const classId = generateClassId(payload.tokenId, payload.name, ctx.nonce);

    await this.store.createSFTClass({
      tokenId: payload.tokenId,
      classId,
      name: payload.name,
      totalSupply: 0n,
      maxSupply: payload.maxSupply ?? 0n,
      fungible: payload.fungible ?? true,
      metadata: payload.metadata,
      tokenUri: payload.tokenUri,
      createdAt: ctx.timestamp,
      version: 0n,
    });

    return { success: true, data: { classId }, gasUsed: 25000n };
  }

  // --------------------------------------------------------------------------
  // Read Operations
  // --------------------------------------------------------------------------

  async handleGetToken(
    payload: GetTokenPayload
  ): Promise<HandlerResult<{ token: FungibleToken | NFTCollection | SFTCollection | null }>> {
    const token = await this.store.getToken(payload.tokenId);
    return { success: true, data: { token: token ?? null }, gasUsed: 5000n };
  }

  async handleGetBalance(
    payload: GetBalancePayload
  ): Promise<HandlerResult<{ balance: bigint }>> {
    const token = await this.store.getToken(payload.tokenId);
    if (!token) {
      return { success: true, data: { balance: 0n }, gasUsed: 5000n };
    }

    switch (token.type) {
      case 'FT': {
        const balance = await this.store.getFTBalance(payload.tokenId, payload.holder);
        return { success: true, data: { balance: balance?.balance ?? 0n }, gasUsed: 5000n };
      }

      case 'SFT': {
        if (!payload.classId) {
          return { success: false, error: 'Class ID required for SFT balance' };
        }
        const balance = await this.store.getSFTBalance(payload.tokenId, payload.classId, payload.holder);
        return { success: true, data: { balance: balance?.balance ?? 0n }, gasUsed: 5000n };
      }

      default:
        return { success: false, error: 'Balance query not applicable for NFT' };
    }
  }

  async handleGetAllowance(
    payload: GetAllowancePayload
  ): Promise<HandlerResult<{ allowance: bigint }>> {
    const allowance = await this.store.getFTAllowance(payload.tokenId, payload.owner, payload.spender);
    return { success: true, data: { allowance: allowance?.amount ?? 0n }, gasUsed: 5000n };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async checkNFTAuthorization(
    tokenId: TokenId,
    instance: { instanceId: TokenInstanceId; owner: string },
    operator: string
  ): Promise<boolean> {
    // Check single approval
    const approval = await this.store.getNFTApproval(tokenId, instance.instanceId);
    if (approval && approval.approved === operator) {
      if (approval.expiresAt === 0n || approval.expiresAt > BigInt(Date.now())) {
        return true;
      }
    }

    // Check operator approval
    return this.store.getNFTOperatorApproval(tokenId, instance.owner, operator);
  }
}

// ============================================================================
// Instruction Dispatcher
// ============================================================================

/**
 * Dispatch token instruction by selector
 */
export async function dispatchTokenInstruction(
  handler: TokenHandler,
  ctx: TokenHandlerContext,
  selector: number,
  payload: unknown
): Promise<HandlerResult> {
  switch (selector) {
    case SYS_SELECTORS.TOK_DEPLOY:
      return handler.handleDeploy(ctx, payload as DeployTokenPayload);

    case SYS_SELECTORS.TOK_MINT:
      return handler.handleMint(ctx, payload as MintPayload);

    case SYS_SELECTORS.TOK_BURN:
      return handler.handleBurn(ctx, payload as BurnPayload);

    case SYS_SELECTORS.TOK_TRANSFER:
      return handler.handleTransfer(ctx, payload as TransferPayload);

    case SYS_SELECTORS.TOK_TRANSFER_FROM:
      return handler.handleTransferFrom(ctx, payload as TransferFromPayload);

    case SYS_SELECTORS.TOK_APPROVE:
      return handler.handleApprove(ctx, payload as ApprovePayload);

    case SYS_SELECTORS.TOK_PAUSE:
      return handler.handlePause(ctx, payload as GetTokenPayload);

    case SYS_SELECTORS.TOK_UNPAUSE:
      return handler.handleUnpause(ctx, payload as GetTokenPayload);

    case SYS_SELECTORS.TOK_GET:
      return handler.handleGetToken(payload as GetTokenPayload);

    case SYS_SELECTORS.TOK_BALANCE:
      return handler.handleGetBalance(payload as GetBalancePayload);

    case SYS_SELECTORS.TOK_ALLOWANCE:
      return handler.handleGetAllowance(payload as GetAllowancePayload);

    case SYS_SELECTORS.NFT_CREATE_CLASS:
      return handler.handleCreateClass(ctx, payload as CreateClassPayload);

    case SYS_SELECTORS.NFT_SET_APPROVAL_ALL:
      return handler.handleSetApprovalForAll(ctx, payload as SetApprovalForAllPayload);

    default:
      return { success: false, error: `Unknown token selector: 0x${selector.toString(16)}` };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createTokenHandler(store: TokenStore): TokenHandler {
  return new TokenHandler(store);
}

/**
 * Check if selector is a token instruction
 */
export function isTokenSelector(selector: number): boolean {
  return (
    (selector >= SYS_SELECTORS.TOK_DEPLOY && selector <= SYS_SELECTORS.TOK_ALLOWANCE) ||
    (selector >= SYS_SELECTORS.NFT_CREATE_CLASS && selector <= SYS_SELECTORS.NFT_SET_APPROVAL_ALL)
  );
}

/**
 * Get gas estimate for token operation
 */
export function estimateTokenGas(selector: number): bigint {
  switch (selector) {
    case SYS_SELECTORS.TOK_DEPLOY:
      return 50000n;
    case SYS_SELECTORS.TOK_MINT:
    case SYS_SELECTORS.TOK_BURN:
      return 30000n;
    case SYS_SELECTORS.TOK_TRANSFER:
    case SYS_SELECTORS.TOK_TRANSFER_FROM:
      return 20000n;
    case SYS_SELECTORS.TOK_APPROVE:
    case SYS_SELECTORS.NFT_SET_APPROVAL_ALL:
      return 15000n;
    case SYS_SELECTORS.TOK_PAUSE:
    case SYS_SELECTORS.TOK_UNPAUSE:
      return 10000n;
    case SYS_SELECTORS.TOK_GET:
    case SYS_SELECTORS.TOK_BALANCE:
    case SYS_SELECTORS.TOK_ALLOWANCE:
      return 5000n;
    case SYS_SELECTORS.NFT_CREATE_CLASS:
      return 25000n;
    default:
      return 10000n;
  }
}
