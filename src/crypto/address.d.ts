import crypto from 'crypto';
import { MappingAlgId, SigAlgId } from './algorithms';
export type RawAddress = {
    mappingAlg: MappingAlgId;
    sigAlg: SigAlgId;
    pkHash: Buffer;
    rawPayload: Buffer;
};
export declare function buildAddressPayload(pubDER: Buffer, mappingAlg: MappingAlgId, sigAlg: SigAlgId): Buffer;
export declare function deriveAddress(pubDER: Buffer, mappingAlg: MappingAlgId, sigAlg: SigAlgId): string;
export declare function decodeAddress(address: string): RawAddress;
export declare function publicKeyMatchesAddress(pub: crypto.KeyObject, address: string): boolean;
//# sourceMappingURL=address.d.ts.map