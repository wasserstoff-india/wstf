/**
 * Memory Store Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from './memory';

describe('MemoryStore', () => {
  let store: MemoryStore<Buffer>;

  beforeEach(() => {
    store = new MemoryStore<Buffer>();
  });

  it('should put and get values', async () => {
    await store.put('key1', Buffer.from('value1'));
    const val = await store.get('key1');
    expect(val?.toString()).toBe('value1');
  });

  it('should return undefined for missing keys', async () => {
    const val = await store.get('nonexistent');
    expect(val).toBeUndefined();
  });

  it('should check key existence with has', async () => {
    await store.put('key1', Buffer.from('value1'));
    expect(await store.has('key1')).toBe(true);
    expect(await store.has('key2')).toBe(false);
  });

  it('should delete keys', async () => {
    await store.put('key1', Buffer.from('value1'));
    await store.delete('key1');
    expect(await store.has('key1')).toBe(false);
  });

  it('should iterate over all entries', async () => {
    await store.put('a', Buffer.from('1'));
    await store.put('b', Buffer.from('2'));
    await store.put('c', Buffer.from('3'));

    const entries: [string, Buffer][] = [];
    for await (const entry of store.iterate()) {
      entries.push(entry);
    }
    expect(entries.length).toBe(3);
  });

  it('should iterate with prefix filter', async () => {
    await store.put('user:1', Buffer.from('alice'));
    await store.put('user:2', Buffer.from('bob'));
    await store.put('item:1', Buffer.from('apple'));

    const entries: [string, Buffer][] = [];
    for await (const entry of store.iterate('user:')) {
      entries.push(entry);
    }
    expect(entries.length).toBe(2);
  });

  it('should multiGet multiple keys', async () => {
    await store.put('a', Buffer.from('1'));
    await store.put('b', Buffer.from('2'));

    const results = await store.multiGet(['a', 'b', 'c']);
    expect(results.size).toBe(2);
    expect(results.get('a')?.toString()).toBe('1');
    expect(results.get('c')).toBeUndefined();
  });

  it('should multiPut multiple entries', async () => {
    await store.multiPut([
      ['a', Buffer.from('1')],
      ['b', Buffer.from('2')],
    ]);
    expect(await store.has('a')).toBe(true);
    expect(await store.has('b')).toBe(true);
  });

  it('should execute batch operations atomically', async () => {
    await store.batch([
      { type: 'put', key: 'a', value: Buffer.from('1') },
      { type: 'put', key: 'b', value: Buffer.from('2') },
      { type: 'delete', key: 'a' },
    ]);
    expect(await store.has('a')).toBe(false);
    expect(await store.has('b')).toBe(true);
  });

  it('should create isolated snapshots', async () => {
    await store.put('key', Buffer.from('original'));
    const snapshot = store.createSnapshot();

    await store.put('key', Buffer.from('modified'));

    const snapshotVal = await snapshot.get('key');
    const currentVal = await store.get('key');

    expect(snapshotVal?.toString()).toBe('original');
    expect(currentVal?.toString()).toBe('modified');

    snapshot.release();
  });

  it('should track stats', async () => {
    await store.put('a', Buffer.from('1'));
    await store.get('a');
    await store.delete('a');

    const stats = store.getStats();
    expect(stats.writeOps).toBeGreaterThan(0);
    expect(stats.readOps).toBeGreaterThan(0);
    expect(stats.deleteOps).toBeGreaterThan(0);
  });
});
