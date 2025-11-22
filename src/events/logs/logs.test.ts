/**
 * Event Logs Tests
 *
 * Tests for event types, validation, and store indexing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  EventLog,
  EventFilter,
  Hex32,
  EventKey,
  Topic,
  EventData,
  MAX_TOPICS,
  MAX_DATA_BYTES,
  MAX_EVENTS_PER_TX,
  validateEventLog,
  validateCallLocalArgs,
  validateCallResultArgs,
  topicFromString,
  topicFromAddress,
  topicFromNumber,
  matchesFilter,
  eventKeyFromString,
  EVENT_KEY_CALL_LOCAL_REQUEST,
  EVENT_KEY_CALL_LOCAL_RESULT,
} from './types';
import { InMemoryEventLogStore, createEventLogStore } from './store';

describe('Event Log Types', () => {
  describe('Event key generation', () => {
    it('should generate deterministic event keys', () => {
      const key1 = eventKeyFromString('TEST_EVENT');
      const key2 = eventKeyFromString('TEST_EVENT');
      expect(key1).toBe(key2);
      expect(key1.startsWith('0x')).toBe(true);
      expect(key1.length).toBe(66); // 0x + 64 hex chars
    });

    it('should generate different keys for different strings', () => {
      const key1 = eventKeyFromString('EVENT_A');
      const key2 = eventKeyFromString('EVENT_B');
      expect(key1).not.toBe(key2);
    });

    it('should have well-known event keys', () => {
      expect(EVENT_KEY_CALL_LOCAL_REQUEST.startsWith('0x')).toBe(true);
      expect(EVENT_KEY_CALL_LOCAL_RESULT.startsWith('0x')).toBe(true);
      expect(EVENT_KEY_CALL_LOCAL_REQUEST).not.toBe(EVENT_KEY_CALL_LOCAL_RESULT);
    });
  });

  describe('Topic generation', () => {
    it('should create topic from string', () => {
      const topic = topicFromString('test');
      expect(topic.startsWith('0x')).toBe(true);
      expect(topic.length).toBe(66);
    });

    it('should create topic from address', () => {
      const topic = topicFromAddress('gc1alice');
      expect(topic.startsWith('0x')).toBe(true);
    });

    it('should create topic from number', () => {
      const topic = topicFromNumber(12345n);
      expect(topic.startsWith('0x')).toBe(true);
      expect(topic.length).toBe(66);
    });

    it('should create deterministic topics', () => {
      const t1 = topicFromString('same');
      const t2 = topicFromString('same');
      expect(t1).toBe(t2);
    });
  });

  describe('Event validation', () => {
    it('should accept valid event', () => {
      const result = validateEventLog({
        key: '0x' + 'aa'.repeat(32) as EventKey,
        topics: ['0x' + 'bb'.repeat(32) as Topic],
        data: '0x1234' as EventData,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject too many topics', () => {
      const topics = Array(MAX_TOPICS + 1).fill('0x' + 'aa'.repeat(32));
      const result = validateEventLog({ topics });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EVENT_TOPIC_LIMIT');
    });

    it('should reject data too large', () => {
      const data = '0x' + 'aa'.repeat(MAX_DATA_BYTES + 1);
      const result = validateEventLog({ data: data as EventData });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EVENT_DATA_TOO_LARGE');
    });

    it('should accept exactly max topics', () => {
      const topics = Array(MAX_TOPICS).fill('0x' + 'aa'.repeat(32));
      const result = validateEventLog({ topics });
      expect(result.valid).toBe(true);
    });
  });

  describe('CallLocal validation', () => {
    it('should accept valid call local args', () => {
      const result = validateCallLocalArgs({
        programId: 'my.program/v1',
        callId: '0x' + 'aa'.repeat(32) as Hex32,
        payload: '0x1234' as EventData,
        maxResponseSize: 1024,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject missing programId', () => {
      const result = validateCallLocalArgs({
        programId: '',
        callId: '0x' + 'aa'.repeat(32) as Hex32,
        payload: '0x' as EventData,
        maxResponseSize: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('CALL_PROGRAM_MISSING');
    });

    it('should reject invalid callId', () => {
      const result = validateCallLocalArgs({
        programId: 'test',
        callId: 'invalid' as Hex32,
        payload: '0x' as EventData,
        maxResponseSize: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('CALL_ID_INVALID');
    });
  });

  describe('CallResult validation', () => {
    it('should accept valid call result args', () => {
      const result = validateCallResultArgs({
        callId: '0x' + 'aa'.repeat(32) as Hex32,
        programId: 'test',
        status: 'ok',
        responseHash: '0x' + 'bb'.repeat(32) as Hex32,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = validateCallResultArgs({
        callId: '0x' + 'aa'.repeat(32) as Hex32,
        programId: 'test',
        status: 'invalid' as any,
        responseHash: '0x' + 'bb'.repeat(32) as Hex32,
      });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('RESULT_STATUS_INVALID');
    });
  });

  describe('Filter matching', () => {
    const sampleLog: EventLog = {
      txId: '0x' + 'aa'.repeat(32) as Hex32,
      index: 0,
      blockHash: '0x' + 'bb'.repeat(32) as Hex32,
      blockHeight: 100n,
      module: 'SYS.EVENT',
      emitter: 'gc1alice',
      key: '0x' + 'cc'.repeat(32) as EventKey,
      topics: ['0x' + 'dd'.repeat(32) as Topic, '0x' + 'ee'.repeat(32) as Topic],
      data: '0x1234' as EventData,
      timestamp: Date.now(),
    };

    it('should match with empty filter', () => {
      expect(matchesFilter(sampleLog, {})).toBe(true);
    });

    it('should match by address', () => {
      expect(matchesFilter(sampleLog, { address: 'gc1alice' })).toBe(true);
      expect(matchesFilter(sampleLog, { address: 'gc1bob' })).toBe(false);
    });

    it('should match by event key', () => {
      expect(matchesFilter(sampleLog, { eventKey: sampleLog.key })).toBe(true);
      expect(matchesFilter(sampleLog, { eventKey: '0x' + 'ff'.repeat(32) as EventKey })).toBe(false);
    });

    it('should match by block range', () => {
      expect(matchesFilter(sampleLog, { fromBlock: 50n, toBlock: 150n })).toBe(true);
      expect(matchesFilter(sampleLog, { fromBlock: 101n })).toBe(false);
      expect(matchesFilter(sampleLog, { toBlock: 99n })).toBe(false);
    });

    it('should match by topics with wildcards', () => {
      expect(matchesFilter(sampleLog, { topics: [sampleLog.topics[0]] })).toBe(true);
      expect(matchesFilter(sampleLog, { topics: [null, sampleLog.topics[1]] })).toBe(true);
      expect(matchesFilter(sampleLog, { topics: ['0x' + 'ff'.repeat(32) as Topic] })).toBe(false);
    });

    it('should match by module', () => {
      expect(matchesFilter(sampleLog, { module: 'SYS.EVENT' })).toBe(true);
      expect(matchesFilter(sampleLog, { module: 'OTHER' })).toBe(false);
    });
  });
});

describe('Event Log Store', () => {
  let store: InMemoryEventLogStore;

  beforeEach(() => {
    store = new InMemoryEventLogStore();
  });

  const createEvent = (overrides: Partial<EventLog> = {}): EventLog => ({
    txId: '0x' + Math.random().toString(16).slice(2).padStart(64, '0') as Hex32,
    index: 0,
    blockHash: '0x' + 'bb'.repeat(32) as Hex32,
    blockHeight: 100n,
    module: 'SYS.EVENT',
    emitter: 'gc1alice',
    key: '0x' + 'cc'.repeat(32) as EventKey,
    topics: [],
    data: '0x' as EventData,
    timestamp: Date.now(),
    ...overrides,
  });

  describe('Adding events', () => {
    it('should add single event', () => {
      const event = createEvent();
      store.addEvents([event]);
      expect(store.getCount()).toBe(1);
    });

    it('should add multiple events for same tx', () => {
      const txId = '0x' + 'aa'.repeat(32) as Hex32;
      const events = [
        createEvent({ txId, index: 0 }),
        createEvent({ txId, index: 1 }),
        createEvent({ txId, index: 2 }),
      ];
      store.addEvents(events);
      expect(store.getByTx(txId).length).toBe(3);
    });

    it('should reject too many events per tx', () => {
      const txId = '0x' + 'aa'.repeat(32) as Hex32;
      const events = Array(MAX_EVENTS_PER_TX + 1).fill(null).map((_, i) =>
        createEvent({ txId, index: i })
      );
      expect(() => store.addEvents(events)).toThrow();
    });
  });

  describe('Querying events', () => {
    beforeEach(() => {
      // Add test events
      const events = [
        createEvent({ txId: '0x' + '01'.repeat(32) as Hex32, emitter: 'gc1alice', blockHeight: 100n }),
        createEvent({ txId: '0x' + '02'.repeat(32) as Hex32, emitter: 'gc1bob', blockHeight: 101n }),
        createEvent({ txId: '0x' + '03'.repeat(32) as Hex32, emitter: 'gc1alice', blockHeight: 102n }),
      ];
      events.forEach(e => store.addEvents([e]));
    });

    it('should get by tx', () => {
      const events = store.getByTx('0x' + '01'.repeat(32) as Hex32);
      expect(events.length).toBe(1);
    });

    it('should get by tx and index', () => {
      const event = store.getByTxAndIndex('0x' + '01'.repeat(32) as Hex32, 0);
      expect(event).toBeDefined();
    });

    it('should get by address', () => {
      const events = store.getByAddress('gc1alice');
      expect(events.length).toBe(2);
    });

    it('should get by block', () => {
      const events = store.getByBlock(100n);
      expect(events.length).toBe(1);
    });

    it('should query with filter', () => {
      const events = store.query({ address: 'gc1alice' });
      expect(events.length).toBe(2);
    });

    it('should respect query limit', () => {
      const events = store.query({ limit: 1 });
      expect(events.length).toBe(1);
    });
  });

  describe('Removing events (reorg)', () => {
    it('should remove events by block', () => {
      const events = [
        createEvent({ blockHeight: 100n }),
        createEvent({ blockHeight: 100n }),
        createEvent({ blockHeight: 101n }),
      ];
      events.forEach(e => store.addEvents([e]));

      const removed = store.removeByBlock(100n);
      expect(removed).toBe(2);
      expect(store.getCount()).toBe(1);
    });
  });

  describe('Stats', () => {
    it('should track stats', () => {
      store.addEvents([createEvent({ emitter: 'gc1alice' })]);
      store.addEvents([createEvent({ emitter: 'gc1bob' })]);

      const stats = store.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.uniqueTxs).toBe(2);
      expect(stats.uniqueAddresses).toBe(2);
    });
  });

  describe('Clear', () => {
    it('should clear all events', () => {
      store.addEvents([createEvent()]);
      store.addEvents([createEvent()]);
      store.clear();
      expect(store.getCount()).toBe(0);
    });
  });
});
