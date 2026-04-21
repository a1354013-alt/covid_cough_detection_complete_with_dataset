import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express } from "express";

import { requestIdMiddleware } from "../http.js";
import { registerPredictRoutes } from "./predict.js";

async function listen(app: Express): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err?: Error) => (err ? reject(err) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

function createMinimalWavBuffer(): Buffer {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20,
  ]);
}

describe("predict cache timing semantics", () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    server = null;
  });

  it("returns cached=true with request processing time and model_processing_time_ms from cache", async () => {
    const app = express();
    app.use(requestIdMiddleware);

    const dbAdds: Array<{ processingTimeMs: number }> = [];
    const cachedModelTime = 50;

    registerPredictRoutes(app, {
      databaseReady: true,
      maxFileSizeBytes: 10 * 1024 * 1024,
      cacheTtlSeconds: 3600,
      rateLimitMaxRequests: 30,
      checkRateLimit: () => ({ allowed: true, remaining: 30, resetAt: Date.now() + 60_000 }),
      setRateLimitHeaders: () => 60,
      parseMultipart: async () => ({
        file: createMinimalWavBuffer(),
        filename: "ok.wav",
        mimeType: "audio/wav",
      }),
      validateAudioFile: () => ({ valid: true, format: "wav" }),
      forwardToPythonBackend: async () => {
        throw new Error("should not be called on cache hit");
      },
      mapBackendFailureToGatewayResponse: () => ({ status: 503, error: "unreachable" }),
      getRateLimitKey: () => "127.0.0.1",
      inferenceDatabase: {
        getCachedPrediction: () => ({
          label: "negative",
          confidence: 0.91,
          modelProcessingTimeMs: cachedModelTime,
          modelVersion: "trained-1.0",
        }),
        add: (record) => {
          dbAdds.push({ processingTimeMs: record.processingTimeMs });
          return { requestId: record.requestId };
        },
        setCachedPrediction: () => {},
        logError: () => {},
      },
      inferenceHistory: {
        add: () => ({ requestId: "req_unused" }),
      },
      logger: {
        info: () => {},
        logPrediction: () => {},
        logPredictionResult: () => {},
      },
    });

    const started = await listen(app);
    server = started.server;

    const response = await fetch(`${started.baseUrl}/api/predict`, { method: "POST" });
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      cached: boolean;
      processing_time_ms: number;
      model_processing_time_ms: number;
      request_id: string;
    };

    assert.equal(body.cached, true);
    assert.equal(body.model_processing_time_ms, cachedModelTime);
    assert.ok(Number.isFinite(body.processing_time_ms));
    assert.ok(body.processing_time_ms >= 0);
    assert.ok(body.request_id.length > 0);
    assert.equal(dbAdds.length, 1);
    assert.ok(dbAdds[0]!.processingTimeMs >= 0);
  });

  it("returns cached=false with request processing time and model_processing_time_ms from backend", async () => {
    const app = express();
    app.use(requestIdMiddleware);

    const cachedWrites: Array<{ modelProcessingTimeMs: number }> = [];
    const modelTime = 123.4;

    registerPredictRoutes(app, {
      databaseReady: true,
      maxFileSizeBytes: 10 * 1024 * 1024,
      cacheTtlSeconds: 3600,
      rateLimitMaxRequests: 30,
      checkRateLimit: () => ({ allowed: true, remaining: 30, resetAt: Date.now() + 60_000 }),
      setRateLimitHeaders: () => 60,
      parseMultipart: async () => ({
        file: createMinimalWavBuffer(),
        filename: "ok.wav",
        mimeType: "audio/wav",
      }),
      validateAudioFile: () => ({ valid: true, format: "wav" }),
      forwardToPythonBackend: async () => ({
        ok: true,
        prediction: {
          label: "negative",
          prob: 0.92,
          model_version: "trained-1.0",
          processing_time_ms: modelTime,
        },
      }),
      mapBackendFailureToGatewayResponse: () => ({ status: 503, error: "unreachable" }),
      getRateLimitKey: () => "127.0.0.1",
      inferenceDatabase: {
        getCachedPrediction: () => null,
        add: (record) => ({ requestId: record.requestId }),
        setCachedPrediction: (_audioHash, prediction) => {
          cachedWrites.push({ modelProcessingTimeMs: prediction.modelProcessingTimeMs });
        },
        logError: () => {},
      },
      inferenceHistory: {
        add: () => ({ requestId: "req_unused" }),
      },
      logger: {
        info: () => {},
        logPrediction: () => {},
        logPredictionResult: () => {},
      },
    });

    const started = await listen(app);
    server = started.server;

    const response = await fetch(`${started.baseUrl}/api/predict`, { method: "POST" });
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      cached: boolean;
      processing_time_ms: number;
      model_processing_time_ms: number;
      request_id: string;
    };

    assert.equal(body.cached, false);
    assert.equal(body.model_processing_time_ms, modelTime);
    assert.ok(Number.isFinite(body.processing_time_ms));
    assert.ok(body.processing_time_ms >= 0);
    assert.ok(body.request_id.length > 0);
    assert.equal(cachedWrites.length, 1);
    assert.equal(cachedWrites[0]!.modelProcessingTimeMs, modelTime);
  });
});
