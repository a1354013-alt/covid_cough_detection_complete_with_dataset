# Testing Guide

This repository uses a critical-path test set focused on delivery risk.

## 1. JavaScript/TypeScript Quality Gates

Run from repository root:

```bash
corepack pnpm check
corepack pnpm lint
corepack pnpm build
corepack pnpm test
corepack pnpm check:version
```

Coverage:
- `check`: TypeScript type checks (client + server)
- `lint`: ESLint (client + server)
- `build`: production builds (client + server)
- `test`: Node gateway + client state/contract tests
- `check:version`: validates generated version files and package version consistency

## 2. Python Gates

```bash
cd python_project
pip install -r requirements.txt
pip install -r requirements-dev.txt
python -m pytest tests -q
python -m compileall src
```

## 3. Current Test Scope

### Node (`server/src/index.test.ts`)
- `GET /api/healthz` contract and security headers
- `GET /api/health` and `GET /api/readyz` readiness semantics
- `GET /api/version` success and Python-unreachable degradation
- `OPTIONS /api/predict` CORS preflight handling
- `POST /api/predict` success path
- `POST /api/predict` rejection paths:
  - non-multipart
  - oversized file (`413`)
  - unsupported format
  - extension/magic mismatch
  - multi-file upload (`400`)
  - translated Python `400/413/503/500`
- rate-limit contract (`429`) with `Retry-After` and rate-limit headers
- SPA fallback for non-API HTML routes and stable API `404` envelope

### Client (`client/src/lib/api.test.ts`, `client/src/pages/home-state.test.ts`)
- risk-signal wording (`Possible Positive Signal` / `Possible Negative Signal`)
- diagnostic wording guard (no `COVID-19 Positive/Negative` in display labels)
- backend-not-ready state disables analyze path
- uploading → analyzing → success transitions
- error → reset → retry recovery
- positive/negative semantic color mapping stability

### Python (`python_project/tests/*.py`)
- `/healthz`, `/readyz`, `/version` contract behavior
- `/predict` success + validation error envelope behavior
- strict startup fail-fast for missing/invalid model path
- model version metadata extraction fallback behavior
- audio processor edge cases:
  - invalid bytes
  - silence-only
  - too short
  - low amplitude

## 4. Optional Manual Smoke

With services running:

```bash
curl -f http://localhost:3000/api/healthz
curl -f http://localhost:3000/api/readyz
curl -f http://localhost:3000/api/version
curl -X POST http://localhost:3000/api/predict -F "audio=@./sample.wav"
```

## 5. CI Minimum Recommendation

Fail pipeline on non-zero exit from:
1. `corepack pnpm check`
2. `corepack pnpm lint`
3. `corepack pnpm build`
4. `corepack pnpm test`
5. `corepack pnpm check:version`
6. `python -m pytest python_project/tests -q`
7. `python -m compileall python_project/src`