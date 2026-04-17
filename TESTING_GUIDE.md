# Testing Guide

## Default Test Flow (repo root)

```bash
corepack pnpm check
corepack pnpm lint
corepack pnpm build
corepack pnpm test
corepack pnpm test:smoke
corepack pnpm check:version
python -m pytest python_project/tests -q
python -m compileall python_project/src/covid_cough_detection
```

## Framework Strategy

- Client: **Vitest + jsdom** only
- Server: **node:test** only
- Python: **pytest**

No mixed framework execution inside the same package-level test entrypoint.

## E2E Strategy

E2E is opt-in and intentionally excluded from default `corepack pnpm test`.

```bash
RUN_E2E=1 corepack pnpm test:e2e
```

Required runtime before running E2E:
- Node gateway reachable at `E2E_NODE_URL` (default `http://localhost:3000`)
- Python backend reachable at `E2E_PYTHON_URL` (default `http://localhost:8000`)

If `RUN_E2E` is not set, `test:e2e` fails fast with explicit instructions.

## Smoke Contract

`corepack pnpm test:smoke` runs build/release contract smoke checks from `server/src/build-smoke.test.ts`.

This is separate from unit/integration tests to keep `test` focused and avoid duplicated build/check nesting.

## Current Coverage

- Client:
  - API formatting contracts
  - MIME contract validation
  - Home flow state transitions
  - Error boundary rendering
- Server:
  - API contract, status mapping, CORS/security, rate-limit headers
  - backend payload validation and gateway mapping
  - delivery boundary manifest checks
- Python:
  - strict startup/model loading contract
  - API contract shape
  - audio preprocessing edge cases
  - mel feature shape inference contract
