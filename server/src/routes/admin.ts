import type { Request, Response } from "express";
import type { Express } from "express";
import { sendError } from "../http.js";

type DatabaseStore = {
  getRecentErrors: (limit: number) => unknown[];
};

export function registerAdminRoutes(
  app: Express,
  deps: {
    databaseReady: boolean;
    enableDatabaseFlag: boolean;
    inferenceDatabase: DatabaseStore;
  }
): void {
  app.get("/api/admin/errors", (req: Request, res: Response) => {
    const authenticatedReq = req as typeof req & { apiKeyPermissions?: string[] };
    const permissions = authenticatedReq.apiKeyPermissions || [];

    if (!permissions.includes("admin")) {
      sendError(
        req,
        res,
        403,
        "Admin access required",
        "This endpoint requires an API key with admin permissions"
      );
      return;
    }

    const limit = Math.min(Math.max(1, Number.parseInt(String(req.query.limit), 10) || 20), 100);

    if (!deps.databaseReady) {
      sendError(
        req,
        res,
        503,
        "Database not available",
        deps.enableDatabaseFlag
          ? "Error logs require a working database. Ensure better-sqlite3 is installed."
          : "Error logs require database persistence"
      );
      return;
    }

    const errors = deps.inferenceDatabase.getRecentErrors(limit);
    res.json({
      count: errors.length,
      errors,
    });
  });
}

