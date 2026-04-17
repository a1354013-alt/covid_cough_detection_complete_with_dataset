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
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';

const nodeBaseUrl = process.env.E2E_NODE_URL || 'http://localhost:3000';
const pythonBaseUrl = process.env.E2E_PYTHON_URL || 'http://localhost:8000';
const shouldRunE2E = process.env.RUN_E2E === '1';

if (!shouldRunE2E) {
  throw new Error(
    "E2E tests are intentionally not part of default test flow. Run with RUN_E2E=1 and running services."
  );
}

describe('E2E Integration Tests', () => {
  before(async () => {
    console.log('E2E tests are enabled (RUN_E2E=1). Expect services to be running:');
    console.log(`  - Node gateway: ${nodeBaseUrl}`);
    console.log(`  - Python backend: ${pythonBaseUrl}`);
  });

  after(() => {});

  describe('Health Endpoints', () => {
    it('Node gateway /api/healthz should return liveness', async () => {
      const response = await fetch(`${nodeBaseUrl}/api/healthz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.status, 'alive');
      assert.ok(data.timestamp);
    });

    it('Node gateway /api/readyz should return readiness', async () => {
      const response = await fetch(`${nodeBaseUrl}/api/readyz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok('isReady' in data || 'status' in data);
    });

    it('Python backend /healthz should return liveness', async () => {
      const response = await fetch(`${pythonBaseUrl}/healthz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.status, 'alive');
      assert.ok(data.timestamp);
    });

    it('Python backend /readyz should return readiness', async () => {
      const response = await fetch(`${pythonBaseUrl}/readyz`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok(data.model_loaded !== undefined);
    });
  });

  describe('Version Consistency', () => {
    it('Node and Python should report same API version', async () => {
      const [nodeRes, pythonRes] = await Promise.all([
        fetch(`${nodeBaseUrl}/api/version`),
        fetch(`${pythonBaseUrl}/version`),
      ]);

      assert.strictEqual(nodeRes.status, 200);
      assert.strictEqual(pythonRes.status, 200);

      const nodeData = await nodeRes.json();
      const pythonData = await pythonRes.json();

      // Both should have api_version field
      assert.ok(nodeData.api_version, 'Node should report api_version');
      assert.ok(pythonData.api_version, 'Python should report api_version');
      
      // Versions should match
      assert.strictEqual(
        nodeData.api_version,
        pythonData.api_version,
        'API versions should match between Node and Python'
      );
    });
  });

  describe('Error Handling', () => {
    it('Node should return consistent error format for invalid requests', async () => {
      const response = await fetch(`${nodeBaseUrl}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.ok(data.error, 'Error response should have error field');
    });

    it('Python should return consistent error format for invalid requests', async () => {
      const response = await fetch(`${pythonBaseUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.ok(data.error, 'Error response should have error field');
    });
  });

  describe('CORS Headers', () => {
    it('Node gateway should include CORS headers', async () => {
      const response = await fetch(`${nodeBaseUrl}/api/healthz`, {
        headers: { 'Origin': 'http://localhost:5173' },
      });

      const corsHeader = response.headers.get('Access-Control-Allow-Origin');
      assert.ok(corsHeader, 'Should have Access-Control-Allow-Origin header');
    });

    it('Python backend should include CORS headers', async () => {
      const response = await fetch(`${pythonBaseUrl}/healthz`, {
        headers: { 'Origin': 'http://localhost:3000' },
      });

      const corsHeader = response.headers.get('Access-Control-Allow-Origin');
      assert.ok(corsHeader, 'Should have Access-Control-Allow-Origin header');
    });
  });
});
