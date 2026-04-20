/**
 * End-to-End Integration Tests
 *
 * Tests the full flow: Client -> Node Gateway -> Python Backend
 *
 * These tests verify:
 * - API contract consistency between services
 * - Error handling propagation
 * - Version endpoint alignment
 * - Health check endpoints
 *
 * Note: These tests require running services. They are safe-skipped unless:
 * - RUN_E2E=1 is set, AND
 * - required services respond to health checks.
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";

const nodeBaseUrl = process.env.E2E_NODE_URL || "http://localhost:3000";
const pythonBaseUrl = process.env.E2E_PYTHON_URL || "http://localhost:8000";
const shouldRunE2E = process.env.RUN_E2E === "1";

async function isServiceAvailable(url: string, endpoint: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${url}${endpoint}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

let servicesAvailable = false;
let nodeAvailable = false;
let pythonAvailable = false;

if (!shouldRunE2E) {
  console.log("E2E tests skipped. Set RUN_E2E=1 to enable.");
} else {
  console.log("Checking service availability...");
  console.log(`  - Node gateway: ${nodeBaseUrl}`);
  console.log(`  - Python backend: ${pythonBaseUrl}`);

  nodeAvailable = await isServiceAvailable(nodeBaseUrl, "/api/healthz");
  pythonAvailable = await isServiceAvailable(pythonBaseUrl, "/healthz");
  servicesAvailable = nodeAvailable && pythonAvailable;

  if (!servicesAvailable) {
    console.warn("Services not available. E2E tests will be skipped.");
    console.warn(
      `  - Node: ${nodeAvailable ? "OK" : "FAIL"}, Python: ${pythonAvailable ? "OK" : "FAIL"}`
    );
  } else {
    console.log("All services available. Running E2E tests.");
  }
}

describe("E2E Integration Tests", { skip: !shouldRunE2E || !servicesAvailable }, () => {
  before(async () => {});
  after(() => {});

  describe("Health Endpoints", () => {
    it("Node gateway /api/healthz should return liveness", async () => {
      const response = await fetch(`${nodeBaseUrl}/api/healthz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.status, "alive");
      assert.ok(data.timestamp);
    });

    it("Node gateway /api/readyz should return readiness", async () => {
      const response = await fetch(`${nodeBaseUrl}/api/readyz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok("isReady" in data || "status" in data);
    });

    it("Python backend /healthz should return liveness", async () => {
      const response = await fetch(`${pythonBaseUrl}/healthz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.status, "alive");
      assert.ok(data.timestamp);
    });

    it("Python backend /readyz should return readiness", async () => {
      const response = await fetch(`${pythonBaseUrl}/readyz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok(data.model_loaded !== undefined);
    });
  });

  describe("Version Consistency", () => {
    it("Node and Python should report same API version", async () => {
      const [nodeRes, pythonRes] = await Promise.all([
        fetch(`${nodeBaseUrl}/api/version`),
        fetch(`${pythonBaseUrl}/version`),
      ]);

      assert.strictEqual(nodeRes.status, 200);
      assert.strictEqual(pythonRes.status, 200);

      const nodeData = await nodeRes.json();
      const pythonData = await pythonRes.json();

      assert.ok(nodeData.api_version, "Node should report api_version");
      assert.ok(pythonData.api_version, "Python should report api_version");

      assert.strictEqual(
        nodeData.api_version,
        pythonData.api_version,
        "API versions should match between Node and Python"
      );
    });
  });

  describe("Error Handling", () => {
    it("Node should return consistent error format for invalid requests", async () => {
      const response = await fetch(`${nodeBaseUrl}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.ok(data.error, "Error response should have error field");
    });

    it("Python should return consistent error format for invalid requests", async () => {
      const response = await fetch(`${pythonBaseUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.ok(data.error, "Error response should have error field");
    });
  });

  describe("CORS Headers", () => {
    it("Node gateway should include CORS headers", async () => {
      const response = await fetch(`${nodeBaseUrl}/api/healthz`, {
        headers: { Origin: "http://localhost:5173" },
      });

      const corsHeader = response.headers.get("Access-Control-Allow-Origin");
      assert.ok(corsHeader, "Should have Access-Control-Allow-Origin header");
    });

    it("Python backend should include CORS headers", async () => {
      const response = await fetch(`${pythonBaseUrl}/healthz`, {
        headers: { Origin: "http://localhost:3000" },
      });

      const corsHeader = response.headers.get("Access-Control-Allow-Origin");
      assert.ok(corsHeader, "Should have Access-Control-Allow-Origin header");
    });
  });
});

