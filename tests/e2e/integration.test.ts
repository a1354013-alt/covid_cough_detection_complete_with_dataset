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
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

describe('E2E Integration Tests', () => {
  let nodeProcess: ChildProcess | null = null;
  let pythonProcess: ChildProcess | null = null;

  before(async () => {
    // Note: In CI, these services would be started by docker-compose
    // For local testing, ensure services are running on default ports
    console.log('E2E tests expect services to be running:');
    console.log('  - Node gateway: http://localhost:3000');
    console.log('  - Python backend: http://localhost:8000');
  });

  after(() => {
    if (nodeProcess) nodeProcess.kill();
    if (pythonProcess) pythonProcess.kill();
  });

  describe('Health Endpoints', () => {
    it('Node gateway /api/healthz should return liveness', async () => {
      const response = await fetch('http://localhost:3000/api/healthz');
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.status, 'alive');
      assert.ok(data.timestamp);
    });

    it('Node gateway /api/readyz should return readiness', async () => {
      const response = await fetch('http://localhost:3000/api/readyz');
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok('isReady' in data || 'status' in data);
    });

    it('Python backend /healthz should return liveness', async () => {
      const response = await fetch('http://localhost:8000/healthz');
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.status, 'alive');
      assert.ok(data.timestamp);
    });

    it('Python backend /readyz should return readiness', async () => {
      const response = await fetch('http://localhost:8000/readyz');
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok(data.model_loaded !== undefined);
    });
  });

  describe('Version Consistency', () => {
    it('Node and Python should report same API version', async () => {
      const [nodeRes, pythonRes] = await Promise.all([
        fetch('http://localhost:3000/api/version'),
        fetch('http://localhost:8000/version'),
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
      const response = await fetch('http://localhost:3000/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.ok(data.error, 'Error response should have error field');
    });

    it('Python should return consistent error format for invalid requests', async () => {
      const response = await fetch('http://localhost:8000/predict', {
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
      const response = await fetch('http://localhost:3000/api/healthz', {
        headers: { 'Origin': 'http://localhost:5173' },
      });

      const corsHeader = response.headers.get('Access-Control-Allow-Origin');
      assert.ok(corsHeader, 'Should have Access-Control-Allow-Origin header');
    });

    it('Python backend should include CORS headers', async () => {
      const response = await fetch('http://localhost:8000/healthz', {
        headers: { 'Origin': 'http://localhost:3000' },
      });

      const corsHeader = response.headers.get('Access-Control-Allow-Origin');
      assert.ok(corsHeader, 'Should have Access-Control-Allow-Origin header');
    });
  });
});
