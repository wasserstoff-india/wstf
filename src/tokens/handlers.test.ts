/**
 * Token Handler Tests
 *
 * Tests for SYS.TOK_* instruction handlers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenHandler,
  TokenHandlerContext,
  createTokenHandler,
  dispatchTokenInstruction,
  isTokenSelector,
  estimateTokenGas,
  DeployTokenPayload,
  MintPayload,
  TransferPayload,
  ApprovePayload,
} from './handlers';
import { InMemoryTokenStore, generateTokenId } from './store';
import { makeTokenId, makeTokenClassId } from './types';
import { SYS_SELECTORS } from '../instructions/opcodes';

// ============================================================================
// Test Constants
// ============================================================================

const OWNER = '0x1234567890abcdef1234567890abcdef12345678';
const USER1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USER2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OPERATOR = '0xcccccccccccccccccccccccccccccccccccccccc';

function createContext(caller: string = OWNER, nonce: bigint = 0n): TokenHandlerContext {
  return {
    caller,
    blockHeight: 100n,
    timestamp: BigInt(Date.now()),
    txId: 'tx_test123',
    nonce,
  };
}

// ============================================================================
// Handler Tests
// ============================================================================

describe('TokenHandler', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = new TokenHandler(store);
  });

  describe('Deploy', () => {
    it('should deploy FT token', async () => {
      const ctx = createContext();
      const result = await handler.handleDeploy(ctx, {
        type: 'FT',
        symbol: 'TEST',
        name: 'Test Token',
        decimals: 18,
      });

      expect(result.success).toBe(true);
      expect(result.data?.tokenId).toBeDefined();
      expect(result.gasUsed).toBe(50000n);

      const token = await store.getToken(result.data!.tokenId);
      expect(token?.symbol).toBe('TEST');
      expect(token?.type).toBe('FT');
    });

    it('should deploy FT with initial supply', async () => {
      const ctx = createContext();
      const result = await handler.handleDeploy(ctx, {
        type: 'FT',
        symbol: 'TEST',
        initialSupply: 1000000n,
      });

      expect(result.success).toBe(true);

      const token = await store.getToken(result.data!.tokenId);
      expect((token as any)?.totalSupply).toBe(1000000n);

      const balance = await store.getFTBalance(result.data!.tokenId, OWNER);
      expect(balance?.balance).toBe(1000000n);
    });

    it('should deploy NFT collection', async () => {
      const ctx = createContext();
      const result = await handler.handleDeploy(ctx, {
        type: 'NFT',
        symbol: 'PUNK',
        name: 'CryptoPunks',
        royaltyBps: 250,
      });

      expect(result.success).toBe(true);

      const token = await store.getToken(result.data!.tokenId);
      expect(token?.type).toBe('NFT');
      expect((token as any).royaltyBps).toBe(250);
    });

    it('should deploy SFT collection', async () => {
      const ctx = createContext();
      const result = await handler.handleDeploy(ctx, {
        type: 'SFT',
        symbol: 'ITEM',
        name: 'Game Items',
      });

      expect(result.success).toBe(true);

      const token = await store.getToken(result.data!.tokenId);
      expect(token?.type).toBe('SFT');
    });

    it('should reject invalid symbol', async () => {
      const ctx = createContext();
      const result = await handler.handleDeploy(ctx, {
        type: 'FT',
        symbol: 'x', // too short
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid symbol');
    });

    it('should reject invalid decimals', async () => {
      const ctx = createContext();
      const result = await handler.handleDeploy(ctx, {
        type: 'FT',
        symbol: 'TEST',
        decimals: 20, // too high
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid decimals');
    });

    it('should reject initial supply exceeding max supply', async () => {
      const ctx = createContext();
      const result = await handler.handleDeploy(ctx, {
        type: 'FT',
        symbol: 'TEST',
        maxSupply: 100n,
        initialSupply: 200n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds max supply');
    });
  });

  describe('Mint', () => {
    let ftTokenId: string;
    let nftTokenId: string;
    let sftTokenId: string;

    beforeEach(async () => {
      // Deploy FT
      let result = await handler.handleDeploy(createContext(OWNER, 0n), {
        type: 'FT',
        symbol: 'FT',
      });
      ftTokenId = result.data!.tokenId;

      // Deploy NFT
      result = await handler.handleDeploy(createContext(OWNER, 1n), {
        type: 'NFT',
        symbol: 'NFT',
      });
      nftTokenId = result.data!.tokenId;

      // Deploy SFT
      result = await handler.handleDeploy(createContext(OWNER, 2n), {
        type: 'SFT',
        symbol: 'SFT',
      });
      sftTokenId = result.data!.tokenId;
    });

    it('should mint FT tokens', async () => {
      const result = await handler.handleMint(createContext(), {
        tokenId: makeTokenId(ftTokenId),
        to: USER1,
        amount: 1000n,
      });

      expect(result.success).toBe(true);

      const balance = await store.getFTBalance(makeTokenId(ftTokenId), USER1);
      expect(balance?.balance).toBe(1000n);
    });

    it('should mint NFT', async () => {
      const result = await handler.handleMint(createContext(), {
        tokenId: makeTokenId(nftTokenId),
        to: USER1,
        metadata: { name: 'NFT #1', symbol: 'NFT1' },
      });

      expect(result.success).toBe(true);
      expect(result.data?.instanceId).toBeDefined();

      const instance = await store.getNFTInstance(makeTokenId(nftTokenId), result.data!.instanceId!);
      expect(instance?.owner).toBe(USER1);
    });

    it('should mint SFT tokens after creating class', async () => {
      // Create class first
      const classResult = await handler.handleCreateClass(createContext(), {
        tokenId: makeTokenId(sftTokenId),
        name: 'Common',
        maxSupply: 1000n,
      });
      expect(classResult.success).toBe(true);

      const result = await handler.handleMint(createContext(), {
        tokenId: makeTokenId(sftTokenId),
        to: USER1,
        classId: classResult.data!.classId,
        amount: 100n,
      });

      expect(result.success).toBe(true);

      const balance = await store.getSFTBalance(
        makeTokenId(sftTokenId),
        classResult.data!.classId,
        USER1
      );
      expect(balance?.balance).toBe(100n);
    });

    it('should reject mint from non-owner', async () => {
      const result = await handler.handleMint(createContext(USER1), {
        tokenId: makeTokenId(ftTokenId),
        to: USER1,
        amount: 1000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only owner');
    });

    it('should reject mint when paused', async () => {
      await handler.handlePause(createContext(), { tokenId: makeTokenId(ftTokenId) });

      const result = await handler.handleMint(createContext(), {
        tokenId: makeTokenId(ftTokenId),
        to: USER1,
        amount: 1000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('paused');
    });
  });

  describe('Transfer', () => {
    let tokenId: string;

    beforeEach(async () => {
      const result = await handler.handleDeploy(createContext(), {
        type: 'FT',
        symbol: 'TEST',
        initialSupply: 10000n,
      });
      tokenId = result.data!.tokenId;
    });

    it('should transfer tokens', async () => {
      const result = await handler.handleTransfer(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: USER1,
        amount: 500n,
      });

      expect(result.success).toBe(true);

      const ownerBalance = await store.getFTBalance(makeTokenId(tokenId), OWNER);
      const user1Balance = await store.getFTBalance(makeTokenId(tokenId), USER1);

      expect(ownerBalance?.balance).toBe(9500n);
      expect(user1Balance?.balance).toBe(500n);
    });

    it('should reject transfer with insufficient balance', async () => {
      const result = await handler.handleTransfer(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: USER1,
        amount: 99999n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should allow zero amount transfer (no-op)', async () => {
      const result = await handler.handleTransfer(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: USER1,
        amount: 0n,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('TransferFrom', () => {
    let tokenId: string;

    beforeEach(async () => {
      // Deploy and mint to USER1
      const deployResult = await handler.handleDeploy(createContext(), {
        type: 'FT',
        symbol: 'TEST',
      });
      tokenId = deployResult.data!.tokenId;

      await handler.handleMint(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: USER1,
        amount: 10000n,
      });
    });

    it('should transfer with allowance', async () => {
      // USER1 approves OWNER
      await handler.handleApprove(createContext(USER1), {
        tokenId: makeTokenId(tokenId),
        spender: OWNER,
        amount: 500n,
      });

      // OWNER transfers from USER1 to USER2
      const result = await handler.handleTransferFrom(createContext(OWNER), {
        tokenId: makeTokenId(tokenId),
        from: USER1,
        to: USER2,
        amount: 500n,
      });

      expect(result.success).toBe(true);

      const user1Balance = await store.getFTBalance(makeTokenId(tokenId), USER1);
      const user2Balance = await store.getFTBalance(makeTokenId(tokenId), USER2);

      expect(user1Balance?.balance).toBe(9500n);
      expect(user2Balance?.balance).toBe(500n);
    });

    it('should reduce allowance after transfer', async () => {
      await handler.handleApprove(createContext(USER1), {
        tokenId: makeTokenId(tokenId),
        spender: OWNER,
        amount: 1000n,
      });

      await handler.handleTransferFrom(createContext(OWNER), {
        tokenId: makeTokenId(tokenId),
        from: USER1,
        to: USER2,
        amount: 300n,
      });

      const allowance = await store.getFTAllowance(makeTokenId(tokenId), USER1, OWNER);
      expect(allowance?.amount).toBe(700n);
    });

    it('should reject transfer without allowance', async () => {
      const result = await handler.handleTransferFrom(createContext(OWNER), {
        tokenId: makeTokenId(tokenId),
        from: USER1,
        to: USER2,
        amount: 100n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient allowance');
    });
  });

  describe('Burn', () => {
    let tokenId: string;

    beforeEach(async () => {
      const result = await handler.handleDeploy(createContext(), {
        type: 'FT',
        symbol: 'TEST',
        initialSupply: 10000n,
      });
      tokenId = result.data!.tokenId;
    });

    it('should burn tokens', async () => {
      const result = await handler.handleBurn(createContext(), {
        tokenId: makeTokenId(tokenId),
        amount: 1000n,
      });

      expect(result.success).toBe(true);

      const balance = await store.getFTBalance(makeTokenId(tokenId), OWNER);
      expect(balance?.balance).toBe(9000n);

      const token = await store.getToken(makeTokenId(tokenId));
      expect((token as any)?.totalSupply).toBe(9000n);
    });

    it('should reject burn when not burnable', async () => {
      const deployResult = await handler.handleDeploy(createContext(OWNER, 1n), {
        type: 'FT',
        symbol: 'FIXED',
        initialSupply: 1000n,
        burnable: false,
      });

      const result = await handler.handleBurn(createContext(), {
        tokenId: deployResult.data!.tokenId,
        amount: 100n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not burnable');
    });
  });

  describe('Pause/Unpause', () => {
    let tokenId: string;

    beforeEach(async () => {
      const result = await handler.handleDeploy(createContext(), {
        type: 'FT',
        symbol: 'TEST',
        initialSupply: 1000n,
      });
      tokenId = result.data!.tokenId;
    });

    it('should pause token', async () => {
      const result = await handler.handlePause(createContext(), {
        tokenId: makeTokenId(tokenId),
      });

      expect(result.success).toBe(true);

      const token = await store.getToken(makeTokenId(tokenId));
      expect(token?.paused).toBe(true);
    });

    it('should unpause token', async () => {
      await handler.handlePause(createContext(), { tokenId: makeTokenId(tokenId) });

      const result = await handler.handleUnpause(createContext(), {
        tokenId: makeTokenId(tokenId),
      });

      expect(result.success).toBe(true);

      const token = await store.getToken(makeTokenId(tokenId));
      expect(token?.paused).toBe(false);
    });

    it('should reject pause from non-owner', async () => {
      const result = await handler.handlePause(createContext(USER1), {
        tokenId: makeTokenId(tokenId),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only owner');
    });

    it('should block transfers when paused', async () => {
      await handler.handlePause(createContext(), { tokenId: makeTokenId(tokenId) });

      const result = await handler.handleTransfer(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: USER1,
        amount: 100n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('paused');
    });
  });

  describe('NFT Operations', () => {
    let tokenId: string;

    beforeEach(async () => {
      const result = await handler.handleDeploy(createContext(), {
        type: 'NFT',
        symbol: 'NFT',
      });
      tokenId = result.data!.tokenId;
    });

    it('should mint and transfer NFT', async () => {
      // Mint NFT to owner
      const mintResult = await handler.handleMint(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: OWNER,
      });

      const instanceId = mintResult.data!.instanceId!;

      // Transfer to USER1
      const transferResult = await handler.handleTransfer(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: USER1,
        instanceId,
      });

      expect(transferResult.success).toBe(true);

      const instance = await store.getNFTInstance(makeTokenId(tokenId), instanceId);
      expect(instance?.owner).toBe(USER1);
    });

    it('should approve and transfer NFT', async () => {
      const mintResult = await handler.handleMint(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: OWNER,
      });
      const instanceId = mintResult.data!.instanceId!;

      // Approve USER1
      await handler.handleApprove(createContext(), {
        tokenId: makeTokenId(tokenId),
        spender: USER1,
        instanceId,
      });

      // USER1 transfers
      const result = await handler.handleTransferFrom(createContext(USER1), {
        tokenId: makeTokenId(tokenId),
        from: OWNER,
        to: USER2,
        instanceId,
      });

      expect(result.success).toBe(true);

      const instance = await store.getNFTInstance(makeTokenId(tokenId), instanceId);
      expect(instance?.owner).toBe(USER2);
    });

    it('should set operator approval for all', async () => {
      // Mint two NFTs with different nonces
      const mint1 = await handler.handleMint(createContext(OWNER, 0n), {
        tokenId: makeTokenId(tokenId),
        to: OWNER,
      });
      const mint2 = await handler.handleMint(createContext(OWNER, 1n), {
        tokenId: makeTokenId(tokenId),
        to: OWNER,
      });

      // Set operator approval
      await handler.handleSetApprovalForAll(createContext(), {
        tokenId: makeTokenId(tokenId),
        operator: OPERATOR,
        approved: true,
      });

      // Operator transfers both
      await handler.handleTransferFrom(createContext(OPERATOR), {
        tokenId: makeTokenId(tokenId),
        from: OWNER,
        to: USER1,
        instanceId: mint1.data!.instanceId,
      });

      await handler.handleTransferFrom(createContext(OPERATOR), {
        tokenId: makeTokenId(tokenId),
        from: OWNER,
        to: USER1,
        instanceId: mint2.data!.instanceId,
      });

      const instance1 = await store.getNFTInstance(makeTokenId(tokenId), mint1.data!.instanceId!);
      const instance2 = await store.getNFTInstance(makeTokenId(tokenId), mint2.data!.instanceId!);

      expect(instance1?.owner).toBe(USER1);
      expect(instance2?.owner).toBe(USER1);
    });

    it('should burn NFT', async () => {
      const mintResult = await handler.handleMint(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: OWNER,
      });

      const result = await handler.handleBurn(createContext(), {
        tokenId: makeTokenId(tokenId),
        instanceId: mintResult.data!.instanceId,
      });

      expect(result.success).toBe(true);

      const token = await store.getToken(makeTokenId(tokenId));
      expect((token as any)?.totalSupply).toBe(0n);
    });
  });

  describe('SFT Operations', () => {
    let tokenId: string;

    beforeEach(async () => {
      const result = await handler.handleDeploy(createContext(), {
        type: 'SFT',
        symbol: 'SFT',
      });
      tokenId = result.data!.tokenId;
    });

    it('should create class and mint', async () => {
      const classResult = await handler.handleCreateClass(createContext(), {
        tokenId: makeTokenId(tokenId),
        name: 'Sword',
        maxSupply: 100n,
      });

      expect(classResult.success).toBe(true);

      const mintResult = await handler.handleMint(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: USER1,
        classId: classResult.data!.classId,
        amount: 10n,
      });

      expect(mintResult.success).toBe(true);

      const balance = await store.getSFTBalance(
        makeTokenId(tokenId),
        classResult.data!.classId,
        USER1
      );
      expect(balance?.balance).toBe(10n);
    });

    it('should transfer SFT tokens', async () => {
      const classResult = await handler.handleCreateClass(createContext(), {
        tokenId: makeTokenId(tokenId),
        name: 'Gold',
      });

      await handler.handleMint(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: OWNER,
        classId: classResult.data!.classId,
        amount: 1000n,
      });

      const result = await handler.handleTransfer(createContext(), {
        tokenId: makeTokenId(tokenId),
        to: USER1,
        classId: classResult.data!.classId,
        amount: 100n,
      });

      expect(result.success).toBe(true);

      const ownerBalance = await store.getSFTBalance(
        makeTokenId(tokenId),
        classResult.data!.classId,
        OWNER
      );
      expect(ownerBalance?.balance).toBe(900n);
    });
  });

  describe('Read Operations', () => {
    let tokenId: string;

    beforeEach(async () => {
      const result = await handler.handleDeploy(createContext(), {
        type: 'FT',
        symbol: 'TEST',
        initialSupply: 1000n,
      });
      tokenId = result.data!.tokenId;
    });

    it('should get token info', async () => {
      const result = await handler.handleGetToken({ tokenId: makeTokenId(tokenId) });

      expect(result.success).toBe(true);
      expect(result.data?.token?.symbol).toBe('TEST');
    });

    it('should get balance', async () => {
      const result = await handler.handleGetBalance({
        tokenId: makeTokenId(tokenId),
        holder: OWNER,
      });

      expect(result.success).toBe(true);
      expect(result.data?.balance).toBe(1000n);
    });

    it('should return 0 for non-existent balance', async () => {
      const result = await handler.handleGetBalance({
        tokenId: makeTokenId(tokenId),
        holder: USER1,
      });

      expect(result.success).toBe(true);
      expect(result.data?.balance).toBe(0n);
    });

    it('should get allowance', async () => {
      await handler.handleApprove(createContext(), {
        tokenId: makeTokenId(tokenId),
        spender: USER1,
        amount: 500n,
      });

      const result = await handler.handleGetAllowance({
        tokenId: makeTokenId(tokenId),
        owner: OWNER,
        spender: USER1,
      });

      expect(result.success).toBe(true);
      expect(result.data?.allowance).toBe(500n);
    });
  });
});

// ============================================================================
// Dispatcher Tests
// ============================================================================

describe('dispatchTokenInstruction', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = new TokenHandler(store);
  });

  it('should dispatch TOK_DEPLOY', async () => {
    const result = await dispatchTokenInstruction(
      handler,
      createContext(),
      SYS_SELECTORS.TOK_DEPLOY,
      { type: 'FT', symbol: 'TEST' }
    );

    expect(result.success).toBe(true);
  });

  it('should dispatch TOK_MINT', async () => {
    const deployResult = await dispatchTokenInstruction(
      handler,
      createContext(),
      SYS_SELECTORS.TOK_DEPLOY,
      { type: 'FT', symbol: 'TEST' }
    );

    const result = await dispatchTokenInstruction(
      handler,
      createContext(),
      SYS_SELECTORS.TOK_MINT,
      { tokenId: (deployResult.data as any).tokenId, to: USER1, amount: 1000n }
    );

    expect(result.success).toBe(true);
  });

  it('should reject unknown selector', async () => {
    const result = await dispatchTokenInstruction(
      handler,
      createContext(),
      0x99999999,
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown token selector');
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('Helper Functions', () => {
  describe('isTokenSelector', () => {
    it('should return true for token selectors', () => {
      expect(isTokenSelector(SYS_SELECTORS.TOK_DEPLOY)).toBe(true);
      expect(isTokenSelector(SYS_SELECTORS.TOK_MINT)).toBe(true);
      expect(isTokenSelector(SYS_SELECTORS.TOK_TRANSFER)).toBe(true);
      expect(isTokenSelector(SYS_SELECTORS.NFT_CREATE_CLASS)).toBe(true);
    });

    it('should return false for non-token selectors', () => {
      expect(isTokenSelector(SYS_SELECTORS.ORG_CREATE)).toBe(false);
      expect(isTokenSelector(SYS_SELECTORS.EVENT)).toBe(false);
      expect(isTokenSelector(0x99999999)).toBe(false);
    });
  });

  describe('estimateTokenGas', () => {
    it('should return correct gas estimates', () => {
      expect(estimateTokenGas(SYS_SELECTORS.TOK_DEPLOY)).toBe(50000n);
      expect(estimateTokenGas(SYS_SELECTORS.TOK_MINT)).toBe(30000n);
      expect(estimateTokenGas(SYS_SELECTORS.TOK_TRANSFER)).toBe(20000n);
      expect(estimateTokenGas(SYS_SELECTORS.TOK_APPROVE)).toBe(15000n);
      expect(estimateTokenGas(SYS_SELECTORS.TOK_GET)).toBe(5000n);
    });
  });

  describe('createTokenHandler', () => {
    it('should create TokenHandler instance', () => {
      const store = new InMemoryTokenStore();
      const handler = createTokenHandler(store);
      expect(handler).toBeInstanceOf(TokenHandler);
    });
  });
});
