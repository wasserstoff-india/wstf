/**
 * Token Module Tests
 *
 * Comprehensive tests for FT, NFT, and SFT token operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenId,
  TokenInstanceId,
  TokenClassId,
  TokenStandard,
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
} from './types';
import {
  InMemoryTokenStore,
  createTokenStore,
  generateTokenId,
  generateInstanceId,
  generateClassId,
  TokenNotFoundError,
  TokenExistsError,
  TokenConcurrencyError,
  InsufficientBalanceError,
  TokenPausedError,
  UnauthorizedError,
} from './store';
import {
  TokenDeployer,
  createDeployer,
  FTHandle,
  NFTHandle,
  SFTHandle,
} from './deployer';

// ============================================================================
// Test Constants
// ============================================================================

const DEPLOYER = '0x1234567890abcdef1234567890abcdef12345678';
const USER1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USER2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OPERATOR = '0xcccccccccccccccccccccccccccccccccccccccc';

// ============================================================================
// Type Tests
// ============================================================================

describe('Token Types', () => {
  describe('Branded Types', () => {
    it('should create TokenId', () => {
      const id = makeTokenId('tok_abc123');
      expect(id).toBe('tok_abc123');
    });

    it('should create TokenInstanceId', () => {
      const id = makeTokenInstanceId('inst_abc123');
      expect(id).toBe('inst_abc123');
    });

    it('should create TokenClassId', () => {
      const id = makeTokenClassId('cls_abc123');
      expect(id).toBe('cls_abc123');
    });
  });

  describe('Validation', () => {
    it('should validate symbols', () => {
      expect(isValidSymbol('USDC')).toBe(true);
      expect(isValidSymbol('ETH')).toBe(true);
      expect(isValidSymbol('A1B2C3D4E5')).toBe(true);
      expect(isValidSymbol('X')).toBe(false); // too short
      expect(isValidSymbol('ABCDEFGHIJK')).toBe(false); // too long
      expect(isValidSymbol('usdc')).toBe(false); // lowercase
      expect(isValidSymbol('US-DC')).toBe(false); // special char
    });

    it('should validate names', () => {
      expect(isValidName('USD Coin')).toBe(true);
      expect(isValidName('A')).toBe(true);
      expect(isValidName('')).toBe(false);
      expect(isValidName('a'.repeat(65))).toBe(false);
    });

    it('should validate decimals', () => {
      expect(isValidDecimals(18)).toBe(true);
      expect(isValidDecimals(0)).toBe(true);
      expect(isValidDecimals(6)).toBe(true);
      expect(isValidDecimals(-1)).toBe(false);
      expect(isValidDecimals(19)).toBe(false);
      expect(isValidDecimals(1.5)).toBe(false);
    });

    it('should validate royalty bps', () => {
      expect(isValidRoyaltyBps(0)).toBe(true);
      expect(isValidRoyaltyBps(250)).toBe(true); // 2.5%
      expect(isValidRoyaltyBps(10000)).toBe(true); // 100%
      expect(isValidRoyaltyBps(-1)).toBe(false);
      expect(isValidRoyaltyBps(10001)).toBe(false);
    });
  });

  describe('ID Generators', () => {
    it('should generate unique token IDs', () => {
      const id1 = generateTokenId(DEPLOYER, 'TEST', 0n);
      const id2 = generateTokenId(DEPLOYER, 'TEST', 1n);
      const id3 = generateTokenId(USER1, 'TEST', 0n);

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1.startsWith('tok_')).toBe(true);
    });

    it('should generate unique instance IDs', () => {
      const tokenId = makeTokenId('tok_test');
      const id1 = generateInstanceId(tokenId, 0n);
      const id2 = generateInstanceId(tokenId, 1n);

      expect(id1).not.toBe(id2);
      expect(id1.startsWith('inst_')).toBe(true);
    });

    it('should generate unique class IDs', () => {
      const tokenId = makeTokenId('tok_test');
      const id1 = generateClassId(tokenId, 'Common', 0n);
      const id2 = generateClassId(tokenId, 'Rare', 0n);

      expect(id1).not.toBe(id2);
      expect(id1.startsWith('cls_')).toBe(true);
    });
  });
});

// ============================================================================
// Store Tests
// ============================================================================

describe('Token Store', () => {
  let store: InMemoryTokenStore;

  beforeEach(() => {
    store = new InMemoryTokenStore();
  });

  describe('Token CRUD', () => {
    it('should create and get FT token', async () => {
      const tokenId = generateTokenId(DEPLOYER, 'TEST', 0n);
      const token = {
        tokenId,
        type: 'FT' as const,
        standard: TokenStandard.FT_V1,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: 0n,
        maxSupply: 0n,
        creator: DEPLOYER,
        owner: DEPLOYER,
        mintable: true,
        burnable: true,
        paused: false,
        createdAt: BigInt(Date.now()),
        version: 0n,
      };

      await store.createToken(token);
      const retrieved = await store.getToken(tokenId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.symbol).toBe('TEST');
      expect(isFT(retrieved!)).toBe(true);
    });

    it('should reject duplicate token creation', async () => {
      const tokenId = generateTokenId(DEPLOYER, 'TEST', 0n);
      const token = {
        tokenId,
        type: 'FT' as const,
        standard: TokenStandard.FT_V1,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: 0n,
        maxSupply: 0n,
        creator: DEPLOYER,
        owner: DEPLOYER,
        mintable: true,
        burnable: true,
        paused: false,
        createdAt: BigInt(Date.now()),
        version: 0n,
      };

      await store.createToken(token);
      await expect(store.createToken(token)).rejects.toThrow(TokenExistsError);
    });

    it('should update token with version check', async () => {
      const tokenId = generateTokenId(DEPLOYER, 'TEST', 0n);
      const token = {
        tokenId,
        type: 'FT' as const,
        standard: TokenStandard.FT_V1,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: 0n,
        maxSupply: 0n,
        creator: DEPLOYER,
        owner: DEPLOYER,
        mintable: true,
        burnable: true,
        paused: false,
        createdAt: BigInt(Date.now()),
        version: 0n,
      };

      await store.createToken(token);
      await store.updateToken(tokenId, { totalSupply: 1000n }, 0n);

      const updated = await store.getToken(tokenId);
      expect((updated as any)?.totalSupply).toBe(1000n);
      expect(updated?.version).toBe(1n);
    });

    it('should reject update with wrong version', async () => {
      const tokenId = generateTokenId(DEPLOYER, 'TEST', 0n);
      const token = {
        tokenId,
        type: 'FT' as const,
        standard: TokenStandard.FT_V1,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: 0n,
        maxSupply: 0n,
        creator: DEPLOYER,
        owner: DEPLOYER,
        mintable: true,
        burnable: true,
        paused: false,
        createdAt: BigInt(Date.now()),
        version: 0n,
      };

      await store.createToken(token);
      await expect(store.updateToken(tokenId, { totalSupply: 1000n }, 99n)).rejects.toThrow(TokenConcurrencyError);
    });

    it('should list tokens by type', async () => {
      const ftId = generateTokenId(DEPLOYER, 'FT', 0n);
      const nftId = generateTokenId(DEPLOYER, 'NFT', 1n);

      await store.createToken({
        tokenId: ftId,
        type: 'FT' as const,
        standard: TokenStandard.FT_V1,
        name: 'FT Token',
        symbol: 'FT',
        decimals: 18,
        totalSupply: 0n,
        maxSupply: 0n,
        creator: DEPLOYER,
        owner: DEPLOYER,
        mintable: true,
        burnable: true,
        paused: false,
        createdAt: BigInt(Date.now()),
        version: 0n,
      });

      await store.createToken({
        tokenId: nftId,
        type: 'NFT' as const,
        standard: TokenStandard.NFT_V1,
        name: 'NFT Collection',
        symbol: 'NFT',
        totalSupply: 0n,
        maxSupply: 0n,
        creator: DEPLOYER,
        owner: DEPLOYER,
        mintable: true,
        burnable: true,
        paused: false,
        royaltyBps: 0,
        createdAt: BigInt(Date.now()),
        version: 0n,
      });

      const fts = await store.listTokens('FT');
      const nfts = await store.listTokens('NFT');

      expect(fts.length).toBe(1);
      expect(nfts.length).toBe(1);
      expect(fts[0].symbol).toBe('FT');
    });
  });

  describe('FT Balances', () => {
    it('should set and get balance', async () => {
      const tokenId = makeTokenId('tok_test');

      await store.setFTBalance({
        tokenId,
        holder: USER1,
        balance: 1000n,
        locked: 0n,
        version: 0n,
      });

      const balance = await store.getFTBalance(tokenId, USER1);
      expect(balance?.balance).toBe(1000n);
    });

    it('should return undefined for missing balance', async () => {
      const tokenId = makeTokenId('tok_test');
      const balance = await store.getFTBalance(tokenId, USER1);
      expect(balance).toBeUndefined();
    });
  });

  describe('FT Allowances', () => {
    it('should set and get allowance', async () => {
      const tokenId = makeTokenId('tok_test');

      await store.setFTAllowance({
        tokenId,
        owner: USER1,
        spender: USER2,
        amount: 500n,
        expiresAt: 0n,
        version: 0n,
      });

      const allowance = await store.getFTAllowance(tokenId, USER1, USER2);
      expect(allowance?.amount).toBe(500n);
    });
  });

  describe('NFT Instances', () => {
    it('should create and get NFT instance', async () => {
      const tokenId = makeTokenId('tok_nft');
      const instanceId = makeTokenInstanceId('inst_1');

      await store.createNFTInstance({
        tokenId,
        instanceId,
        owner: USER1,
        mintedAt: BigInt(Date.now()),
        mintedBy: DEPLOYER,
        locked: false,
        version: 0n,
      });

      const instance = await store.getNFTInstance(tokenId, instanceId);
      expect(instance?.owner).toBe(USER1);
    });

    it('should list NFT instances by owner', async () => {
      const tokenId = makeTokenId('tok_nft');

      await store.createNFTInstance({
        tokenId,
        instanceId: makeTokenInstanceId('inst_1'),
        owner: USER1,
        mintedAt: BigInt(Date.now()),
        mintedBy: DEPLOYER,
        locked: false,
        version: 0n,
      });

      await store.createNFTInstance({
        tokenId,
        instanceId: makeTokenInstanceId('inst_2'),
        owner: USER2,
        mintedAt: BigInt(Date.now()),
        mintedBy: DEPLOYER,
        locked: false,
        version: 0n,
      });

      const user1Tokens = await store.listNFTInstances(tokenId, USER1);
      const allTokens = await store.listNFTInstances(tokenId);

      expect(user1Tokens.length).toBe(1);
      expect(allTokens.length).toBe(2);
    });

    it('should update NFT instance', async () => {
      const tokenId = makeTokenId('tok_nft');
      const instanceId = makeTokenInstanceId('inst_1');

      await store.createNFTInstance({
        tokenId,
        instanceId,
        owner: USER1,
        mintedAt: BigInt(Date.now()),
        mintedBy: DEPLOYER,
        locked: false,
        version: 0n,
      });

      await store.updateNFTInstance(tokenId, instanceId, { owner: USER2 }, 0n);

      const instance = await store.getNFTInstance(tokenId, instanceId);
      expect(instance?.owner).toBe(USER2);
      expect(instance?.version).toBe(1n);
    });
  });

  describe('NFT Approvals', () => {
    it('should set and get NFT approval', async () => {
      const tokenId = makeTokenId('tok_nft');
      const instanceId = makeTokenInstanceId('inst_1');

      await store.setNFTApproval(
        {
          tokenId,
          instanceId,
          owner: USER1,
          approved: USER2,
          expiresAt: 0n,
        },
        tokenId,
        instanceId
      );

      const approval = await store.getNFTApproval(tokenId, instanceId);
      expect(approval?.approved).toBe(USER2);
    });

    it('should set and get operator approval', async () => {
      const tokenId = makeTokenId('tok_nft');

      await store.setNFTOperatorApproval({
        tokenId,
        owner: USER1,
        operator: OPERATOR,
        approved: true,
      });

      const isApproved = await store.getNFTOperatorApproval(tokenId, USER1, OPERATOR);
      expect(isApproved).toBe(true);
    });
  });

  describe('SFT Classes', () => {
    it('should create and get SFT class', async () => {
      const tokenId = makeTokenId('tok_sft');
      const classId = makeTokenClassId('cls_common');

      await store.createSFTClass({
        tokenId,
        classId,
        name: 'Common',
        totalSupply: 0n,
        maxSupply: 1000n,
        fungible: true,
        createdAt: BigInt(Date.now()),
        version: 0n,
      });

      const cls = await store.getSFTClass(tokenId, classId);
      expect(cls?.name).toBe('Common');
      expect(cls?.maxSupply).toBe(1000n);
    });

    it('should list SFT classes', async () => {
      const tokenId = makeTokenId('tok_sft');

      await store.createSFTClass({
        tokenId,
        classId: makeTokenClassId('cls_common'),
        name: 'Common',
        totalSupply: 0n,
        maxSupply: 0n,
        fungible: true,
        createdAt: BigInt(Date.now()),
        version: 0n,
      });

      await store.createSFTClass({
        tokenId,
        classId: makeTokenClassId('cls_rare'),
        name: 'Rare',
        totalSupply: 0n,
        maxSupply: 0n,
        fungible: true,
        createdAt: BigInt(Date.now()),
        version: 0n,
      });

      const classes = await store.listSFTClasses(tokenId);
      expect(classes.length).toBe(2);
    });
  });

  describe('SFT Balances', () => {
    it('should set and get SFT balance', async () => {
      const tokenId = makeTokenId('tok_sft');
      const classId = makeTokenClassId('cls_1');

      await store.setSFTBalance({
        tokenId,
        classId,
        holder: USER1,
        balance: 100n,
        locked: 0n,
        version: 0n,
      });

      const balance = await store.getSFTBalance(tokenId, classId, USER1);
      expect(balance?.balance).toBe(100n);
    });
  });

  describe('Store Utilities', () => {
    it('should clear store', async () => {
      const tokenId = generateTokenId(DEPLOYER, 'TEST', 0n);
      await store.createToken({
        tokenId,
        type: 'FT' as const,
        standard: TokenStandard.FT_V1,
        name: 'Test',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: 0n,
        maxSupply: 0n,
        creator: DEPLOYER,
        owner: DEPLOYER,
        mintable: true,
        burnable: true,
        paused: false,
        createdAt: BigInt(Date.now()),
        version: 0n,
      });

      store.clear();
      const stats = store.stats();

      expect(stats.tokens).toBe(0);
    });

    it('should report stats', async () => {
      const tokenId = generateTokenId(DEPLOYER, 'TEST', 0n);
      await store.createToken({
        tokenId,
        type: 'FT' as const,
        standard: TokenStandard.FT_V1,
        name: 'Test',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: 0n,
        maxSupply: 0n,
        creator: DEPLOYER,
        owner: DEPLOYER,
        mintable: true,
        burnable: true,
        paused: false,
        createdAt: BigInt(Date.now()),
        version: 0n,
      });

      const stats = store.stats();
      expect(stats.tokens).toBe(1);
    });
  });
});

// ============================================================================
// Deployer Tests
// ============================================================================

describe('Token Deployer', () => {
  let store: InMemoryTokenStore;
  let deployer: TokenDeployer;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    deployer = new TokenDeployer(store, DEPLOYER);
  });

  describe('FT Deployment', () => {
    it('should deploy FT with minimal options', async () => {
      const ft = await deployer.deployFT({ symbol: 'TEST' });

      expect(ft.tokenId).toBeDefined();
      expect(ft.info.symbol).toBe('TEST');
      expect(ft.info.name).toBe('TEST');
      expect(ft.info.decimals).toBe(18);
      expect(ft.info.mintable).toBe(true);
      expect(ft.info.burnable).toBe(true);
    });

    it('should deploy FT with all options', async () => {
      const ft = await deployer.deployFT({
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        initialSupply: 1000000n,
        maxSupply: 10000000n,
        mintable: true,
        burnable: false,
      });

      expect(ft.info.symbol).toBe('USDC');
      expect(ft.info.name).toBe('USD Coin');
      expect(ft.info.decimals).toBe(6);
      expect(ft.info.totalSupply).toBe(1000000n);
      expect(ft.info.maxSupply).toBe(10000000n);
      expect(ft.info.burnable).toBe(false);
    });

    it('should reject invalid symbol', async () => {
      await expect(deployer.deployFT({ symbol: 'x' })).rejects.toThrow('Invalid symbol');
    });

    it('should reject invalid decimals', async () => {
      await expect(deployer.deployFT({ symbol: 'TEST', decimals: 20 })).rejects.toThrow('Invalid decimals');
    });
  });

  describe('NFT Deployment', () => {
    it('should deploy NFT collection', async () => {
      const nft = await deployer.deployNFT({ symbol: 'PUNK' });

      expect(nft.tokenId).toBeDefined();
      expect(nft.info.symbol).toBe('PUNK');
      expect(nft.info.totalSupply).toBe(0n);
    });

    it('should deploy NFT with royalties', async () => {
      const nft = await deployer.deployNFT({
        symbol: 'PUNK',
        royaltyBps: 250,
        royaltyReceiver: USER1,
      });

      expect(nft.info.royaltyBps).toBe(250);
      expect(nft.info.royaltyReceiver).toBe(USER1);
    });

    it('should reject invalid royalty', async () => {
      await expect(
        deployer.deployNFT({ symbol: 'PUNK', royaltyBps: 15000 })
      ).rejects.toThrow('Invalid royalty');
    });
  });

  describe('SFT Deployment', () => {
    it('should deploy SFT collection', async () => {
      const sft = await deployer.deploySFT({ symbol: 'ITEM' });

      expect(sft.tokenId).toBeDefined();
      expect(sft.info.symbol).toBe('ITEM');
    });
  });

  describe('Get Existing Token', () => {
    it('should get FT handle by ID', async () => {
      const ft = await deployer.deployFT({ symbol: 'TEST' });
      const handle = await deployer.getToken(ft.tokenId);

      expect(handle).toBeInstanceOf(FTHandle);
    });

    it('should get NFT handle by ID', async () => {
      const nft = await deployer.deployNFT({ symbol: 'TEST' });
      const handle = await deployer.getToken(nft.tokenId);

      expect(handle).toBeInstanceOf(NFTHandle);
    });

    it('should throw for non-existent token', async () => {
      await expect(deployer.getToken(makeTokenId('tok_nonexistent'))).rejects.toThrow(TokenNotFoundError);
    });
  });
});

// ============================================================================
// FT Handle Tests
// ============================================================================

describe('FT Handle', () => {
  let store: InMemoryTokenStore;
  let deployer: TokenDeployer;
  let ft: FTHandle;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    deployer = new TokenDeployer(store, DEPLOYER);
    ft = await deployer.deployFT({ symbol: 'TEST', mintable: true, burnable: true });
  });

  describe('Mint', () => {
    it('should mint tokens to address', async () => {
      await ft.mint(USER1, 1000n);

      const balance = await ft.balanceOf(USER1);
      expect(balance).toBe(1000n);
      expect(ft.info.totalSupply).toBe(1000n);
    });

    it('should reject mint when not mintable', async () => {
      const nonMintable = await deployer.deployFT({ symbol: 'FIXED', mintable: false });
      await expect(nonMintable.mint(USER1, 1000n)).rejects.toThrow('not mintable');
    });

    it('should reject mint when paused', async () => {
      await ft.pause();
      await expect(ft.mint(USER1, 1000n)).rejects.toThrow(TokenPausedError);
    });

    it('should reject mint exceeding max supply', async () => {
      const capped = await deployer.deployFT({ symbol: 'CAP', maxSupply: 100n });
      await expect(capped.mint(USER1, 200n)).rejects.toThrow('exceed max supply');
    });

    it('should reject mint from non-owner', async () => {
      const userDeployer = new TokenDeployer(store, USER1);
      const userFt = new FTHandle(store, ft.info, USER1);
      await expect(userFt.mint(USER1, 1000n)).rejects.toThrow('Only owner');
    });
  });

  describe('Transfer', () => {
    beforeEach(async () => {
      await ft.mint(DEPLOYER, 10000n);
    });

    it('should transfer tokens', async () => {
      await ft.transfer(USER1, 500n);

      expect(await ft.balanceOf(DEPLOYER)).toBe(9500n);
      expect(await ft.balanceOf(USER1)).toBe(500n);
    });

    it('should reject transfer with insufficient balance', async () => {
      await expect(ft.transfer(USER1, 999999n)).rejects.toThrow(InsufficientBalanceError);
    });

    it('should reject transfer when paused', async () => {
      await ft.pause();
      await expect(ft.transfer(USER1, 100n)).rejects.toThrow(TokenPausedError);
    });
  });

  describe('TransferFrom', () => {
    beforeEach(async () => {
      await ft.mint(USER1, 10000n);
    });

    it('should transfer with allowance', async () => {
      // User1 approves deployer
      const user1Ft = new FTHandle(store, ft.info, USER1);
      await user1Ft.approve(DEPLOYER, 500n);

      // Deployer transfers from user1
      await ft.transferFrom(USER1, USER2, 500n);

      expect(await ft.balanceOf(USER1)).toBe(9500n);
      expect(await ft.balanceOf(USER2)).toBe(500n);
    });

    it('should reject transfer without allowance', async () => {
      await expect(ft.transferFrom(USER1, USER2, 500n)).rejects.toThrow('Insufficient allowance');
    });

    it('should reduce allowance after transfer', async () => {
      const user1Ft = new FTHandle(store, ft.info, USER1);
      await user1Ft.approve(DEPLOYER, 1000n);

      await ft.transferFrom(USER1, USER2, 300n);

      const remaining = await ft.allowance(USER1, DEPLOYER);
      expect(remaining).toBe(700n);
    });
  });

  describe('Burn', () => {
    beforeEach(async () => {
      await ft.mint(DEPLOYER, 10000n);
    });

    it('should burn own tokens', async () => {
      await ft.burn(DEPLOYER, 1000n);

      expect(await ft.balanceOf(DEPLOYER)).toBe(9000n);
      expect(ft.info.totalSupply).toBe(9000n);
    });

    it('should reject burn when not burnable', async () => {
      const nonBurnable = await deployer.deployFT({
        symbol: 'FIXED',
        initialSupply: 1000n,
        burnable: false,
      });
      await expect(nonBurnable.burn(DEPLOYER, 100n)).rejects.toThrow('not burnable');
    });
  });

  describe('Approve', () => {
    it('should set allowance', async () => {
      await ft.approve(USER1, 1000n);

      const allowance = await ft.allowance(DEPLOYER, USER1);
      expect(allowance).toBe(1000n);
    });
  });

  describe('Pause/Unpause', () => {
    it('should pause and unpause', async () => {
      await ft.pause();
      expect(ft.info.paused).toBe(true);

      await ft.unpause();
      expect(ft.info.paused).toBe(false);
    });

    it('should reject pause from non-owner', async () => {
      const userFt = new FTHandle(store, ft.info, USER1);
      await expect(userFt.pause()).rejects.toThrow('Only owner');
    });
  });
});

// ============================================================================
// NFT Handle Tests
// ============================================================================

describe('NFT Handle', () => {
  let store: InMemoryTokenStore;
  let deployer: TokenDeployer;
  let nft: NFTHandle;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    deployer = new TokenDeployer(store, DEPLOYER);
    nft = await deployer.deployNFT({ symbol: 'PUNK', mintable: true, burnable: true });
  });

  describe('Mint', () => {
    it('should mint NFT', async () => {
      const instanceId = await nft.mint(USER1, { name: 'Punk #1', symbol: 'PUNK#1' });

      expect(instanceId).toBeDefined();
      expect(await nft.ownerOf(instanceId)).toBe(USER1);
      expect(nft.info.totalSupply).toBe(1n);
    });

    it('should mint multiple NFTs', async () => {
      await nft.mint(USER1);
      await nft.mint(USER1);
      await nft.mint(USER2);

      const user1Tokens = await nft.tokensOf(USER1);
      const user2Tokens = await nft.tokensOf(USER2);

      expect(user1Tokens.length).toBe(2);
      expect(user2Tokens.length).toBe(1);
      expect(nft.info.totalSupply).toBe(3n);
    });

    it('should reject mint when not mintable', async () => {
      const nonMintable = await deployer.deployNFT({ symbol: 'FIXED', mintable: false });
      await expect(nonMintable.mint(USER1)).rejects.toThrow('not mintable');
    });

    it('should reject mint exceeding max supply', async () => {
      const capped = await deployer.deployNFT({ symbol: 'CAP', maxSupply: 2n });
      await capped.mint(USER1);
      await capped.mint(USER1);
      await expect(capped.mint(USER1)).rejects.toThrow('exceed max supply');
    });
  });

  describe('Transfer', () => {
    let instanceId: TokenInstanceId;

    beforeEach(async () => {
      instanceId = await nft.mint(DEPLOYER);
    });

    it('should transfer NFT', async () => {
      await nft.transfer(USER1, instanceId);

      expect(await nft.ownerOf(instanceId)).toBe(USER1);
    });

    it('should reject transfer by non-owner without approval', async () => {
      const userNft = new NFTHandle(store, nft.info, USER1);
      await expect(userNft.transferFrom(DEPLOYER, USER2, instanceId)).rejects.toThrow('Not authorized');
    });
  });

  describe('Approval', () => {
    let instanceId: TokenInstanceId;

    beforeEach(async () => {
      instanceId = await nft.mint(DEPLOYER);
    });

    it('should approve and allow transfer', async () => {
      await nft.approve(USER1, instanceId);

      const userNft = new NFTHandle(store, nft.info, USER1);
      await userNft.transferFrom(DEPLOYER, USER2, instanceId);

      expect(await nft.ownerOf(instanceId)).toBe(USER2);
    });

    it('should set operator approval for all', async () => {
      await nft.mint(DEPLOYER);
      const instanceId2 = await nft.mint(DEPLOYER);

      await nft.setApprovalForAll(OPERATOR, true);

      const opNft = new NFTHandle(store, nft.info, OPERATOR);
      await opNft.transferFrom(DEPLOYER, USER1, instanceId);
      await opNft.transferFrom(DEPLOYER, USER1, instanceId2);

      expect(await nft.ownerOf(instanceId)).toBe(USER1);
      expect(await nft.ownerOf(instanceId2)).toBe(USER1);
    });
  });

  describe('Burn', () => {
    let instanceId: TokenInstanceId;

    beforeEach(async () => {
      instanceId = await nft.mint(DEPLOYER);
    });

    it('should burn NFT', async () => {
      await nft.burn(instanceId);

      const owner = await nft.ownerOf(instanceId);
      expect(owner).toBe('0x0000000000000000000000000000000000000000');
      expect(nft.info.totalSupply).toBe(0n);
    });
  });
});

// ============================================================================
// SFT Handle Tests
// ============================================================================

describe('SFT Handle', () => {
  let store: InMemoryTokenStore;
  let deployer: TokenDeployer;
  let sft: SFTHandle;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    deployer = new TokenDeployer(store, DEPLOYER);
    sft = await deployer.deploySFT({ symbol: 'ITEM', mintable: true, burnable: true });
  });

  describe('Class Creation', () => {
    it('should create token class', async () => {
      const classId = await sft.createClass('Common Sword', { maxSupply: 1000n });

      const classes = await sft.listClasses();
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe('Common Sword');
      expect(classes[0].maxSupply).toBe(1000n);
    });

    it('should reject class creation from non-owner', async () => {
      const userSft = new SFTHandle(store, sft.info, USER1);
      await expect(userSft.createClass('Test')).rejects.toThrow('Only owner');
    });
  });

  describe('Mint', () => {
    let classId: TokenClassId;

    beforeEach(async () => {
      classId = await sft.createClass('Common');
    });

    it('should mint tokens to address', async () => {
      await sft.mint(USER1, classId, 100n);

      expect(await sft.balanceOf(USER1, classId)).toBe(100n);
    });

    it('should reject mint exceeding class max supply', async () => {
      const cappedClass = await sft.createClass('Rare', { maxSupply: 10n });
      await expect(sft.mint(USER1, cappedClass, 20n)).rejects.toThrow('exceed class max supply');
    });
  });

  describe('Transfer', () => {
    let classId: TokenClassId;

    beforeEach(async () => {
      classId = await sft.createClass('Common');
      await sft.mint(DEPLOYER, classId, 1000n);
    });

    it('should transfer tokens', async () => {
      await sft.transfer(USER1, classId, 100n);

      expect(await sft.balanceOf(DEPLOYER, classId)).toBe(900n);
      expect(await sft.balanceOf(USER1, classId)).toBe(100n);
    });

    it('should reject transfer with insufficient balance', async () => {
      await expect(sft.transfer(USER1, classId, 9999n)).rejects.toThrow(InsufficientBalanceError);
    });
  });

  describe('Operator Approval', () => {
    let classId: TokenClassId;

    beforeEach(async () => {
      classId = await sft.createClass('Common');
      await sft.mint(DEPLOYER, classId, 1000n);
    });

    it('should allow operator transfer', async () => {
      await sft.setApprovalForAll(OPERATOR, true);

      const opSft = new SFTHandle(store, sft.info, OPERATOR);
      await opSft.transferFrom(DEPLOYER, USER1, classId, 100n);

      expect(await sft.balanceOf(USER1, classId)).toBe(100n);
    });

    it('should reject transfer without operator approval', async () => {
      const opSft = new SFTHandle(store, sft.info, OPERATOR);
      await expect(opSft.transferFrom(DEPLOYER, USER1, classId, 100n)).rejects.toThrow('Not authorized');
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('Factory Functions', () => {
  it('createTokenStore should return InMemoryTokenStore', () => {
    const store = createTokenStore();
    expect(store).toBeInstanceOf(InMemoryTokenStore);
  });

  it('createDeployer should return TokenDeployer', () => {
    const store = createTokenStore();
    const deployer = createDeployer(store, DEPLOYER);
    expect(deployer).toBeInstanceOf(TokenDeployer);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases', () => {
  let store: InMemoryTokenStore;
  let deployer: TokenDeployer;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    deployer = new TokenDeployer(store, DEPLOYER);
  });

  it('should handle zero amount transfers', async () => {
    const ft = await deployer.deployFT({ symbol: 'TEST' });
    await ft.mint(DEPLOYER, 1000n);

    // Zero transfer should work (no-op)
    await ft.transfer(USER1, 0n);

    expect(await ft.balanceOf(DEPLOYER)).toBe(1000n);
    expect(await ft.balanceOf(USER1)).toBe(0n);
  });

  it('should handle self-transfer', async () => {
    const ft = await deployer.deployFT({ symbol: 'TEST' });
    await ft.mint(DEPLOYER, 1000n);

    await ft.transfer(DEPLOYER, 500n);

    expect(await ft.balanceOf(DEPLOYER)).toBe(1000n);
  });

  it('should clone tokens to prevent mutation', async () => {
    const ft = await deployer.deployFT({ symbol: 'TEST' });
    const info1 = ft.info;
    const info2 = ft.info;

    expect(info1).not.toBe(info2);
  });

  it('should handle multiple deploys with same symbol', async () => {
    const ft1 = await deployer.deployFT({ symbol: 'TEST' });
    const ft2 = await deployer.deployFT({ symbol: 'TEST' });

    expect(ft1.tokenId).not.toBe(ft2.tokenId);
  });
});
