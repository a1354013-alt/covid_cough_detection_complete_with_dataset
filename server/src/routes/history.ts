import type { Request, Response } from "express";
import type { Express } from "express";
import { sendError } from "../http.js";

type DatabaseStore = {
  getRecent: (limit: number, offset: number) => unknown[];
  getStats: () => { totalRequests: number };
  getDailyStats: (days: number) => unknown[];
};

type MemoryStore = {
  getRecent: (limit: number) => unknown[];
  getStats: () => { totalRequests: number };
};

export function registerHistoryRoutes(
  app: Express,
  deps: {
    databaseReady: boolean;
    enableDatabaseFlag: boolean;
    inferenceDatabase: DatabaseStore;
    inferenceHistory: MemoryStore;
  }
): void {
  app.get("/api/history", (req: Request, res: Response) => {
    const limit = Math.min(Math.max(1, Number.parseInt(String(req.query.limit), 10) || 10), 100);
    const offset = Math.max(0, Number.parseInt(String(req.query.offset), 10) || 0);

    const records = deps.databaseReady
      ? deps.inferenceDatabase.getRecent(limit, offset)
      : deps.inferenceHistory.getRecent(limit);

    res.json({
      count: records.length,
      total: deps.databaseReady
        ? deps.inferenceDatabase.getStats().totalRequests
        : deps.inferenceHistory.getStats().totalRequests,
      records,
    });
  });

  app.get("/api/stats/daily", (req: Request, res: Response) => {
    const days = Math.min(Math.max(1, Number.parseInt(String(req.query.days), 10) || 7), 90);

    if (!deps.databaseReady) {
      sendError(
        req,
        res,
        503,
        "Database not available",
        deps.enableDatabaseFlag
          ? "Database persistence is enabled but not available. Ensure better-sqlite3 is installed."
          : "Daily statistics require database persistence. Set ENABLE_DATABASE=true"
      );
      return;
    }

    const dailyStats = deps.inferenceDatabase.getDailyStats(days);
    res.json({
      days,
      data: dailyStats,
    });
  });
}

