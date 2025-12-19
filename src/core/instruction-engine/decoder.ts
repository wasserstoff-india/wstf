/**
 * Instruction Decoder/Encoder
 *
 * Handles binary encoding/decoding of instructions for WSTFChain.
 */

import { Instruction, InstructionDecoder } from '../types/instruction';
import { XChainOpcode } from '../../instructions/xchain/opcodes';

/**
 * Binary instruction format:
 *
 * [4 bytes] Magic number (0x57535446 = "WSTF")
 * [4 bytes] Version
 * [4 bytes] Opcode
 * [8 bytes] Timestamp
 * [8 bytes] Nonce (optional)
 * [32 bytes] Sender address hash
 * [4 bytes] Data length
 * [N bytes] Data (JSON encoded)
 * [64 bytes] Signature (optional)
 */

const MAGIC_NUMBER = 0x57535446; // "WSTF" in hex
const CURRENT_VERSION = 1;
const HEADER_SIZE = 4 + 4 + 4 + 8 + 8 + 32 + 4; // 64 bytes
const SIGNATURE_SIZE = 64;

export class WSTFInstructionDecoder implements InstructionDecoder {

  /**
   * Encode instruction to binary format
   */
  encode(instruction: Instruction): Uint8Array {
    const dataBytes = new TextEncoder().encode(JSON.stringify(instruction.data));
    const signatureBytes = instruction.signature
      ? new TextEncoder().encode(instruction.signature)
      : new Uint8Array(0);

    const totalSize = HEADER_SIZE + dataBytes.length + signatureBytes.length;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    let offset = 0;

    // Magic number
    view.setUint32(offset, MAGIC_NUMBER, false);
    offset += 4;

    // Version
    view.setUint32(offset, CURRENT_VERSION, false);
    offset += 4;

    // Opcode
    view.setUint32(offset, instruction.opcode, false);
    offset += 4;

    // Timestamp
    view.setBigUint64(offset, BigInt(instruction.timestamp), false);
    offset += 8;

    // Nonce
    view.setBigUint64(offset, instruction.nonce || 0n, false);
    offset += 8;

    // Sender address (hash to 32 bytes)
    const senderHash = this.hashAddress(instruction.sender);
    uint8View.set(senderHash, offset);
    offset += 32;

    // Data length
    view.setUint32(offset, dataBytes.length, false);
    offset += 4;

    // Data
    uint8View.set(dataBytes, offset);
    offset += dataBytes.length;

    // Signature (if present)
    if (signatureBytes.length > 0) {
      uint8View.set(signatureBytes, offset);
    }

    return uint8View;
  }

  /**
   * Decode instruction from binary format
   */
  decode(data: Uint8Array): Instruction {
    if (data.length < HEADER_SIZE) {
      throw new Error('Invalid instruction: too short');
    }

    const view = new DataView(data.buffer, data.byteOffset, data.length);
    let offset = 0;

    // Magic number
    const magic = view.getUint32(offset, false);
    offset += 4;
    if (magic !== MAGIC_NUMBER) {
      throw new Error(`Invalid magic number: 0x${magic.toString(16)}`);
    }

    // Version
    const version = view.getUint32(offset, false);
    offset += 4;
    if (version !== CURRENT_VERSION) {
      throw new Error(`Unsupported version: ${version}`);
    }

    // Opcode
    const opcode = view.getUint32(offset, false);
    offset += 4;

    // Timestamp
    const timestamp = Number(view.getBigUint64(offset, false));
    offset += 8;

    // Nonce
    const nonce = view.getBigUint64(offset, false);
    offset += 8;

    // Sender address (skip hash, we'll need to resolve this)
    // In practice, the sender would be resolved from signature verification
    offset += 32;

    // Data length
    const dataLength = view.getUint32(offset, false);
    offset += 4;

    if (offset + dataLength > data.length) {
      throw new Error('Invalid instruction: data length exceeds buffer');
    }

    // Data
    const dataBytes = data.slice(offset, offset + dataLength);
    const dataStr = new TextDecoder().decode(dataBytes);
    let instructionData;

    try {
      instructionData = JSON.parse(dataStr);
    } catch (error: unknown) {
      throw new Error(`Invalid instruction data: ${error instanceof Error ? error.message : String(error)}`);
    }

    offset += dataLength;

    // Signature (if present)
    let signature: string | undefined;
    if (offset < data.length) {
      const signatureBytes = data.slice(offset);
      signature = new TextDecoder().decode(signatureBytes);
    }

    return {
      opcode,
      data: instructionData,
      sender: '', // Would be resolved from signature
      timestamp,
      nonce: nonce === 0n ? undefined : nonce,
      signature
    };
  }

