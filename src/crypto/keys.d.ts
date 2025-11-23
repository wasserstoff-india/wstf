import crypto from 'crypto';
import { SigAlgId } from './algorithms';
export type Keypair = {
    publicKey: crypto.KeyObject;
    privateKey: crypto.KeyObject;
    sigAlg: SigAlgId;
};
export declare function generateKeypair(sigAlg: SigAlgId): Keypair;
export declare function exportPubDER(pub: crypto.KeyObject): Buffer;
//# sourceMappingURL=keys.d.ts.map