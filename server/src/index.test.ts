// 將 Node.js Buffer 轉為 BlobPart
function bufferToBlobPart(buffer: Buffer): ArrayBuffer {
  // Always copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return uint8.slice().buffer;
}
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

import { API_VERSION } from "@shared/version";

const gatewayPort = 3110;
const fakePythonPort = 3810;
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
const rateLimitMaxRequests = 5;

type PredictMode = "ok" | "400" | "413" | "503" | "500" | "bad_shape_200";
type VersionMode = "ok" | "status_503" | "disconnect";

let gatewayServer: Server;
let fakePythonServer: Server;
let predictMode: PredictMode = "ok";
let versionMode: VersionMode = "ok";
let readyzStatus = 200;
let ipCounter = 10;
let lastPredictRequestBody = "";

const fallbackDir = path.join(process.cwd(), "src", "public");
const fallbackIndexPath = path.join(fallbackDir, "index.html");
let existingFallbackIndex: string | null = null;
let fallbackIndexOriginallyExisted = false;

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

function createMinimalWavBuffer(): Buffer {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20,
  ]);
}

function createMp3MagicBuffer(): Buffer {
  return Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
}

async function postAudio(
  buffer: Buffer,
  filename: string,
  mimeType = "audio/wav",
  ip = nextIp()
): Promise<Response> {

  const form = new FormData();
  form.append("audio", new Blob([bufferToBlobPart(buffer)], { type: mimeType }), filename);

  return fetch(`${gatewayBaseUrl}/api/predict`, {
    method: "POST",
    body: form,
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

async function postInvalidPredict(ip = nextIp()): Promise<Response> {
  return fetch(`${gatewayBaseUrl}/api/predict`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ not: "multipart" }),
  });
}

