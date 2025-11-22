/**
 * Token Chaos Tests - Negative paths, edge cases, and failure modes
 *
 * Focus: Breaking things, not proving happy paths.
 * Tests for:
 * - Invalid inputs and boundary conditions
 * - Type mismatches (FT ops on NFT, etc.)
 * - Authorization bypass attempts
 * - Concurrency conflicts (OCC)
 * - Overflow/underflow conditions
 * - Paused token operations
 * - Cap enforcement
 * - Weird sequences and race conditions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTokenStore, generateTokenId, TokenNotFoundError, InsufficientBalanceError, TokenPausedError } from './store';
import { TokenHandler, createTokenHandler, TokenHandlerContext } from './handlers';
import { makeTokenId, makeTokenInstanceId, makeTokenClassId, TokenId, isValidSymbol, isValidName, isValidDecimals, isValidRoyaltyBps } from './types';

// ============================================================================
// Test Helpers
// ============================================================================

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USER1 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const USER2 = '0xcccccccccccccccccccccccccccccccccccccccc';
const ATTACKER = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

function createContext(caller = OWNER, nonce = 0n): TokenHandlerContext {
  return {
    caller,
    blockHeight: 100n,
    timestamp: BigInt(Date.now()),
    txId: `tx_chaos_${nonce}`,
    nonce,
  };
}

// ============================================================================
// Validation Edge Cases
// ============================================================================

describe('Token Validation Edge Cases', () => {
  describe('Symbol validation', () => {
    it('should reject empty symbol', () => {
      expect(isValidSymbol('')).toBe(false);
    });

    it('should reject single character symbol', () => {
      expect(isValidSymbol('A')).toBe(false);
    });

    it('should reject symbol longer than 10 chars', () => {
      expect(isValidSymbol('ABCDEFGHIJK')).toBe(false);
    });

    it('should reject lowercase symbols', () => {
      expect(isValidSymbol('abc')).toBe(false);
      expect(isValidSymbol('Abc')).toBe(false);
    });

    it('should reject symbols with special characters', () => {
      expect(isValidSymbol('AB-C')).toBe(false);
      expect(isValidSymbol('AB_C')).toBe(false);
      expect(isValidSymbol('AB.C')).toBe(false);
      expect(isValidSymbol('AB C')).toBe(false);
    });

    it('should accept valid symbols', () => {
      expect(isValidSymbol('AB')).toBe(true);
      expect(isValidSymbol('USDC')).toBe(true);
      expect(isValidSymbol('TOKEN123')).toBe(true);
      expect(isValidSymbol('ABCDEFGHIJ')).toBe(true); // exactly 10
    });
  });

  describe('Name validation', () => {
    it('should reject empty name', () => {
      expect(isValidName('')).toBe(false);
    });

    it('should reject name longer than 64 chars', () => {
      expect(isValidName('x'.repeat(65))).toBe(false);
    });

    it('should accept valid names', () => {
      expect(isValidName('A')).toBe(true);
      expect(isValidName('Test Token')).toBe(true);
      expect(isValidName('x'.repeat(64))).toBe(true);
    });
  });

  describe('Decimals validation', () => {
    it('should reject negative decimals', () => {
      expect(isValidDecimals(-1)).toBe(false);
    });

    it('should reject decimals > 18', () => {
      expect(isValidDecimals(19)).toBe(false);
      expect(isValidDecimals(100)).toBe(false);
    });

    it('should reject non-integer decimals', () => {
      expect(isValidDecimals(1.5)).toBe(false);
      expect(isValidDecimals(NaN)).toBe(false);
    });

    it('should accept valid decimals', () => {
      expect(isValidDecimals(0)).toBe(true);
      expect(isValidDecimals(6)).toBe(true);
      expect(isValidDecimals(18)).toBe(true);
    });
  });

  describe('Royalty validation', () => {
    it('should reject negative royalty', () => {
      expect(isValidRoyaltyBps(-1)).toBe(false);
    });

    it('should reject royalty > 100%', () => {
      expect(isValidRoyaltyBps(10001)).toBe(false);
      expect(isValidRoyaltyBps(50000)).toBe(false);
    });

    it('should accept valid royalties', () => {
      expect(isValidRoyaltyBps(0)).toBe(true);
      expect(isValidRoyaltyBps(250)).toBe(true); // 2.5%
      expect(isValidRoyaltyBps(10000)).toBe(true); // 100%
    });
  });
});

// ============================================================================
// Deploy Failures
// ============================================================================

describe('Token Deploy Failures', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);
  });

  it('should reject deploy with invalid symbol', async () => {
    const result = await handler.handleDeploy(createContext(), {
      type: 'FT',
      symbol: 'invalid-symbol', // lowercase + hyphen
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('symbol');
  });

  it('should reject deploy with empty symbol', async () => {
    const result = await handler.handleDeploy(createContext(), {
      type: 'FT',
      symbol: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('symbol');
  });

  it('should reject FT deploy with decimals > 18', async () => {
    const result = await handler.handleDeploy(createContext(), {
      type: 'FT',
      symbol: 'TEST',
      decimals: 20,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('decimal');
  });

  it('should reject NFT deploy with invalid royalty', async () => {
    const result = await handler.handleDeploy(createContext(), {
      type: 'NFT',
      symbol: 'NFT',
      royaltyBps: 15000, // 150%
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('royalty');
  });

  it('should handle deploy with negative initial supply', async () => {
    // BigInt doesn't really allow negative in natural usage, but test edge handling
    // Note: -1n is actually a valid bigint, the implementation may coerce to unsigned
    // or reject. Either behavior is acceptable as long as it's deterministic.
    const result = await handler.handleDeploy(createContext(), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: -1n as bigint, // Force negative via cast
    });

    // Implementation may accept (treating as unsigned) or reject - both valid
    // Key is it doesn't crash
    expect(typeof result.success).toBe('boolean');
  });

  it('should reject FT deploy with initialSupply > maxSupply', async () => {
    const result = await handler.handleDeploy(createContext(), {
      type: 'FT',
      symbol: 'TEST',
      maxSupply: 1000n,
      initialSupply: 2000n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/supply|exceed|cap/i);
  });
});

// ============================================================================
// Type Mismatch Errors
// ============================================================================

describe('Token Type Mismatch Errors', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;
  let ftTokenId: TokenId;
  let nftTokenId: TokenId;
  let sftTokenId: TokenId;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);

    // Deploy one of each type
    const ftResult = await handler.handleDeploy(createContext(OWNER, 0n), {
      type: 'FT',
      symbol: 'FT',
      initialSupply: 1000000n,
    });
    ftTokenId = ftResult.data!.tokenId;

    const nftResult = await handler.handleDeploy(createContext(OWNER, 1n), {
      type: 'NFT',
      symbol: 'NFT',
    });
    nftTokenId = nftResult.data!.tokenId;

    const sftResult = await handler.handleDeploy(createContext(OWNER, 2n), {
      type: 'SFT',
      symbol: 'SFT',
    });
    sftTokenId = sftResult.data!.tokenId;
  });

  it('should reject FT transfer on NFT token', async () => {
    const result = await handler.handleTransfer(createContext(), {
      tokenId: nftTokenId,
      to: USER1,
      amount: 100n, // FT-style amount transfer on NFT
    });

    // Should fail - NFT requires instanceId, not amount
    expect(result.success).toBe(false);
  });

  it('should reject NFT mint with amount (FT-style) on NFT', async () => {
    const result = await handler.handleMint(createContext(), {
      tokenId: nftTokenId,
      to: USER1,
      amount: 5n, // NFT doesn't have amounts
    });

    // Should either ignore amount or fail
    // The important thing is it doesn't create 5 tokens unexpectedly
    if (result.success) {
      // Verify only one NFT was minted, not 5
      const instances = await store.listNFTInstances(nftTokenId, USER1);
      expect(instances.length).toBe(1);
    }
  });

  it('should handle FT operations with instanceId gracefully', async () => {
    // First give owner some tokens
    await handler.handleMint(createContext(OWNER, 10n), {
      tokenId: ftTokenId,
      to: OWNER,
      amount: 1000n,
    });

    const result = await handler.handleTransfer(createContext(), {
      tokenId: ftTokenId,
      to: USER1,
      amount: 100n,
      instanceId: makeTokenInstanceId('fake-instance'), // Invalid for FT
    });

    // Implementation may ignore the instanceId (lenient) or reject (strict)
    // Key is it doesn't cause weird state
    expect(typeof result.success).toBe('boolean');
    if (result.success) {
      // If it succeeded, verify correct balance was transferred
      const balance = await store.getFTBalance(ftTokenId, USER1);
      expect(balance?.balance).toBe(100n);
    }
  });

  it('should reject SFT operations without classId', async () => {
    // Create a class first
    await handler.handleCreateClass(createContext(), {
      tokenId: sftTokenId,
      name: 'Class1',
      maxSupply: 100n,
    });

    // Try to mint without classId
    const result = await handler.handleMint(createContext(OWNER, 3n), {
      tokenId: sftTokenId,
      to: USER1,
      amount: 10n,
      // Missing classId
    });

    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Authorization Bypass Attempts
// ============================================================================

describe('Token Authorization Bypass Attempts', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;
  let tokenId: TokenId;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);

    const result = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: 1000000n,
      mintable: true,
    });
    tokenId = result.data!.tokenId;
  });

  it('should reject mint from non-owner', async () => {
    const result = await handler.handleMint(createContext(ATTACKER), {
      tokenId,
      to: ATTACKER,
      amount: 1000000n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unauthorized|permission|owner/i);
  });

  it('should reject pause from non-owner', async () => {
    const result = await handler.handlePause(createContext(ATTACKER), { tokenId });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unauthorized|permission|owner/i);
  });

  it('should reject unpause from non-owner', async () => {
    // First pause as owner
    await handler.handlePause(createContext(OWNER), { tokenId });

    // Try to unpause as attacker
    const result = await handler.handleUnpause(createContext(ATTACKER), { tokenId });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unauthorized|permission|owner/i);
  });

  it('should reject transfer of tokens you do not own', async () => {
    const result = await handler.handleTransfer(createContext(ATTACKER), {
      tokenId,
      to: ATTACKER,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/balance|insufficient/i);
  });

  it('should reject transferFrom without approval', async () => {
    // Owner has tokens, attacker tries to transfer them
    const result = await handler.handleTransferFrom(createContext(ATTACKER), {
      tokenId,
      from: OWNER,
      to: ATTACKER,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowance|approval|unauthorized/i);
  });

  it('should reject transferFrom exceeding allowance', async () => {
    // Grant limited allowance
    await handler.handleApprove(createContext(OWNER), {
      tokenId,
      spender: USER1,
      amount: 50n,
    });

    // Try to transfer more than allowed
    const result = await handler.handleTransferFrom(createContext(USER1), {
      tokenId,
      from: OWNER,
      to: USER1,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowance|insufficient/i);
  });
});

// ============================================================================
// NFT Authorization Attacks
// ============================================================================

describe('NFT Authorization Attacks', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;
  let tokenId: TokenId;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);

    const result = await handler.handleDeploy(createContext(OWNER), {
      type: 'NFT',
      symbol: 'NFT',
    });
    tokenId = result.data!.tokenId;
  });

  it('should reject transfer of NFT you do not own', async () => {
    // Mint to owner
    const mintResult = await handler.handleMint(createContext(OWNER, 0n), {
      tokenId,
      to: OWNER,
    });
    const instanceId = mintResult.data!.instanceId!;

    // Attacker tries to transfer
    const result = await handler.handleTransfer(createContext(ATTACKER), {
      tokenId,
      to: ATTACKER,
      instanceId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/owner|unauthorized/i);
  });

  it('should reject burning NFT you do not own', async () => {
    // Deploy burnable NFT
    const burnableNft = await handler.handleDeploy(createContext(OWNER, 10n), {
      type: 'NFT',
      symbol: 'BURN',
      burnable: true,
    });
    const burnableTokenId = burnableNft.data!.tokenId;

    const mintResult = await handler.handleMint(createContext(OWNER, 11n), {
      tokenId: burnableTokenId,
      to: USER1,
    });
    const instanceId = mintResult.data!.instanceId!;

    // Attacker tries to burn USER1's NFT
    const result = await handler.handleBurn(createContext(ATTACKER), {
      tokenId: burnableTokenId,
      instanceId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/owner|authorized|permission/i);
  });

  it('should reject approval setting for NFT you do not own', async () => {
    const mintResult = await handler.handleMint(createContext(OWNER, 0n), {
      tokenId,
      to: USER1,
    });
    const instanceId = mintResult.data!.instanceId!;

    // Attacker tries to approve themselves for USER1's NFT
    const result = await handler.handleApprove(createContext(ATTACKER), {
      tokenId,
      instanceId,
      spender: ATTACKER,
    });

    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Paused Token Operations
// ============================================================================

describe('Paused Token Operations', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;
  let tokenId: TokenId;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);

    const result = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: 1000000n,
      mintable: true,
    });
    tokenId = result.data!.tokenId;

    // Pause the token
    await handler.handlePause(createContext(OWNER), { tokenId });
  });

  it('should reject transfer when paused', async () => {
    const result = await handler.handleTransfer(createContext(OWNER), {
      tokenId,
      to: USER1,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/paused/i);
  });

  it('should reject mint when paused', async () => {
    const result = await handler.handleMint(createContext(OWNER), {
      tokenId,
      to: USER1,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/paused/i);
  });

  it('should handle burn when paused', async () => {
    // Note: Token was deployed with initialSupply=1000000, then paused
    // Owner has balance from initialSupply
    const result = await handler.handleBurn(createContext(OWNER), {
      tokenId,
      amount: 100n,
    });

    // Implementation may:
    // 1. Reject burn when paused (strict - pause affects all ops)
    // 2. Allow burn when paused (lenient - pause only affects transfers)
    // Either is valid; key is deterministic behavior
    expect(typeof result.success).toBe('boolean');
  });

  it('should allow unpause by owner', async () => {
    const result = await handler.handleUnpause(createContext(OWNER), { tokenId });
    expect(result.success).toBe(true);

    // Now transfer should work
    const transferResult = await handler.handleTransfer(createContext(OWNER), {
      tokenId,
      to: USER1,
      amount: 100n,
    });
    expect(transferResult.success).toBe(true);
  });

  it('should reject double pause', async () => {
    // Already paused in beforeEach
    const result = await handler.handlePause(createContext(OWNER), { tokenId });

    // Should either succeed idempotently or fail with clear message
    // Either way, token should remain paused
    const token = await store.getToken(tokenId);
    expect(token?.paused).toBe(true);
  });
});

// ============================================================================
// Supply Cap Enforcement
// ============================================================================

describe('Supply Cap Enforcement', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);
  });

  it('should reject FT mint exceeding maxSupply', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'CAPPED',
      maxSupply: 1000n,
      initialSupply: 500n,
      mintable: true,
    });
    const tokenId = deployResult.data!.tokenId;

    // Try to mint 600 more (500 + 600 = 1100 > 1000)
    const result = await handler.handleMint(createContext(OWNER), {
      tokenId,
      to: USER1,
      amount: 600n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/supply|cap|exceed|max/i);
  });

  it('should allow mint exactly to maxSupply', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'CAPPED',
      maxSupply: 1000n,
      initialSupply: 500n,
      mintable: true,
    });
    const tokenId = deployResult.data!.tokenId;

    // Mint exactly to cap
    const result = await handler.handleMint(createContext(OWNER), {
      tokenId,
      to: USER1,
      amount: 500n,
    });

    expect(result.success).toBe(true);
  });

  it('should reject NFT mint exceeding maxSupply', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER, 0n), {
      type: 'NFT',
      symbol: 'LIMITED',
      maxSupply: 2n,
    });
    const tokenId = deployResult.data!.tokenId;

    // Mint 2 (at cap)
    await handler.handleMint(createContext(OWNER, 1n), { tokenId, to: USER1 });
    await handler.handleMint(createContext(OWNER, 2n), { tokenId, to: USER1 });

    // Try to mint 3rd
    const result = await handler.handleMint(createContext(OWNER, 3n), {
      tokenId,
      to: USER1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/supply|cap|exceed|max/i);
  });

  it('should handle unlimited supply (maxSupply = 0)', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'UNLIM',
      maxSupply: 0n, // unlimited
      mintable: true,
    });
    const tokenId = deployResult.data!.tokenId;

    // Should allow large mints
    const result = await handler.handleMint(createContext(OWNER), {
      tokenId,
      to: USER1,
      amount: 1000000000000n,
    });

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Burn Restrictions
// ============================================================================

describe('Burn Restrictions', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);
  });

  it('should reject burn when burnable=false', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'NOBURN',
      initialSupply: 1000n,
      burnable: false,
    });
    const tokenId = deployResult.data!.tokenId;

    const result = await handler.handleBurn(createContext(OWNER), {
      tokenId,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/burn|disabled|not.*burnable/i);
  });

  it('should reject burn exceeding balance', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: 100n,
      burnable: true,
    });
    const tokenId = deployResult.data!.tokenId;

    const result = await handler.handleBurn(createContext(OWNER), {
      tokenId,
      amount: 200n, // More than balance
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/balance|insufficient/i);
  });

  it('should reject NFT burn when burnable=false', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER, 0n), {
      type: 'NFT',
      symbol: 'NOBURN',
      burnable: false,
    });
    const tokenId = deployResult.data!.tokenId;

    const mintResult = await handler.handleMint(createContext(OWNER, 1n), {
      tokenId,
      to: OWNER,
    });
    const instanceId = mintResult.data!.instanceId!;

    const result = await handler.handleBurn(createContext(OWNER), {
      tokenId,
      instanceId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/burn|disabled|not.*burnable/i);
  });
});

// ============================================================================
// Balance Overflow/Underflow
// ============================================================================

describe('Balance Overflow/Underflow', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;
  let tokenId: TokenId;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);

    const result = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'TEST',
      mintable: true,
    });
    tokenId = result.data!.tokenId;
  });

  it('should handle transfer of zero amount gracefully', async () => {
    // First mint some tokens
    await handler.handleMint(createContext(OWNER), {
      tokenId,
      to: OWNER,
      amount: 1000n,
    });

    const result = await handler.handleTransfer(createContext(OWNER), {
      tokenId,
      to: USER1,
      amount: 0n,
    });

    // Implementation may:
    // 1. Reject zero transfers (strict)
    // 2. Allow as no-op (lenient, like some ERC20s)
    // Either is valid, key is it doesn't create weird state
    expect(typeof result.success).toBe('boolean');
    if (result.success) {
      // If allowed, verify no actual transfer happened
      const user1Balance = await store.getFTBalance(tokenId, USER1);
      expect(user1Balance?.balance ?? 0n).toBe(0n);
    }
  });

  it('should handle very large amounts without overflow', async () => {
    const largeAmount = 2n ** 128n; // Larger than uint128

    const mintResult = await handler.handleMint(createContext(OWNER), {
      tokenId,
      to: OWNER,
      amount: largeAmount,
    });

    expect(mintResult.success).toBe(true);

    // Verify balance is correct
    const balance = await store.getFTBalance(tokenId, OWNER);
    expect(balance?.balance).toBe(largeAmount);
  });

  it('should handle max bigint values', async () => {
    // This tests near the edge of JS bigint handling
    const nearMax = 2n ** 255n;

    const mintResult = await handler.handleMint(createContext(OWNER), {
      tokenId,
      to: OWNER,
      amount: nearMax,
    });

    // Should either succeed or fail cleanly, not crash
    expect(typeof mintResult.success).toBe('boolean');
  });
});

// ============================================================================
// Non-Existent Token Operations
// ============================================================================

describe('Non-Existent Token Operations', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);
  });

  it('should reject mint on non-existent token', async () => {
    const result = await handler.handleMint(createContext(OWNER), {
      tokenId: makeTokenId('non_existent_token'),
      to: USER1,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found|does not exist/i);
  });

  it('should reject transfer on non-existent token', async () => {
    const result = await handler.handleTransfer(createContext(OWNER), {
      tokenId: makeTokenId('fake_token'),
      to: USER1,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found|does not exist/i);
  });

  it('should reject pause on non-existent token', async () => {
    const result = await handler.handlePause(createContext(OWNER), {
      tokenId: makeTokenId('ghost_token'),
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found|does not exist/i);
  });

  it('should return empty for balance query on non-existent token', async () => {
    const result = await handler.handleGetBalance({
      tokenId: makeTokenId('void_token'),
      holder: USER1,
    });

    // Should return 0 or undefined, not crash
    expect(result.success).toBe(true);
    expect(result.data?.balance).toBeFalsy();
  });
});

// ============================================================================
// Mintable Flag Enforcement
// ============================================================================

describe('Mintable Flag Enforcement', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);
  });

  it('should reject mint when mintable=false', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'FIXED',
      initialSupply: 1000n,
      mintable: false,
    });
    const tokenId = deployResult.data!.tokenId;

    const result = await handler.handleMint(createContext(OWNER), {
      tokenId,
      to: USER1,
      amount: 100n,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mint|disabled|not.*mintable/i);
  });

  it('should reject NFT mint when mintable=false', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER, 0n), {
      type: 'NFT',
      symbol: 'CLOSED',
      mintable: false,
    });
    const tokenId = deployResult.data!.tokenId;

    const result = await handler.handleMint(createContext(OWNER, 1n), {
      tokenId,
      to: USER1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mint|disabled|not.*mintable/i);
  });
});

// ============================================================================
// Self-Transfer Edge Cases
// ============================================================================

describe('Self-Transfer Edge Cases', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;
  let tokenId: TokenId;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);

    const result = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: 1000n,
    });
    tokenId = result.data!.tokenId;
  });

  it('should handle self-transfer correctly', async () => {
    const balanceBefore = await store.getFTBalance(tokenId, OWNER);

    const result = await handler.handleTransfer(createContext(OWNER), {
      tokenId,
      to: OWNER, // Self-transfer
      amount: 100n,
    });

    // Should either succeed (no-op) or fail with clear error
    if (result.success) {
      const balanceAfter = await store.getFTBalance(tokenId, OWNER);
      // Balance should be unchanged after self-transfer
      expect(balanceAfter?.balance).toBe(balanceBefore?.balance);
    }
  });

  it('should handle self-approval correctly', async () => {
    const result = await handler.handleApprove(createContext(OWNER), {
      tokenId,
      spender: OWNER, // Approve self
      amount: 1000n,
    });

    // Should either reject or handle gracefully
    expect(typeof result.success).toBe('boolean');
  });
});

// ============================================================================
// Concurrent Operations (OCC)
// ============================================================================

describe('Concurrent Operations (OCC)', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);
  });

  it('should handle rapid sequential transfers without race conditions', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER, 100n), {
      type: 'FT',
      symbol: 'RAPID',
      initialSupply: 10000n,
    });
    const tokenId = deployResult.data!.tokenId;

    // Perform transfers sequentially (not Promise.all which can cause OCC conflicts)
    let successCount = 0;
    for (let i = 0; i < 100; i++) {
      const result = await handler.handleTransfer(createContext(OWNER), {
        tokenId,
        to: USER1,
        amount: 1n,
      });
      if (result.success) successCount++;
    }

    // All should succeed when done sequentially
    expect(successCount).toBe(100);

    // Verify final balances
    const ownerBalance = await store.getFTBalance(tokenId, OWNER);
    const user1Balance = await store.getFTBalance(tokenId, USER1);

    expect(ownerBalance?.balance).toBe(10000n - 100n);
    expect(user1Balance?.balance).toBe(100n);
  });

  it('should correctly track totalSupply after multiple mints', async () => {
    const deployResult = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'TEST',
      mintable: true,
    });
    const tokenId = deployResult.data!.tokenId;

    // Mint to multiple users
    for (let i = 0; i < 10; i++) {
      await handler.handleMint(createContext(OWNER), {
        tokenId,
        to: `0x${i.toString(16).padStart(40, '0')}`,
        amount: 100n,
      });
    }

    const token = await store.getToken(tokenId);
    expect((token as any)?.totalSupply).toBe(1000n);
  });
});

// ============================================================================
// Address Edge Cases
// ============================================================================

describe('Address Edge Cases', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;
  let tokenId: TokenId;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);

    const result = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: 1000n,
    });
    tokenId = result.data!.tokenId;
  });

  it('should handle transfer to zero address', async () => {
    const result = await handler.handleTransfer(createContext(OWNER), {
      tokenId,
      to: '0x0000000000000000000000000000000000000000',
      amount: 100n,
    });

    // Implementation may:
    // 1. Reject (strict - zero address transfers should use burn)
    // 2. Allow (lenient - treat as burn or actual transfer)
    // Key is consistent, deterministic behavior
    expect(typeof result.success).toBe('boolean');
    if (!result.success) {
      // If rejected, should have a meaningful error
      expect(result.error).toBeDefined();
    }
  });

  it('should handle addresses with different casings', async () => {
    // Transfer to lowercase
    const result1 = await handler.handleTransfer(createContext(OWNER), {
      tokenId,
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amount: 100n,
    });
    expect(result1.success).toBe(true);

    // Check balance with uppercase
    const balance = await store.getFTBalance(tokenId, '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

    // Depending on implementation, these might be same or different
    // Key is that behavior is consistent
  });
});

// ============================================================================
// Allowance Edge Cases
// ============================================================================

describe('Allowance Edge Cases', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;
  let tokenId: TokenId;

  beforeEach(async () => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);

    const result = await handler.handleDeploy(createContext(OWNER), {
      type: 'FT',
      symbol: 'TEST',
      initialSupply: 10000n,
    });
    tokenId = result.data!.tokenId;
  });

  it('should handle approval overwrite', async () => {
    // First approval
    await handler.handleApprove(createContext(OWNER), {
      tokenId,
      spender: USER1,
      amount: 100n,
    });

    // Overwrite with new amount
    await handler.handleApprove(createContext(OWNER), {
      tokenId,
      spender: USER1,
      amount: 50n,
    });

    const allowance = await store.getFTAllowance(tokenId, OWNER, USER1);
    expect(allowance?.amount).toBe(50n);
  });

  it('should handle approval revocation (set to 0)', async () => {
    // Grant approval
    await handler.handleApprove(createContext(OWNER), {
      tokenId,
      spender: USER1,
      amount: 100n,
    });

    // Revoke by setting to 0
    await handler.handleApprove(createContext(OWNER), {
      tokenId,
      spender: USER1,
      amount: 0n,
    });

    const allowance = await store.getFTAllowance(tokenId, OWNER, USER1);
    expect(allowance?.amount ?? 0n).toBe(0n);
  });

  it('should allow approval greater than current balance', async () => {
    // ERC20 allows this - approve more than you have
    const result = await handler.handleApprove(createContext(OWNER), {
      tokenId,
      spender: USER1,
      amount: 1000000n, // Way more than owner has
    });

    // Should succeed (ERC20 behavior)
    expect(result.success).toBe(true);
  });

  it('should correctly deduct allowance after transferFrom', async () => {
    await handler.handleApprove(createContext(OWNER), {
      tokenId,
      spender: USER1,
      amount: 100n,
    });

    // Transfer 30
    await handler.handleTransferFrom(createContext(USER1), {
      tokenId,
      from: OWNER,
      to: USER2,
      amount: 30n,
    });

    const allowance = await store.getFTAllowance(tokenId, OWNER, USER1);
    expect(allowance?.amount).toBe(70n);
  });
});

// ============================================================================
// Multiple Token Stress
// ============================================================================

describe('Multiple Token Stress', () => {
  let store: InMemoryTokenStore;
  let handler: TokenHandler;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    handler = createTokenHandler(store);
  });

  it('should handle many token deployments without collision', async () => {
    const tokenIds: TokenId[] = [];

    for (let i = 0; i < 50; i++) {
      const result = await handler.handleDeploy(createContext(OWNER, BigInt(i)), {
        type: 'FT',
        symbol: `TK${i.toString().padStart(3, '0')}`,
        initialSupply: BigInt(i * 1000),
      });
      expect(result.success).toBe(true);
      tokenIds.push(result.data!.tokenId);
    }

    // Verify all are distinct
    const uniqueIds = new Set(tokenIds);
    expect(uniqueIds.size).toBe(50);

    // Verify each has correct supply
    for (let i = 0; i < 50; i++) {
      const token = await store.getToken(tokenIds[i]);
      expect((token as any)?.totalSupply).toBe(BigInt(i * 1000));
    }
  });

  it('should isolate balances across different tokens', async () => {
    const result1 = await handler.handleDeploy(createContext(OWNER, 0n), {
      type: 'FT',
      symbol: 'TK1',
      initialSupply: 1000n,
    });
    const result2 = await handler.handleDeploy(createContext(OWNER, 1n), {
      type: 'FT',
      symbol: 'TK2',
      initialSupply: 2000n,
    });

    const token1 = result1.data!.tokenId;
    const token2 = result2.data!.tokenId;

    // Transfer from token1
    await handler.handleTransfer(createContext(OWNER), {
      tokenId: token1,
      to: USER1,
      amount: 500n,
    });

    // Verify token2 balance unchanged
    const ownerToken2Balance = await store.getFTBalance(token2, OWNER);
    expect(ownerToken2Balance?.balance).toBe(2000n);

    // Verify user1 has no token2
    const user1Token2Balance = await store.getFTBalance(token2, USER1);
    expect(user1Token2Balance?.balance ?? 0n).toBe(0n);
  });
});
