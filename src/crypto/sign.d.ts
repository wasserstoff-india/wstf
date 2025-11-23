import crypto from 'crypto';
import { SigAlgId } from './algorithms';
export declare function signPreimage(sigAlg: SigAlgId, priv: crypto.KeyObject, preimage: Buffer): Buffer;
export declare function verifyPreimage(sigAlg: SigAlgId, pub: crypto.KeyObject, preimage: Buffer, sig: Buffer): boolean;
//# sourceMappingURL=sign.d.ts.map