/**
 * ULEB128 (Unsigned Little Endian Base 128) encoding/decoding
 * Used for variable-length encoding of instruction argument lengths
 */

export function encodeULEB128(value: number): Buffer {
  const bytes: number[] = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) {
      byte |= 0x80; // Set continuation bit
    }
    bytes.push(byte);
  } while (value !== 0);
  return Buffer.from(bytes);
}

export function decodeULEB128(buffer: Buffer, offset = 0): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  let byte: number;

  do {
    if (offset + bytesRead >= buffer.length) {
      throw new Error('ULEB128: buffer overflow');
    }
    byte = buffer[offset + bytesRead];
    value |= (byte & 0x7f) << shift;
    shift += 7;
    bytesRead++;
  } while (byte & 0x80);

  return { value, bytesRead };
}
