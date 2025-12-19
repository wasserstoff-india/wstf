import crypto from 'crypto';
import { SigAlgId } from '../../crypto/algorithms';
import { verifyPreimage } from '../../crypto/sign';

/**
 * Verify a signature over arbitrary data.
 * Consistently with KeypairSigner.sign, this hashes the data with SHA-256 before verification.
 * 
 * @param data - The original data that was signed
 * @param signature - The signature (hex or base64)
 * @param publicKey - The public key (PEM or base64 DER)
 * @param sigAlg - The signature algorithm (default Ed25519)
 */
export function verifySignature(
    data: Uint8Array,
    signature: string,
    publicKey: string,
    sigAlg: SigAlgId = SigAlgId.ED25519
): boolean {
    try {
        const preimage = crypto.createHash('sha256').update(data).digest();

        // Handle hex or base64 signature
        let sigBuffer: Buffer;
        if (signature.length === 128 || signature.length === 130) {
            sigBuffer = Buffer.from(signature, 'hex');
        } else {
            sigBuffer = Buffer.from(signature, 'base64');
        }

        // Create public key object
        let pubObject: crypto.KeyObject;
        if (publicKey.includes('-----BEGIN PUBLIC KEY-----')) {
            pubObject = crypto.createPublicKey(publicKey);
        } else {
            // Assume base64 encoded DER
            pubObject = crypto.createPublicKey({
                key: Buffer.from(publicKey, 'base64'),
                format: 'der',
                type: 'spki'
            });
        }

        return verifyPreimage(sigAlg, pubObject, preimage, sigBuffer);
    } catch (error) {
        console.warn('Signature verification failed:', error);
        return false;
    }
}
