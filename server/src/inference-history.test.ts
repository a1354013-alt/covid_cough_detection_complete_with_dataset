/**
 * Inference History Store Tests
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { InferenceHistoryStore, inferenceHistory } from './inference-history.js';

describe('InferenceHistoryStore', () => {
  let store: InferenceHistoryStore;

  before(() => {
    store = new InferenceHistoryStore();
  });

  after(() => {
    store.clear();
  });

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = InferenceHistoryStore.generateRequestId();
      const id2 = InferenceHistoryStore.generateRequestId();
      
      assert.ok(id1.startsWith('req_'));
      assert.ok(id2.startsWith('req_'));
      assert.notStrictEqual(id1, id2);
    });

    it('should generate IDs with timestamp component', () => {
      const id = InferenceHistoryStore.generateRequestId();
      const parts = id.split('_');
      
      assert.strictEqual(parts.length, 3);
      assert.strictEqual(parts[0], 'req');
    });
  });

  describe('add', () => {
    it('should add a record and return it with requestId', () => {
      const record = store.add({
        timestamp: new Date(),
        filename: 'test.wav',
        label: 'positive',
        confidence: 0.85,
        processingTimeMs: 150,
      });

      assert.ok(record.requestId);
      assert.strictEqual(record.filename, 'test.wav');
      assert.strictEqual(record.label, 'positive');
      assert.strictEqual(record.confidence, 0.85);
      assert.strictEqual(record.processingTimeMs, 150);
    });

    it('should track statistics correctly', () => {
      store.clear();
      
      store.add({
        timestamp: new Date(),
        filename: 'test1.wav',
        label: 'positive',
        confidence: 0.9,
        processingTimeMs: 100,
      });

      store.add({
        timestamp: new Date(),
        filename: 'test2.wav',
        label: 'negative',
        confidence: 0.7,
        processingTimeMs: 200,
      });

      const stats = store.getStats();
      
      assert.strictEqual(stats.totalRequests, 2);
      assert.strictEqual(stats.positiveCount, 1);
      assert.strictEqual(stats.negativeCount, 1);
      assert.strictEqual(stats.avgLatencyMs, 150); // (100 + 200) / 2
    });
  });

  describe('getRecent', () => {
    it('should return records in reverse chronological order', () => {
      store.clear();
      
      const record1 = store.add({
        timestamp: new Date(Date.now() - 1000),
        filename: 'older.wav',
        label: 'positive',
        confidence: 0.8,
        processingTimeMs: 100,
      });

      const record2 = store.add({
        timestamp: new Date(),
        filename: 'newer.wav',
        label: 'negative',
        confidence: 0.6,
        processingTimeMs: 150,
      });

      const recent = store.getRecent(10);
      
      assert.strictEqual(recent.length, 2);
      assert.strictEqual(recent[0].requestId, record2.requestId); // Newest first
      assert.strictEqual(recent[1].requestId, record1.requestId);
    });

    it('should respect limit parameter', () => {
      store.clear();
      
      for (let i = 0; i < 20; i++) {
        store.add({
          timestamp: new Date(),
          filename: `test${i}.wav`,
          label: i % 2 === 0 ? 'positive' : 'negative',
          confidence: 0.5,
          processingTimeMs: 100,
        });
      }

      const recent5 = store.getRecent(5);
      assert.strictEqual(recent5.length, 5);

      const recent10 = store.getRecent(10);
      assert.strictEqual(recent10.length, 10);
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty store', () => {
      store.clear();
      
      const stats = store.getStats();
      
      assert.strictEqual(stats.totalRequests, 0);
      assert.strictEqual(stats.avgLatencyMs, 0);
      assert.strictEqual(stats.positiveCount, 0);
      assert.strictEqual(stats.negativeCount, 0);
      assert.strictEqual(stats.lastRequestAt, undefined);
    });

    it('should calculate average latency correctly', () => {
      store.clear();
      
      store.add({
        timestamp: new Date(),
        filename: 'test1.wav',
        label: 'positive',
        confidence: 0.8,
        processingTimeMs: 100,
      });

      store.add({
        timestamp: new Date(),
        filename: 'test2.wav',
        label: 'positive',
        confidence: 0.9,
        processingTimeMs: 200,
      });

      store.add({
        timestamp: new Date(),
        filename: 'test3.wav',
        label: 'positive',
        confidence: 0.7,
        processingTimeMs: 300,
      });

      const stats = store.getStats();
      
      assert.strictEqual(stats.totalRequests, 3);
      assert.strictEqual(stats.avgLatencyMs, 200); // (100 + 200 + 300) / 3
    });
  });

  describe('max history size', () => {
    it('should trim to MAX_HISTORY_SIZE and update stats', () => {
      store.clear();
      
      // Add 150 records (more than MAX_HISTORY_SIZE of 100)
      for (let i = 0; i < 150; i++) {
        store.add({
          timestamp: new Date(),
          filename: `test${i}.wav`,
          label: i % 2 === 0 ? 'positive' : 'negative',
          confidence: 0.5,
          processingTimeMs: 100,
        });
      }

      const stats = store.getStats();
      
      // Should have exactly MAX_HISTORY_SIZE records
      assert.strictEqual(stats.totalRequests, 100);
      
      // Stats should only reflect the kept records
      // 50 positive and 50 negative in the last 100 (indices 50-149)
      assert.strictEqual(stats.positiveCount, 50);
      assert.strictEqual(stats.negativeCount, 50);
    });
  });

  describe('clear', () => {
    it('should reset all state', () => {
      store.add({
        timestamp: new Date(),
        filename: 'test.wav',
        label: 'positive',
        confidence: 0.8,
        processingTimeMs: 100,
      });

      store.clear();
      
      const stats = store.getStats();
      assert.strictEqual(stats.totalRequests, 0);
      assert.strictEqual(store.getRecent().length, 0);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      assert.ok(inferenceHistory instanceof InferenceHistoryStore);
    });
  });
});
