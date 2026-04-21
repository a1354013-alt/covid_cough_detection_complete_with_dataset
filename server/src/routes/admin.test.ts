import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express } from "express";

import { requestIdMiddleware } from "../http.js";
import { registerAdminRoutes } from "./admin.js";

async function listen(app: Express): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err?: Error) => (err ? reject(err) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

describe("/api/admin/errors", () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    server = null;
  });

  it("rejects requests without admin permission", async () => {
    const app = express();
    app.use(requestIdMiddleware);

    registerAdminRoutes(app, {
      databaseReady: true,
      enableDatabaseFlag: true,
      inferenceDatabase: { getRecentErrors: () => [] },
    });

    const started = await listen(app);
    server = started.server;

    const response = await fetch(`${started.baseUrl}/api/admin/errors`);
    assert.equal(response.status, 403);
    const body = (await response.json()) as { success: boolean; error: string; request_id: string };
    assert.equal(body.success, false);
    assert.equal(body.error, "Admin access required");
    assert.ok(body.request_id.length > 0);
  });

  it("returns 503 when database is unavailable even with admin permission", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      (req as typeof req & { apiKeyPermissions?: string[] }).apiKeyPermissions = ["admin"];
      next();
    });

    registerAdminRoutes(app, {
      databaseReady: false,
      enableDatabaseFlag: true,
      inferenceDatabase: { getRecentErrors: () => [] },
    });

    const started = await listen(app);
    server = started.server;

    const response = await fetch(`${started.baseUrl}/api/admin/errors`);
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error: string; details?: string };
    assert.equal(body.error, "Database not available");
    assert.ok((body.details || "").includes("better-sqlite3"));
  });

  it("returns errors when database is ready and admin permission is present", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      (req as typeof req & { apiKeyPermissions?: string[] }).apiKeyPermissions = ["admin"];
      next();
    });

    registerAdminRoutes(app, {
      databaseReady: true,
      enableDatabaseFlag: true,
      inferenceDatabase: {
        getRecentErrors: (limit: number) => Array.from({ length: Math.min(2, limit) }, (_, i) => ({ i })),
      },
    });

    const started = await listen(app);
    server = started.server;

    const response = await fetch(`${started.baseUrl}/api/admin/errors?limit=2`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { count: number; errors: unknown[] };
    assert.equal(body.count, 2);
    assert.equal(body.errors.length, 2);
  });
});
