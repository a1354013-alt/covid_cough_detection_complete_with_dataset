import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express } from "express";

import { requestIdMiddleware } from "../http.js";
import { registerHistoryRoutes } from "./history.js";

async function listen(app: Express): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err?: Error) => (err ? reject(err) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

describe("/api/stats/daily", () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    server = null;
  });

  it("returns 503 when database is disabled", async () => {
    const app = express();
    app.use(requestIdMiddleware);

    registerHistoryRoutes(app, {
      databaseReady: false,
      enableDatabaseFlag: false,
      inferenceDatabase: {
        getRecent: () => [],
        getStats: () => ({ totalRequests: 0 }),
        getDailyStats: () => [],
      },
      inferenceHistory: {
        getRecent: () => [],
        getStats: () => ({ totalRequests: 0 }),
      },
    });

    const started = await listen(app);
    server = started.server;

    const response = await fetch(`${started.baseUrl}/api/stats/daily`);
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error: string; details?: string };
    assert.equal(body.error, "Database not available");
    assert.ok((body.details || "").includes("ENABLE_DATABASE=true"));
  });

  it("clamps days to [1, 90] and returns data", async () => {
    const app = express();
    app.use(requestIdMiddleware);

    registerHistoryRoutes(app, {
      databaseReady: true,
      enableDatabaseFlag: true,
      inferenceDatabase: {
        getRecent: () => [],
        getStats: () => ({ totalRequests: 0 }),
        getDailyStats: (days: number) => [{ days }],
      },
      inferenceHistory: {
        getRecent: () => [],
        getStats: () => ({ totalRequests: 0 }),
      },
    });

    const started = await listen(app);
    server = started.server;

    // days=0 falls back to default (7) because `0` is falsy in the current parsing logic.
    const zero = await fetch(`${started.baseUrl}/api/stats/daily?days=0`);
    assert.equal(zero.status, 200);
    const zeroBody = (await zero.json()) as { days: number; data: Array<{ days: number }> };
    assert.equal(zeroBody.days, 7);
    assert.equal(zeroBody.data[0]!.days, 7);

    // Negative values are clamped up to 1.
    const low = await fetch(`${started.baseUrl}/api/stats/daily?days=-1`);
    assert.equal(low.status, 200);
    const lowBody = (await low.json()) as { days: number; data: Array<{ days: number }> };
    assert.equal(lowBody.days, 1);
    assert.equal(lowBody.data[0]!.days, 1);

    const high = await fetch(`${started.baseUrl}/api/stats/daily?days=999`);
    assert.equal(high.status, 200);
    const highBody = (await high.json()) as { days: number; data: Array<{ days: number }> };
    assert.equal(highBody.days, 90);
    assert.equal(highBody.data[0]!.days, 90);
  });
});
