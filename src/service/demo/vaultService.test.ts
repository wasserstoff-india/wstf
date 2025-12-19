import { describe, it, expect } from 'vitest';
import { VaultService } from './vaultService';
import { SYS_SELECTORS } from '../../instructions/opcodes';

describe('VaultService & Token Relay Flow', () => {
    const AUTHORIZED_CALLER = 'gc1authorized_user';
    const UNAUTHORIZED_CALLER = 'gc1hacker';

    const vault = new VaultService([AUTHORIZED_CALLER]);

    it('should allow any caller to deploy a token', async () => {
        const data = { name: 'Demo Token', symbol: 'DEMO', supply: '1000000' };
        const result = await vault.handleRequest(SYS_SELECTORS.TOK_DEPLOY, AUTHORIZED_CALLER, data);

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('tokenId');
        const resData = (result as any).data;
        expect(resData.status).toBe('deployed');
    });

    it('should allow authorized caller to perform a protected mint', async () => {
        const data = { tokenId: 'tok_123', amount: '100', recipient: AUTHORIZED_CALLER };
        const result = await vault.handleRequest(SYS_SELECTORS.TOK_MINT_PROTECTED, AUTHORIZED_CALLER, data);

        expect(result.success).toBe(true);
        const resData = (result as any).data;
        expect(resData.auth).toBe('CLOSED_BOX_VERIFIED');
        expect(resData.tokenId).toBe('tok_123');
    });

    it('should block unauthorized caller from protected mint (Closed Box Protection)', async () => {
        const data = { tokenId: 'tok_123', amount: '100', recipient: UNAUTHORIZED_CALLER };
        const result = await vault.handleRequest(SYS_SELECTORS.TOK_MINT_PROTECTED, UNAUTHORIZED_CALLER, data);

        expect(result.success).toBe(false);
        expect(result.code).toBe('UNAUTHORIZED_SECRET_ACCESS');
        expect(result.error).toContain('is not authorized');
    });

    it('should return error for unsupported methods', async () => {
        const result = await vault.handleRequest(0x9999, AUTHORIZED_CALLER, {});
        expect(result.success).toBe(false);
        expect(result.code).toBe('METHOD_NOT_SUPPORTED');
    });
});
