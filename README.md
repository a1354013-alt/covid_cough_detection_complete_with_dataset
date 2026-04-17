# COVID-19 Cough Signal Analysis

Production-oriented monorepo for cough-audio risk signal inference (research/demo, not medical diagnosis).

## Stack

- Client: React 19 + Vite + TypeScript
- Gateway: Node.js + Express + TypeScript
- Inference: FastAPI + PyTorch

## Package Manager Contract

- This repository is **pnpm-only**.
- Use `corepack pnpm ...` in local scripts/CI.
- Root `package.json` (`version`) is the single source of truth.

## Quick Start

```bash
corepack enable
corepack pnpm install --frozen-lockfile
python -m pip install -e "./python_project[dev]"
```

Start Python backend (strict startup):

```bash
cd python_project
set MODEL_PATH=./models/model.pt
set MODEL_DEVICE=auto
python -m uvicorn covid_cough_detection.app:app --host 0.0.0.0 --port 8000 --reload
```

Start Node + client:

```bash
corepack pnpm dev
```

## Runtime Contracts (summary)

Node gateway (`/api/*`):
- `GET /api/healthz` liveness
- `GET /api/readyz` readiness
- `GET /api/health` readiness mirror
- `GET /api/version`
- `POST /api/predict` (`multipart/form-data`, field `audio` or `file`, max 10MB)

Prediction contract:

```json
{
  "label": "positive",
  "prob": 0.84,
  "model_version": "checkpoint-2026.04",
  "processing_time_ms": 123.4
}
```

Validation contract:
- `prob` must be `0 <= prob <= 1`
- `processing_time_ms` must be `>= 0`
- Invalid backend payload maps to gateway `502`.

Stable error envelope (Node and Python):

```json
{
  "error": "Human readable summary",
  "details": "Optional extra context"
}
```

## Quality Gates

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

## E2E Policy

- E2E is intentionally **not** in default `corepack pnpm test`.
- Run explicitly with:

```bash
RUN_E2E=1 corepack pnpm test:e2e
```

(Requires running Node/Python services.)

## Docker

```bash
docker compose up --build
```

Notes:
- Node image contains `ffmpeg` for best-effort audio conversion.
- Python container requires model file at `python_project/models/model.pt`.
- Production/release boundaries exclude `dataset/`, `patches/`, and experimental Python paths.

## Release Checklist

See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
