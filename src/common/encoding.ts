export function u64be(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(n);
  return b;
}

export function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

export function stringRef(s: string): Buffer {
  const b = Buffer.from(s, 'utf-8');
  return Buffer.concat([u32be(b.length), b]);
}
