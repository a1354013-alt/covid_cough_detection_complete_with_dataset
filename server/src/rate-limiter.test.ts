import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(60000, 5, { maxEntries: 100, cleanupIntervalMs: 1000 });
  });

  afterEach(() => {
    limiter.stop();
  });

  describe("check", () => {
    it("should allow requests under limit", () => {
      for (let i = 0; i < 5; i++) {
        const result = limiter.check("test-key");
        assert.equal(result.allowed, true);
        assert.equal(result.remaining, 4 - i);
      }
    });

    it("should block requests over limit", () => {
      for (let i = 0; i < 5; i++) {
        limiter.check("test-key");
      }
      
      const result = limiter.check("test-key");
      assert.equal(result.allowed, false);
      assert.equal(result.remaining, 0);
    });

    it("should track different keys independently", () => {
      const result1 = limiter.check("key1");
      const result2 = limiter.check("key2");
      
      assert.equal(result1.allowed, true);
      assert.equal(result2.allowed, true);
      assert.equal(limiter.getSize(), 2);
    });
  });

  describe("memory bounds", () => {
    it("should evict oldest entries when at capacity", () => {
      const smallLimiter = new RateLimiter(60000, 5, { maxEntries: 3, cleanupIntervalMs: 1000 });
      
      smallLimiter.check("key1");
      smallLimiter.check("key2");
      smallLimiter.check("key3");
      
      assert.equal(smallLimiter.getSize(), 3);
      
      // This should trigger eviction
      smallLimiter.check("key4");
      
      assert.ok(smallLimiter.getSize() <= 3);
      smallLimiter.stop();
    });
  });

  describe("cleanup", () => {
    it("should remove expired entries", () => {
      const shortLimiter = new RateLimiter(1000, 5, { maxEntries: 100, cleanupIntervalMs: 100 });
      
      shortLimiter.check("temp-key");
      assert.equal(shortLimiter.getSize(), 1);

      const internal = shortLimiter as unknown as {
        cleanup: () => void;
        map: Map<string, { resetAt: number }>;
      };
      const entry = internal.map.get("temp-key");
      assert.ok(entry);
      entry.resetAt = Date.now() - 1;
      internal.cleanup();

      assert.equal(shortLimiter.getSize(), 0);
      shortLimiter.stop();
    });
  });

  describe("lifecycle", () => {
    it("should start and stop cleanup interval", () => {
      const testLimiter = new RateLimiter(60000, 5);
      
      const internal = testLimiter as unknown as { cleanupInterval: NodeJS.Timeout | null };
      assert.equal(internal.cleanupInterval, null);
      
      testLimiter.start();
      assert.notEqual(internal.cleanupInterval, null);
      
      testLimiter.stop();
      assert.equal(internal.cleanupInterval, null);
    });

    it("should clear all entries", () => {
      limiter.check("key1");
      limiter.check("key2");
      assert.equal(limiter.getSize(), 2);
      
      limiter.clear();
      assert.equal(limiter.getSize(), 0);
    });
  });
});
