import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

let server: Server;
const port = 3110;
const baseUrl = `http://127.0.0.1:${port}`;

before(async () => {
  process.env.SKIP_SERVER_START = "true";
  process.env.PORT = String(port);
  process.env.PYTHON_API_URL = "http://127.0.0.1:65535";
  const mod = await import("./index.js");
  server = await mod.startServer();
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("server critical paths", () => {
  it("GET /api/healthz returns alive", async () => {
    const response = await fetch(`${baseUrl}/api/healthz`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "alive");
  });

  it("GET /api/readyz returns 503 when python backend is unreachable", async () => {
    const response = await fetch(`${baseUrl}/api/readyz`);
    assert.equal(response.status, 503);
    const body = (await response.json()) as { status: string; reason: string };
    assert.equal(body.status, "not_ready");
    assert.ok(body.reason.includes("unreachable"));
  });

  it("POST /api/predict rejects non-multipart payload with stable error shape", async () => {
    const response = await fetch(`${baseUrl}/api/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Content-Type must be multipart/form-data");
  });
});