  /**
   * Get instruction size in bytes
   */
  getSize(instruction: Instruction): number {
    const dataBytes = new TextEncoder().encode(JSON.stringify(instruction.data));
    const signatureSize = instruction.signature ? new TextEncoder().encode(instruction.signature).length : 0;
    return HEADER_SIZE + dataBytes.length + signatureSize;
  }

  /**
   * Validate instruction format
   */
  validate(instruction: Instruction): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate opcode
    if (!Number.isInteger(instruction.opcode) || instruction.opcode < 0 || instruction.opcode > 0xFF) {
      errors.push('Invalid opcode: must be integer 0-255');
    }

    // Validate timestamp
    if (!Number.isInteger(instruction.timestamp) || instruction.timestamp <= 0) {
      errors.push('Invalid timestamp: must be positive integer');
    }

    // Validate sender
    if (!instruction.sender || typeof instruction.sender !== 'string') {
      errors.push('Invalid sender: must be non-empty string');
    }

    // Validate data
    if (instruction.data === undefined) {
      errors.push('Missing instruction data');
    }

    // Try to serialize data
    try {
      JSON.stringify(instruction.data);
    } catch (error: unknown) {
      errors.push(`Data not serializable: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create instruction from template
   */
  createInstruction(
    opcode: number,
    data: any,
    sender: string,
    options: {
      timestamp?: number;
      nonce?: bigint;
      signature?: string;
    } = {}
  ): Instruction {
    return {
      opcode,
      data,
      sender,
      timestamp: options.timestamp || Date.now(),
      nonce: options.nonce,
      signature: options.signature
    };
  }

  /**
   * Hash address to 32 bytes
   */
  private hashAddress(address: string): Uint8Array {
    // Simple hash for now - in production would use proper cryptographic hash
    const encoder = new TextEncoder();
    const addressBytes = encoder.encode(address);
    const hash = new Uint8Array(32);

    // Simple XOR-based hash
    for (let i = 0; i < addressBytes.length; i++) {
      hash[i % 32] ^= addressBytes[i];
    }

    return hash;
  }
}

/**
 * Instruction builder for creating common instruction types
 */
export class InstructionBuilder {
  private decoder = new WSTFInstructionDecoder();

  /**
   * Create generic instruction
   */
  createInstruction(
    opcode: number,
    data: any,
    sender: string,
    options: any = {}
  ): Instruction {
    return this.decoder.createInstruction(opcode, data, sender, options);
  }

  /**
   * Create bridge route registration instruction
   */
  createBridgeRouteRegistration(
    sender: string,
    routeData: any,
    signature?: string
  ): Instruction {
    return this.decoder.createInstruction(
      XChainOpcode.BRIDGE_REGISTER_ROUTE,
      { route: routeData, signature },
      sender,
      { signature }
    );
  }

  /**
   * Create bridge request instruction
   */
  createBridgeRequest(
    sender: string,
    requestData: any,
    signature?: string
  ): Instruction {
    return this.decoder.createInstruction(
      XChainOpcode.BRIDGE_REQUEST,
      { request: requestData, userSignature: signature },
      sender,
      { signature }
    );
  }

  /**
   * Create bridge result instruction
   */
  createBridgeResult(
    sender: string,
    resultData: any,
    signature?: string
  ): Instruction {
    return this.decoder.createInstruction(
      XChainOpcode.BRIDGE_RESULT,
      { result: resultData, providerSignature: signature },
      sender,
      { signature }
    );
  }

  /**
   * Batch create instructions
   */
  createBatch(instructions: Array<{
    opcode: number;
    data: any;
    sender: string;
    signature?: string;
  }>): Instruction[] {
    return instructions.map(instr =>
      this.decoder.createInstruction(
        instr.opcode,
        instr.data,
        instr.sender,
        { signature: instr.signature }
      )
    );
  }
}

/**
 * Global decoder instance
 */
export const instructionDecoder = new WSTFInstructionDecoder();

/**
 * Global builder instance
 */
export const instructionBuilder = new InstructionBuilder();