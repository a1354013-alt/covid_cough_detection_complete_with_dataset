# Testing Guide

This project uses a minimal but critical-path-focused test set.

## 1. JavaScript/TypeScript Quality Gates

Run from repository root:

```bash
corepack pnpm check
corepack pnpm lint
corepack pnpm build
corepack pnpm test
corepack pnpm check:version
```

What these cover:
- `check`: TypeScript type checks (client + server)
- `lint`: ESLint rules (client + server)
- `build`: production builds for client + server
- `test`: critical route tests and client API contract smoke test
- `check:version`: version consistency across root/shared/server/python

## 2. Python Gates

Install Python dependencies first:

```bash
cd python_project
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

Then run:

```bash
python -m pytest tests -q
python -m compileall src
```

## 3. Implemented Test Scope

### Node (`server/src/index.test.ts`)
- `GET /api/healthz` returns alive
- `GET /api/readyz` mirrors Python readiness `503`
- `POST /api/predict` non-multipart request returns stable `400` error contract
- `POST /api/predict` oversized upload returns `413`
- `POST /api/predict` invalid format and extension/magic mismatch return `400`
- `POST /api/predict` Python `400/413/503/500` are translated to stable gateway semantics

### Client (`client/src/lib/api.test.ts`, `client/src/pages/home-state.test.ts`)
- `formatPrediction` mapping is stable
- backend-not-ready flow keeps analyze disabled
- uploading → analyzing → success state transitions
- error → reset → retry recovery flow

### Python (`python_project/tests/test_api_contract.py`, `python_project/tests/test_audio_processor_edge_cases.py`)
- `/healthz` contract
- `/readyz` ready and not-ready behavior
- `/version` response contract
- audio processor rejects invalid bytes, silence-only, too-short, and low-amplitude inputs

## 4. Optional Manual Contract Smoke

With services running:

```bash
curl -f http://localhost:3000/api/healthz
curl -f http://localhost:3000/api/readyz
curl -f http://localhost:3000/api/version
curl -X POST http://localhost:3000/api/predict -F "audio=@./sample.wav"
```

## 5. CI Recommendation

Minimum CI pipeline should fail on any non-zero result from:

1. `corepack pnpm check`
2. `corepack pnpm lint`
3. `corepack pnpm build`
4. `corepack pnpm test`
5. `corepack pnpm check:version`
6. `python -m pytest python_project/tests -q`
7. `python -m compileall python_project/src`
