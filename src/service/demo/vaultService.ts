import { SecureContext, ServiceResponse, successResponse, errorResponse } from '../connector/connector';
import { SYS_SELECTORS } from '../../instructions/opcodes';

/**
 * VaultService Demo
 * 
 * Showcases "Closed Box" execution where sensitive operations (like protected minting) 
 * are gated by SecureContext and only accessible upon verified Relay transactions.
 */
export class VaultService {
    private context: SecureContext;
    private deployedTokens = new Map<string, any>();

    constructor(authorizedCallers: string[]) {
        this.context = new SecureContext(authorizedCallers);
        // Store a sensitive "Treasury Key" in the closed box
        this.context.setSecret('treasury_key', 'WSTF_SECRET_TREASURY_KEY_2024');
    }

    /**
     * Handle incoming modular backend requests
     */
    async handleRequest(methodId: number, caller: string, data: any): Promise<ServiceResponse> {
        switch (methodId) {
            case SYS_SELECTORS.TOK_DEPLOY:
                return this.deployToken(caller, data);

            case SYS_SELECTORS.TOK_MINT_PROTECTED:
                return this.mintProtected(caller, data);

            default:
                return errorResponse(`Unsupported Method ID: ${methodId}`, 'METHOD_NOT_SUPPORTED');
        }
    }

    /**
     * Deploy a new token (Standard Action)
     */
    private async deployToken(caller: string, data: any): Promise<ServiceResponse> {
        const tokenId = `tok_${Math.random().toString(36).slice(2, 9)}`;
        this.deployedTokens.set(tokenId, {
            ...data,
            owner: caller,
            createdAt: Date.now()
        });
        console.log(`[VaultService] Token deployed: ${tokenId} by ${caller}`);
        return successResponse({ tokenId, status: 'deployed' });
    }

    /**
     * Protected Mint (Closed Box Action)
     * Only accessible if SecureContext authorizes the caller to access the Treasury Key.
     */
    private async mintProtected(caller: string, data: any): Promise<ServiceResponse> {
        try {
            // showcase the "Power": access a secret gated by caller identity
            const treasuryKey = this.context.getSecret(caller, 'treasury_key');

            console.log(`[VaultService] Protected mint authorized for ${caller} using key: ${treasuryKey.slice(0, 4)}***`);

            return successResponse({
                tokenId: data.tokenId,
                amount: data.amount,
                recipient: data.recipient,
                mintedBy: caller,
                auth: 'CLOSED_BOX_VERIFIED'
            });
        } catch (e: any) {
            console.error(`[VaultService] Protected mint failed: ${e.message}`);
            return errorResponse(e.message, 'UNAUTHORIZED_SECRET_ACCESS');
        }
    }
}
