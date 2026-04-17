import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it("should block requests over limit", () => {
      for (let i = 0; i < 5; i++) {
        limiter.check("test-key");
      }
      
      const result = limiter.check("test-key");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should track different keys independently", () => {
      const result1 = limiter.check("key1");
      const result2 = limiter.check("key2");
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(limiter.getSize()).toBe(2);
    });
  });

  describe("memory bounds", () => {
    it("should evict oldest entries when at capacity", () => {
      const smallLimiter = new RateLimiter(60000, 5, { maxEntries: 3, cleanupIntervalMs: 1000 });
      
      smallLimiter.check("key1");
      smallLimiter.check("key2");
      smallLimiter.check("key3");
      
      expect(smallLimiter.getSize()).toBe(3);
      
      // This should trigger eviction
      smallLimiter.check("key4");
      
      expect(smallLimiter.getSize()).toBeLessThanOrEqual(3);
      smallLimiter.stop();
    });
  });

  describe("cleanup", () => {
    it("should remove expired entries", () => {
      vi.useFakeTimers();
      
      const shortLimiter = new RateLimiter(1000, 5, { maxEntries: 100, cleanupIntervalMs: 100 });
      shortLimiter.start();
      
      shortLimiter.check("temp-key");
      expect(shortLimiter.getSize()).toBe(1);
      
      vi.advanceTimersByTime(2000);
      shortLimiter["cleanup"]();
      
      expect(shortLimiter.getSize()).toBe(0);
      shortLimiter.stop();
      vi.useRealTimers();
    });
  });

  describe("lifecycle", () => {
    it("should start and stop cleanup interval", () => {
      const testLimiter = new RateLimiter(60000, 5);
      
      expect(testLimiter["cleanupInterval"]).toBeNull();
      
      testLimiter.start();
      expect(testLimiter["cleanupInterval"]).not.toBeNull();
      
      testLimiter.stop();
      expect(testLimiter["cleanupInterval"]).toBeNull();
    });

    it("should clear all entries", () => {
      limiter.check("key1");
      limiter.check("key2");
      expect(limiter.getSize()).toBe(2);
      
      limiter.clear();
      expect(limiter.getSize()).toBe(0);
    });
  });
});
