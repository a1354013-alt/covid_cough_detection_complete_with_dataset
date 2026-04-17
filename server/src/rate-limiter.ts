/**
 * Rate limiter with bounded memory usage.
 * Uses LRU-style eviction when max entries is reached.
 */

import { logger } from "./logger.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
  lastAccess: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const DEFAULT_MAX_ENTRIES = 10000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60_000;

export class RateLimiter {
  private map: Map<string, RateLimitEntry>;
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxEntries: number;
  private readonly cleanupIntervalMs: number;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(
    windowMs: number,
    maxRequests: number,
    options?: {
      maxEntries?: number;
      cleanupIntervalMs?: number;
    }
  ) {
    this.map = new Map();
    this.windowMs = windowMs;
    this.maxRequests = Math.max(1, maxRequests);
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.cleanupIntervalMs = options?.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.cleanupInterval = null;
  }

  start(): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    this.cleanupInterval.unref();
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = this.map.get(key);

    // Evict oldest entries if at capacity and key doesn't exist
    if (!entry && this.map.size >= this.maxEntries) {
      this.evictOldest();
    }

    if (!entry || entry.resetAt <= now) {
      const resetAt = now + this.windowMs;
      entry = { count: 1, resetAt, lastAccess: now };
      this.map.set(key, entry);
      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - 1),
        resetAt,
      };
    }

    entry.count += 1;
    entry.lastAccess = now;
    const remaining = Math.max(0, this.maxRequests - entry.count);
    
    return {
      allowed: entry.count <= this.maxRequests,
      remaining,
      resetAt: entry.resetAt,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.map.entries()) {
      if (entry.resetAt <= now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.map.delete(key);
    }

    // Evict oldest entries if still at capacity after cleanup
    // This provides defense-in-depth against memory exhaustion attacks
    while (this.map.size >= this.maxEntries) {
      this.evictOldest();
    }

    if (expiredKeys.length > 0 && process.env.NODE_ENV !== 'production') {
      logger.debug("RateLimiter cleaned expired entries", { count: expiredKeys.length });
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.map.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.map.delete(oldestKey);
      if (process.env.NODE_ENV !== 'production') {
        logger.debug("RateLimiter evicted oldest entry", { key: oldestKey });
      }
    }
  }

  getSize(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
