import type { Request, Response } from "express";
import type { Express } from "express";
import type { InferenceStats as DbInferenceStats } from "../inference-database.js";
import { API_VERSION } from "../config/version.js";

type StatsBase = {
  totalRequests: number;
  avgLatencyMs: number;
  positiveCount: number;
  negativeCount: number;
};

type DatabaseStore = {
  getStats: () => StatsBase & Partial<DbInferenceStats>;
  getCacheStats: () => { hits: number; misses: number; hitRate: number };
  isReady: () => boolean;
};

type MemoryStore = {
  getStats: () => StatsBase;
};

export function registerStatusRoutes(
  app: Express,
  deps: {
    databaseReady: boolean;
    enableDatabaseFlag: boolean;
    inferenceDatabase: DatabaseStore;
    inferenceHistory: MemoryStore;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    getApiKeyStats: () => unknown;
    isDev: boolean;
    pythonApiUrl: string;
    checkPythonReadiness: () => Promise<{ isReady: boolean } & Record<string, unknown>>;
    buildReadinessBody: (readiness: Record<string, unknown>) => unknown;
  }
): void {
  app.get("/api/healthz", (_req: Request, res: Response) => {
    const stats = deps.databaseReady ? deps.inferenceDatabase.getStats() : deps.inferenceHistory.getStats();

    res.json({
      status: "alive",
      timestamp: new Date().toISOString(),
      service: "covid-cough-detection-api",
      version: API_VERSION,
      metrics: {
        totalRequests: stats.totalRequests,
        avgLatencyMs: stats.avgLatencyMs,
        positiveCount: stats.positiveCount,
        negativeCount: stats.negativeCount,
        p95LatencyMs: (stats as DbInferenceStats).p95LatencyMs || 0,
        p99LatencyMs: (stats as DbInferenceStats).p99LatencyMs || 0,
        errorRate: (stats as DbInferenceStats).errorRate || 0,
      },
      database: {
        enabled: deps.enableDatabaseFlag,
        ready: deps.databaseReady,
      },
      authentication: deps.getApiKeyStats(),
    });
  });

  app.get("/api/status", (_req: Request, res: Response) => {
    const stats = deps.databaseReady ? deps.inferenceDatabase.getStats() : deps.inferenceHistory.getStats();

    res.json({
      status: "operational",
      timestamp: new Date().toISOString(),
      uptime_ms: process.uptime() * 1000,
      metrics: {
        totalRequests: stats.totalRequests,
        avgLatencyMs: stats.avgLatencyMs,
        p95LatencyMs: (stats as DbInferenceStats).p95LatencyMs || 0,
        p99LatencyMs: (stats as DbInferenceStats).p99LatencyMs || 0,
        positiveCount: stats.positiveCount,
        negativeCount: stats.negativeCount,
        positivityRate: stats.totalRequests > 0 ? Math.round((stats.positiveCount / stats.totalRequests) * 100) : 0,
        errorRate: (stats as DbInferenceStats).errorRate || 0,
        requestsLast24h: (stats as DbInferenceStats).requestsLast24h || 0,
        positivityRateLast24h: (stats as DbInferenceStats).positivityRateLast24h || 0,
      },
      cache: deps.databaseReady ? deps.inferenceDatabase.getCacheStats() : { hits: 0, misses: 0, hitRate: 0 },
      rateLimit: {
        windowMs: deps.rateLimitWindowMs,
        maxRequests: deps.rateLimitMaxRequests,
      },
      database: {
        enabled: deps.enableDatabaseFlag,
        ready: deps.databaseReady,
      },
      authentication: deps.getApiKeyStats(),
      version: API_VERSION,
    });
  });

  app.get("/api/readyz", async (_req: Request, res: Response) => {
    const readiness = await deps.checkPythonReadiness();
    const body = deps.buildReadinessBody(readiness);
    if (!readiness.isReady) {
      res.status(503).json(body);
      return;
    }
    res.json(body);
  });

  app.get("/api/health", async (_req: Request, res: Response) => {
    const readiness = await deps.checkPythonReadiness();
    const body = deps.buildReadinessBody(readiness);
    if (!readiness.isReady) {
      res.status(503).json(body);
      return;
    }
    res.json(body);
  });

  app.get("/api/version", async (_req: Request, res: Response) => {
    try {
      const response = await fetch(`${deps.pythonApiUrl}/version`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        res.json({
          api_version: API_VERSION,
          node_version: process.version,
          python_backend: {
            status: "degraded",
            error: deps.isDev
              ? `Python backend responded with ${response.status}`
              : "Python backend is degraded",
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const backendVersion = (await response.json()) as Record<string, unknown>;
      res.json({
        api_version: API_VERSION,
        node_version: process.version,
        python_backend: {
          status: "ready",
          ...backendVersion,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.json({
        api_version: API_VERSION,
        node_version: process.version,
        python_backend: {
          status: "degraded",
          error: deps.isDev
            ? err instanceof Error
              ? err.message
              : String(err)
            : "Python backend connection failed",
        },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

