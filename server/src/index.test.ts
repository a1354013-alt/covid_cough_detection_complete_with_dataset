import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const gatewayPort = 3110;
const fakePythonPort = 3810;
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;

type PredictMode = "ok" | "400" | "413" | "503" | "500";

let gatewayServer: Server;
let fakePythonServer: Server;
let predictMode: PredictMode = "ok";
let readyzStatus = 200;

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function createMinimalWavBuffer(): Buffer {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45, // WAVE
    0x66, 0x6d, 0x74, 0x20,
  ]);
}

function createMp3MagicBuffer(): Buffer {
  return Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
}

async function postAudio(buffer: Buffer, filename: string): Promise<Response> {
  const form = new FormData();
  form.append("audio", new Blob([buffer], { type: "audio/wav" }), filename);

  return fetch(`${gatewayBaseUrl}/api/predict`, {
    method: "POST",
    body: form,
  });
}

before(async () => {
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
        status: "not_ready",
        model_loaded: false,
        model_version: null,
        device: "cpu",
        error: "model warming up",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "GET" && req.url === "/version") {
      sendJson(res, 200, {
        api_version: "1.0.13",
        model_version: "trained-1.0",
        model_ready: true,
        device: "cpu",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/predict") {
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
      }
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
});

describe("node gateway critical paths", () => {
  it("GET /api/healthz returns alive", async () => {
    const response = await fetch(`${gatewayBaseUrl}/api/healthz`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "alive");
  });

  it("GET /api/readyz mirrors python not-ready status", async () => {
    readyzStatus = 503;
    const response = await fetch(`${gatewayBaseUrl}/api/readyz`);
    const body = (await response.json()) as { status: string; reason: string };
    assert.equal(response.status, 503);
    assert.equal(body.status, "not_ready");
    assert.ok(body.reason.includes("model warming up"));
    readyzStatus = 200;
  });

  it("POST /api/predict rejects non-multipart payload", async () => {
    const response = await fetch(`${gatewayBaseUrl}/api/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });

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
});