before(async () => {
  await fs.mkdir(fallbackDir, { recursive: true });
  try {
    existingFallbackIndex = await fs.readFile(fallbackIndexPath, "utf8");
    fallbackIndexOriginallyExisted = true;
  } catch {
    fallbackIndexOriginallyExisted = false;
  }

  await fs.writeFile(
    fallbackIndexPath,
    "<!doctype html><html><body><div id=\"root\">gateway-spa-fallback</div></body></html>",
    "utf8"
  );

  fakePythonServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/readyz") {
      if (readyzStatus === 200) {
        sendJson(res, 200, {
          status: "ready",
          model_loaded: true,
          model_version: "trained-1.0",
          device: "cpu",
          error: null,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      sendJson(res, readyzStatus, {
        status: "degraded",
        model_loaded: false,
        model_version: null,
        device: "cpu",
        error: "model warming up",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "GET" && req.url === "/version") {
      if (versionMode === "status_503") {
        sendJson(res, 503, { error: "backend degraded" });
        return;
      }

      if (versionMode === "disconnect") {
        req.socket.destroy();
        return;
      }

      sendJson(res, 200, {
        api_version: API_VERSION,
        model_version: "trained-1.0",
        model_ready: true,
        device: "cpu",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/predict") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        lastPredictRequestBody = Buffer.concat(chunks).toString("utf8");

        switch (predictMode) {
          case "ok":
            sendJson(res, 200, {
              label: "negative",
              prob: 0.92,
              model_version: "trained-1.0",
              processing_time_ms: 25.2,
            });
            return;
          case "400":
            sendJson(res, 400, {
              error: "Invalid audio payload",
              details: "Audio decoding failed",
            });
            return;
          case "413":
            sendJson(res, 413, {
              error: "File too large (max 10MB)",
            });
            return;
          case "503":
            sendJson(res, 503, {
              error: "Model not ready",
              details: "Model still loading",
            });
            return;
          case "500":
            sendJson(res, 500, {
              error: "Inference crash",
              details: "RuntimeError: out of memory",
            });
            return;
          case "bad_shape_200":
            sendJson(res, 200, {
              label: "invalid",
              prob: "nan",
              model_version: "x",
            });
            return;
        }
      });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  });

  await new Promise<void>((resolve, reject) => {
    fakePythonServer.listen(fakePythonPort, "127.0.0.1", (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });

  process.env.SKIP_SERVER_START = "true";
  process.env.PORT = String(gatewayPort);
  process.env.PYTHON_API_URL = `http://127.0.0.1:${fakePythonPort}`;
  process.env.RATE_LIMIT_MAX_REQUESTS = String(rateLimitMaxRequests);
  process.env.TRUST_PROXY = "true";
  process.env.ALLOWED_ORIGINS = "http://allowed.example";

  const mod = await import("./index.js");
  gatewayServer = await mod.startServer();
});

after(async () => {
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      gatewayServer.close((err) => (err ? reject(err) : resolve()));
    }),
    new Promise<void>((resolve, reject) => {
      fakePythonServer.close((err) => (err ? reject(err) : resolve()));
    }),
  ]);

  if (fallbackIndexOriginallyExisted && existingFallbackIndex !== null) {
    await fs.writeFile(fallbackIndexPath, existingFallbackIndex, "utf8");
  } else {
    try {
      await fs.unlink(fallbackIndexPath);
    } catch {
      // no-op
    }
  }
});

describe("node gateway critical paths", () => {
  it("GET /api/healthz returns alive and security headers", async () => {
    const response = await fetch(`${gatewayBaseUrl}/api/healthz`, {
      headers: { Origin: "http://allowed.example" },
    });
    assert.equal(response.status, 200);

    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "alive");
    assert.equal(response.headers.get("access-control-allow-origin"), "http://allowed.example");
    assert.ok((response.headers.get("vary") || "").includes("Origin"));
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.ok((response.headers.get("content-security-policy") || "").includes("script-src 'self'"));
  });

  it("GET /api/health mirrors readiness when model is ready", async () => {
    readyzStatus = 200;
    const response = await fetch(`${gatewayBaseUrl}/api/health`);
    const body = (await response.json()) as { status: string; python_backend: { model_loaded: boolean } };
    assert.equal(response.status, 200);
    assert.equal(body.status, "ready");
    assert.equal(body.python_backend.model_loaded, true);
  });

  it("GET /api/readyz mirrors python degraded status", async () => {
    readyzStatus = 503;
    const response = await fetch(`${gatewayBaseUrl}/api/readyz`);
    const body = (await response.json()) as { status: string; python_backend: { error: string; status: string } };
    assert.equal(response.status, 503);
    assert.equal(body.status, "degraded");
    assert.equal(body.python_backend.status, "degraded");
    assert.ok(body.python_backend.error.includes("model warming up"));
    readyzStatus = 200;
  });

  it("OPTIONS preflight is handled with explicit CORS contract", async () => {
    const response = await fetch(`${gatewayBaseUrl}/api/predict`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://allowed.example",
        "Access-Control-Request-Method": "POST",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://allowed.example");
    assert.ok((response.headers.get("access-control-allow-methods") || "").includes("POST"));
  });

  it("GET /api/version returns backend metadata when python is reachable", async () => {
    versionMode = "ok";
    const response = await fetch(`${gatewayBaseUrl}/api/version`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      api_version: string;
      python_backend: { model_ready?: boolean };
    };

    assert.equal(body.api_version, API_VERSION);
    assert.equal(body.python_backend.model_ready, true);
  });

  it("GET /api/version degrades gracefully when python connection fails", async () => {
    versionMode = "disconnect";
    const response = await fetch(`${gatewayBaseUrl}/api/version`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      python_backend: { status: string; error: string };
    };

    assert.equal(body.python_backend.status, "degraded");
    assert.ok(body.python_backend.error.length > 0);
    versionMode = "ok";
  });

  it("POST /api/predict returns successful prediction", async () => {
    predictMode = "ok";
    const response = await postAudio(createMinimalWavBuffer(), "ok.wav");
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      label: string;
      prob: number;
      model_version: string;
    };

    assert.equal(body.label, "negative");
    assert.equal(body.model_version, "trained-1.0");
    assert.equal(typeof body.prob, "number");
  });

  it("falls back to forwarding original mime when ffmpeg is missing", async () => {
    process.env.FFMPEG_PATH = "definitely-not-ffmpeg";

    const response = await postAudio(createMp3MagicBuffer(), "ok.mp3", "audio/mpeg");
    assert.equal(response.status, 200);

    assert.ok(
      lastPredictRequestBody.includes("Content-Type: audio/mpeg"),
      "Gateway should forward original payload when conversion is unavailable"
    );

    delete process.env.FFMPEG_PATH;
  });

  it("POST /api/predict rejects non-multipart payload", async () => {
    const response = await postInvalidPredict();
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Content-Type must be multipart/form-data");
  });

  it("POST /api/predict rejects oversized upload with 413", async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
    const response = await postAudio(oversized, "huge.wav");
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 413);
    assert.ok(body.error.toLowerCase().includes("too large"));
  });

  it("POST /api/predict rejects unsupported format", async () => {
    const response = await postAudio(Buffer.from([0x00, 0x01, 0x02]), "invalid.wav");
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 400);
    assert.ok(body.error.includes("Unsupported audio format"));
  });

  it("POST /api/predict rejects extension and magic-bytes mismatch", async () => {
    const response = await postAudio(createMp3MagicBuffer(), "mismatch.wav");
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 400);
    assert.ok(body.error.includes("does not match detected format"));
  });

  it("POST /api/predict rejects multiple uploaded files", async () => {

    const form = new FormData();
    form.append(
      "audio",
      new Blob([bufferToBlobPart(createMinimalWavBuffer())], { type: "audio/wav" }),
      "one.wav"
    );
    form.append(
      "audio",
      new Blob([bufferToBlobPart(createMinimalWavBuffer())], { type: "audio/wav" }),
      "two.wav"
    );

    const response = await fetch(`${gatewayBaseUrl}/api/predict`, {
      method: "POST",
      body: form,
      headers: {
        "x-forwarded-for": nextIp(),
      },
    });

    const body = (await response.json()) as { error: string; details?: string };
    assert.equal(response.status, 400);
    assert.equal(body.error, "Only one audio file is allowed");
    assert.ok((body.details || "").includes("Upload exactly one file"));
  });

  it("translates python 400 with clear validation detail", async () => {
    predictMode = "400";
    const response = await postAudio(createMinimalWavBuffer(), "ok.wav");
    const body = (await response.json()) as { error: string; details?: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "Invalid audio payload");
    assert.equal(body.details, "Audio decoding failed");
  });

  it("translates python 413 as payload-too-large", async () => {
    predictMode = "413";
    const response = await postAudio(createMinimalWavBuffer(), "ok.wav");
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 413);
    assert.ok(body.error.includes("File too large"));
  });

  it("translates python 503 as model-not-ready", async () => {
    predictMode = "503";
    const response = await postAudio(createMinimalWavBuffer(), "ok.wav");
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 503);
    assert.ok(body.error.includes("Model not ready"));
  });

  it("translates python 500 as internal backend error", async () => {
    predictMode = "500";
    const response = await postAudio(createMinimalWavBuffer(), "ok.wav");
    const body = (await response.json()) as { error: string; details?: string };

    assert.equal(response.status, 500);
    assert.equal(body.error, "Inference backend internal error");
    assert.ok((body.details || "").includes("RuntimeError"));
  });

  it("returns 502 when python returns 200 with invalid prediction shape", async () => {
    predictMode = "bad_shape_200";
    const response = await postAudio(createMinimalWavBuffer(), "ok.wav");
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 502);
    assert.ok(body.error.toLowerCase().includes("invalid"));
    predictMode = "ok";
  });

  it("returns 429 with retry and rate-limit headers when quota exceeded", async () => {
    const quotaIp = "203.0.113.77";

    for (let i = 0; i < rateLimitMaxRequests; i += 1) {
      const response = await postInvalidPredict(quotaIp);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("ratelimit-limit"), String(rateLimitMaxRequests));
    }

    const blocked = await postInvalidPredict(quotaIp);
    const body = (await blocked.json()) as { error: string; details?: string };

    assert.equal(blocked.status, 429);
    assert.equal(body.error, "Too many requests");
    assert.ok((body.details || "").includes("Rate limit exceeded"));
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(blocked.headers.get("ratelimit-limit"), String(rateLimitMaxRequests));
    assert.equal(blocked.headers.get("ratelimit-remaining"), "0");
    assert.ok(Number(blocked.headers.get("ratelimit-reset")) >= 1);
  });

  it("serves SPA fallback for non-API html requests", async () => {
    const response = await fetch(`${gatewayBaseUrl}/dashboard`, {
      headers: {
        Accept: "text/html",
      },
    });

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("gateway-spa-fallback"));
  });

  it("returns API 404 envelope for unknown API routes", async () => {
    const response = await fetch(`${gatewayBaseUrl}/api/unknown`);
    assert.equal(response.status, 404);

    const body = (await response.json()) as { error: string; details?: string };
    assert.equal(body.error, "Not found");
    assert.ok((body.details || "").includes("does not exist"));
  });
});
