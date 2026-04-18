/**
 * Inference History Store
 * 
 * Lightweight in-memory store for tracking recent predictions.
 * Provides portfolio-worthy demonstration of:
 * - Request tracing (requestId)
 * - Performance monitoring (latency tracking)
 * - Audit trail capabilities
 * 
 * NOT intended for production persistence - use database for that.
 */

export interface InferenceRecord {
  requestId: string;
  timestamp: Date;
  filename: string;
  label: 'positive' | 'negative';
  confidence: number;
  processingTimeMs: number;
  clientIp?: string;
}

export interface InferenceStats {
  totalRequests: number;
  avgLatencyMs: number;
  positiveCount: number;
  negativeCount: number;
  lastRequestAt?: Date;
}

const MAX_HISTORY_SIZE = 100; // Keep last 100 requests for demo purposes

export class InferenceHistoryStore {
  private records: InferenceRecord[] = [];
  private totalLatency = 0;
  private positiveCount = 0;
  private negativeCount = 0;

  /**
   * Generate a unique request ID for tracing
   */
  static generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    return `req_${timestamp}_${randomPart}`;
  }

  /**
   * Record a new inference result
   */
  add(record: Omit<InferenceRecord, 'requestId'>): InferenceRecord {
    const requestId = InferenceHistoryStore.generateRequestId();
    const fullRecord: InferenceRecord = {
      ...record,
      requestId,
    };

    // Add to history
    this.records.unshift(fullRecord);
    
    // Trim to max size
    if (this.records.length > MAX_HISTORY_SIZE) {
      const removed = this.records.pop();
      if (removed) {
        // Adjust stats for removed record
        this.totalLatency -= removed.processingTimeMs;
        if (removed.label === 'positive') {
          this.positiveCount--;
        } else {
          this.negativeCount--;
        }
      }
    }

    // Update running stats
    this.totalLatency += record.processingTimeMs;
    if (record.label === 'positive') {
      this.positiveCount++;
    } else {
      this.negativeCount++;
    }

    return fullRecord;
  }

  /**
   * Get recent inference history
   */
  getRecent(limit = 10): InferenceRecord[] {
    return this.records.slice(0, limit);
  }

  /**
   * Get aggregate statistics
   */
  getStats(): InferenceStats {
    const count = this.records.length;
    return {
      totalRequests: count,
      avgLatencyMs: count > 0 ? Math.round(this.totalLatency / count) : 0,
      positiveCount: this.positiveCount,
      negativeCount: this.negativeCount,
      lastRequestAt: this.records[0]?.timestamp,
    };
  }

  /**
   * Clear all history (for testing)
   */
  clear(): void {
    this.records = [];
    this.totalLatency = 0;
    this.positiveCount = 0;
    this.negativeCount = 0;
  }
}

// Singleton instance for the application
export const inferenceHistory = new InferenceHistoryStore();
