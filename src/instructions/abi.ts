import cbor from 'cbor';
import crypto from 'crypto';
import { encodeULEB128, decodeULEB128 } from './varint';

/**
 * Instruction Record (IR) structure
 * Binary format for a single instruction
 */
export interface InstructionRecord {
  ver: number;                    // u8 = 0x01
  flags: number;                  // u8 (bit flags)
  creatorPkHash20: Buffer;        // 20 bytes
  moduleId16: Buffer;             // 16 bytes
  selector4: number;              // 4 bytes (u32)
  args: any;                      // Arbitrary data (encoded as CBOR)
}

/**
 * Encode a single Instruction Record to binary
 */
export function encodeIR(ir: InstructionRecord): Buffer {
  // Encode args as canonical CBOR
  const argsCBOR = cbor.encode(ir.args);
  const argsLen = encodeULEB128(argsCBOR.length);

  const buffers: Buffer[] = [
    Buffer.from([ir.ver]),                    // 1 byte: version
    Buffer.from([ir.flags]),                  // 1 byte: flags
    ir.creatorPkHash20,                       // 20 bytes: creator pk hash
    ir.moduleId16,                            // 16 bytes: module ID
    Buffer.alloc(4),                          // 4 bytes: selector (will write below)
    argsLen,                                  // ULEB128: args length
    argsCBOR,                                 // variable: args CBOR
  ];

  // Write selector as big-endian u32
  buffers[4].writeUInt32BE(ir.selector4, 0);

  return Buffer.concat(buffers);
}

/**
 * Decode a single Instruction Record from binary
 */
export function decodeIR(buffer: Buffer, offset = 0): { ir: InstructionRecord; bytesRead: number } {
  let pos = offset;

  // Read fixed fields
  const ver = buffer[pos++];
  const flags = buffer[pos++];
  const creatorPkHash20 = buffer.slice(pos, pos + 20);
  pos += 20;
  const moduleId16 = buffer.slice(pos, pos + 16);
  pos += 16;
  const selector4 = buffer.readUInt32BE(pos);
  pos += 4;

  // Read args length (ULEB128)
  const { value: argsLen, bytesRead: lenBytes } = decodeULEB128(buffer, pos);
  pos += lenBytes;

  // Read args CBOR
  const argsCBOR = buffer.slice(pos, pos + argsLen);
  pos += argsLen;
  const args = cbor.decode(argsCBOR);

  const ir: InstructionRecord = {
    ver,
    flags,
    creatorPkHash20,
    moduleId16,
    selector4,
    args,
  };

  return { ir, bytesRead: pos - offset };
}

/**
 * Encode a program (list of IRs) to binary
 */
export function encodeProgram(irs: InstructionRecord[]): Buffer {
  const encoded = irs.map(encodeIR);
  return Buffer.concat(encoded);
}

/**
 * Decode a program (binary) to list of IRs
 */
export function decodeProgram(programBytes: Buffer): InstructionRecord[] {
  const irs: InstructionRecord[] = [];
  let offset = 0;

  while (offset < programBytes.length) {
    const { ir, bytesRead } = decodeIR(programBytes, offset);
    irs.push(ir);
    offset += bytesRead;
  }

  return irs;
}

/**
 * Compute instructions hash from program bytes
 * instructionsHash = SHA256(programBytes)
 */
export function computeInstructionsHash(programBytes: Buffer): Buffer {
  return crypto.createHash('sha256').update(programBytes).digest();
}
