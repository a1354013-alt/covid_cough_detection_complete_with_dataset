/**
 * SQLite Database Store for Inference History
 * 
 * Provides optional persistence for inference history, error logs, and prediction caching.
 *
 * Notes / constraints:
 * - Uses a single-process SQLite database via better-sqlite3 (one connection per process).
 * - better-sqlite3 is an optional dependency; when unavailable, the gateway can run without DB features.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InferenceRecord {
  id?: number;
  requestId: string;
  timestamp: string; // ISO 8601 format for SQLite compatibility
  filename: string;
  label: 'positive' | 'negative';
  confidence: number;
  processingTimeMs: number;
  clientIp?: string;
  audioHash?: string; // For caching deduplication
}

export interface InferenceStats {
  totalRequests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  positiveCount: number;
  negativeCount: number;
  cacheHits: number;
  cacheMisses: number;
  errorRate: number;
  lastRequestAt?: string;
  requestsLast24h: number;
  positivityRateLast24h: number;
}

export interface DailyStats {
  date: string;
  totalRequests: number;
  positiveCount: number;
  negativeCount: number;
  avgLatencyMs: number;
}

type BetterSqlite3Database = {
  pragma: (sql: string) => unknown;
  exec: (sql: string) => unknown;
  prepare: (sql: string) => any;
  close: () => void;
};

type BetterSqlite3DatabaseCtor = new (filename: string) => BetterSqlite3Database;

const require = createRequire(import.meta.url);

function loadBetterSqlite3Ctor(): BetterSqlite3DatabaseCtor {
  const mod = require('better-sqlite3') as unknown as { default?: unknown };
  const ctor = (mod as { default?: unknown }).default ?? mod;
  if (typeof ctor !== 'function') {
    throw new Error('better-sqlite3 is not available (missing native binding or incorrect export)');
  }
  return ctor as BetterSqlite3DatabaseCtor;
}

interface DatabaseConfig {
  dbPath?: string;
  maxConnections?: number;
  enableWalMode?: boolean;
}

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/inferences.db');

export class InferenceDatabase {
  private db: BetterSqlite3Database | null = null;
  private dbPath: string;
  private isInitialized = false;
  private cacheHits = 0;
  private cacheMisses = 0;
  private errorCount = 0;
  private totalCount = 0;

  constructor(config: DatabaseConfig = {}) {
    this.dbPath = config.dbPath || process.env.DATABASE_PATH || DEFAULT_DB_PATH;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Database already initialized');
      return;
    }

    try {
      // Ensure data directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
        logger.info('Created database directory', { path: dbDir });
      }

      // Dynamic import to avoid startup failures when better-sqlite3 is not installed.
      // Note: better-sqlite3 is CommonJS; ESM import exposes it via `default`.
      const DatabaseCtor = loadBetterSqlite3Ctor();
      this.db = new DatabaseCtor(this.dbPath);

      // Enable WAL mode for better concurrent performance
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
      this.db.pragma('foreign_keys = ON');

      // Create tables
      this.createTables();
      
      this.isInitialized = true;
      logger.info('Database initialized successfully', { path: this.dbPath });
    } catch (error) {
      logger.error('Failed to initialize database', error instanceof Error ? error : new Error(String(error)));
      logger.warn('Falling back to in-memory store');
      this.db = null;
    }
  }

  /**
   * Create database tables with proper schema
   */
  private createTables(): void {
    if (!this.db) return;

    // Main inference history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inference_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT UNIQUE NOT NULL,
        timestamp TEXT NOT NULL,
        filename TEXT NOT NULL,
        label TEXT NOT NULL CHECK(label IN ('positive', 'negative')),
        confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
        processing_time_ms INTEGER NOT NULL CHECK(processing_time_ms >= 0),
        client_ip TEXT,
        audio_hash TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Index for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON inference_history(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_label ON inference_history(label);
      CREATE INDEX IF NOT EXISTS idx_audio_hash ON inference_history(audio_hash);
      CREATE INDEX IF NOT EXISTS idx_date ON inference_history(date(timestamp));
    `);

    // Cache table for storing prediction results
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prediction_cache (
        audio_hash TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        confidence REAL NOT NULL,
        processing_time_ms INTEGER NOT NULL,
        model_version TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON prediction_cache(expires_at);
    `);

    // Error tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        endpoint TEXT,
        client_ip TEXT,
        stack_trace TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_error_timestamp ON error_logs(timestamp DESC);
    `);

    logger.info('Database tables created successfully');
  }

  /**
   * Record a new inference result
   */
  add(record: Omit<InferenceRecord, 'id'>): InferenceRecord {
    this.totalCount++;
    
    if (!this.db) {
      // Fallback to returning record without persistence
      return { ...record } as InferenceRecord;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO inference_history 
        (request_id, timestamp, filename, label, confidence, processing_time_ms, client_ip, audio_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        record.requestId,
        record.timestamp,
        record.filename,
        record.label,
        record.confidence,
        record.processingTimeMs,
        record.clientIp || null,
        record.audioHash || null
      );

      return {
        ...record,
        id: result.lastInsertRowid as number,
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Failed to insert inference record', error instanceof Error ? error : new Error(String(error)));
      return { ...record } as InferenceRecord;
    }
  }

  /**
   * Get recent inference history with pagination
   */
  getRecent(limit = 10, offset = 0): InferenceRecord[] {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT id, request_id, timestamp, filename, label, confidence, 
               processing_time_ms, client_ip, audio_hash
        FROM inference_history
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(limit, offset) as Array<Record<string, unknown>>;
      
      return rows.map((row) => ({
        id: row.id as number,
        requestId: row.request_id as string,
        timestamp: row.timestamp as string,
        filename: row.filename as string,
        label: row.label as 'positive' | 'negative',
        confidence: row.confidence as number,
        processingTimeMs: row.processing_time_ms as number,
        clientIp: row.client_ip as string | undefined,
        audioHash: row.audio_hash as string | undefined,
      }));
    } catch (error) {
      logger.error('Failed to query recent inferences', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Get aggregate statistics with advanced metrics
   */
  getStats(): InferenceStats {
    if (!this.db) {
      return this.getEmptyStats();
    }

    try {
      // Basic counts
      const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM inference_history').get() as { count: number };
      const positiveRow = this.db.prepare("SELECT COUNT(*) as count FROM inference_history WHERE label = 'positive'").get() as { count: number };
      const negativeRow = this.db.prepare("SELECT COUNT(*) as count FROM inference_history WHERE label = 'negative'").get() as { count: number };

      // Latency percentiles
      const latencyRows = this.db.prepare(`
        SELECT processing_time_ms 
        FROM inference_history 
        ORDER BY processing_time_ms
      `).all() as Array<{ processing_time_ms: number }>;

      let avgLatencyMs = 0;
      let p95LatencyMs = 0;
      let p99LatencyMs = 0;

      if (latencyRows.length > 0) {
        const latencies = latencyRows.map(r => r.processing_time_ms);
        avgLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)] || 0;
        p99LatencyMs = latencies[Math.floor(latencies.length * 0.99)] || 0;
      }

      // Last 24 hours stats
      const last24hRow = this.db.prepare(`
        SELECT COUNT(*) as count, 
               SUM(CASE WHEN label = 'positive' THEN 1 ELSE 0 END) as positive_count
        FROM inference_history
        WHERE timestamp >= datetime('now', '-24 hours')
      `).get() as { count: number; positive_count: number };

      // Last request timestamp
      const lastRow = this.db.prepare(`
        SELECT timestamp FROM inference_history ORDER BY timestamp DESC LIMIT 1
      `).get() as { timestamp: string } | undefined;

      const total = totalRow.count || 0;

      return {
        totalRequests: total,
        avgLatencyMs,
        p95LatencyMs,
        p99LatencyMs,
        positiveCount: positiveRow.count || 0,
        negativeCount: negativeRow.count || 0,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        errorRate: total > 0 ? Math.round((this.errorCount / total) * 10000) / 100 : 0,
        lastRequestAt: lastRow?.timestamp,
        requestsLast24h: last24hRow.count || 0,
        positivityRateLast24h: last24hRow.count > 0 
          ? Math.round((last24hRow.positive_count / last24hRow.count) * 100) 
          : 0,
      };
    } catch (error) {
      logger.error('Failed to get stats', error instanceof Error ? error : new Error(String(error)));
      return this.getEmptyStats();
    }
  }

  private getEmptyStats(): InferenceStats {
    return {
      totalRequests: this.totalCount,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      positiveCount: 0,
      negativeCount: 0,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      errorRate: this.totalCount > 0 ? Math.round((this.errorCount / this.totalCount) * 10000) / 100 : 0,
      requestsLast24h: 0,
      positivityRateLast24h: 0,
    };
  }

  /**
   * Get daily statistics for charts
   */
  getDailyStats(days = 7): DailyStats[] {
    if (!this.db) {
      return [];
    }

    try {
      const rows = this.db.prepare(`
        SELECT 
          date(timestamp) as date,
          COUNT(*) as total_requests,
          SUM(CASE WHEN label = 'positive' THEN 1 ELSE 0 END) as positive_count,
          SUM(CASE WHEN label = 'negative' THEN 1 ELSE 0 END) as negative_count,
          ROUND(AVG(processing_time_ms)) as avg_latency_ms
        FROM inference_history
        WHERE timestamp >= date('now', ? || ' days')
        GROUP BY date(timestamp)
        ORDER BY date DESC
      `).all(-days) as Array<Record<string, unknown>>;

      return rows.map((row) => ({
        date: row.date as string,
        totalRequests: row.total_requests as number,
        positiveCount: row.positive_count as number,
        negativeCount: row.negative_count as number,
        avgLatencyMs: row.avg_latency_ms as number,
      }));
    } catch (error) {
      logger.error('Failed to get daily stats', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Cache operations for prediction results
   */
  getCachedPrediction(audioHash: string): {
    label: 'positive' | 'negative';
    confidence: number;
    modelProcessingTimeMs: number;
    modelVersion: string;
  } | null {
    if (!this.db) {
      return null;
    }

    try {
      const row = this.db.prepare(`
        SELECT label, confidence, processing_time_ms, model_version
        FROM prediction_cache
        WHERE audio_hash = ? AND expires_at > datetime('now')
      `).get(audioHash) as Record<string, unknown> | undefined;

      if (row) {
        this.cacheHits++;
        return {
          label: row.label as 'positive' | 'negative',
          confidence: row.confidence as number,
          modelProcessingTimeMs: row.processing_time_ms as number,
          modelVersion: row.model_version as string,
        };
      }

      this.cacheMisses++;
      return null;
    } catch (error) {
      logger.error('Cache lookup failed', error instanceof Error ? error : new Error(String(error)));
      this.cacheMisses++;
      return null;
    }
  }

  setCachedPrediction(
    audioHash: string,
    prediction: {
      label: 'positive' | 'negative';
      confidence: number;
      modelProcessingTimeMs: number;
      modelVersion: string;
    },
    ttlSeconds = 3600 // Default 1 hour
  ): void {
    if (!this.db) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO prediction_cache 
        (audio_hash, label, confidence, processing_time_ms, model_version, expires_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))
      `);

      stmt.run(
        audioHash,
        prediction.label,
        prediction.confidence,
        prediction.modelProcessingTimeMs,
        prediction.modelVersion,
        ttlSeconds.toString()
      );
    } catch (error) {
      logger.error('Cache write failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpiredCache(): number {
    if (!this.db) {
      return 0;
    }

    try {
      const stmt = this.db.prepare(`
        DELETE FROM prediction_cache WHERE expires_at <= datetime('now')
      `);
      const result = stmt.run();
      return result.changes;
    } catch (error) {
      logger.error('Cache cleanup failed', error instanceof Error ? error : new Error(String(error)));
      return 0;
    }
  }

  /**
   * Log an error for monitoring
   */
  logError(errorType: string, errorMessage: string, context?: {
    endpoint?: string;
    clientIp?: string;
    stackTrace?: string;
  }): void {
    if (!this.db) {
      logger.error(`[${errorType}] ${errorMessage}`);
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO error_logs (timestamp, error_type, error_message, endpoint, client_ip, stack_trace)
        VALUES (datetime('now'), ?, ?, ?, ?, ?)
      `);

      stmt.run(
        errorType,
        errorMessage,
        context?.endpoint || null,
        context?.clientIp || null,
        context?.stackTrace || null
      );
    } catch (error) {
      logger.error('Failed to log error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get recent errors for debugging
   */
  getRecentErrors(limit = 20): Array<{
    id: number;
    timestamp: string;
    errorType: string;
    errorMessage: string;
    endpoint?: string;
    clientIp?: string;
  }> {
    if (!this.db) {
      return [];
    }

    try {
      const rows = this.db.prepare(`
        SELECT id, timestamp, error_type, error_message, endpoint, client_ip
        FROM error_logs
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit) as Array<Record<string, unknown>>;

      return rows.map((row) => ({
        id: row.id as number,
        timestamp: row.timestamp as string,
        errorType: row.error_type as string,
        errorMessage: row.error_message as string,
        endpoint: row.endpoint as string | undefined,
        clientIp: row.client_ip as string | undefined,
      }));
    } catch (error) {
      logger.error('Failed to query errors', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Close database connection gracefully
   */
  async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Failed to close database', error instanceof Error ? error : new Error(String(error)));
      }
      this.db = null;
      this.isInitialized = false;
    }
  }

  /**
   * Check if database is available
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? Math.round((this.cacheHits / total) * 10000) / 100 : 0,
    };
  }
}

// Singleton instance
export const inferenceDatabase = new InferenceDatabase();
