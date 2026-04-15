# COVID-19 Cough Signal Analysis

Production-oriented full-stack project for cough-audio COVID-19 risk signal inference.

This repository is a research/demo system and **not** a medical diagnosis tool.

## Architecture

- Frontend: React 19 + Vite + TypeScript + Tailwind
- API Gateway: Node.js + Express + TypeScript
- Inference Service: FastAPI + PyTorch

Runtime flow:
1. Browser uploads audio to `POST /api/predict` on Node gateway.
2. Node validates audio contract and forwards to Python service.
3. Python performs preprocessing + model inference and returns label/probability.

## Repository Structure

```text
client/           React application
server/           Node.js API gateway
python_project/   FastAPI inference backend
scripts/          Version sync and consistency checks
shared/           Generated shared version metadata
dataset/          Sample audio dataset + dataset tooling (not shipped to production)
patches/          Development-only assets (not shipped to production unless explicitly required)
```

## Prerequisites

- Node.js 18+
- Python 3.8+
- `corepack` enabled
- Root package manager is pinned to `pnpm@10.33.0`

## Version Source of Truth

Root `package.json` version is the single source of truth.

After bumping root version, run:

```bash
corepack pnpm run sync:version
```

This regenerates and synchronizes:
- `shared/version.ts`
- `server/src/config/version.ts`
- `python_project/src/covid_cough_detection/version.py`
- `client/package.json` / `server/package.json` version fields
- `python_project/pyproject.toml` version field

The client imports `APP_VERSION` / `API_VERSION` from `shared/version.ts` (Vite alias `@shared/version`) so the UI stays aligned with the same generated constants as the Node gateway.

## Local Development

1. Install JavaScript dependencies (repo root):

```bash
corepack pnpm install
```

If pnpm reports **ignored build scripts** (for example `esbuild`), allow them so Vite can bundle: run `pnpm approve-builds` in the repo root and select the listed packages, or use the non-interactive approval flow documented in the [pnpm trust settings](https://pnpm.io/cli/approve-builds).

2. Install Python dependencies:

```bash
cd python_project
pip install -e ".[dev]"
cd ..
```

3. Start Python inference service (strict startup):

```bash
cd python_project
set MODEL_PATH=./models/model.pt
# macOS/Linux: export MODEL_PATH=./models/model.pt
python -m uvicorn covid_cough_detection.app:app --host 0.0.0.0 --port 8000 --reload
cd ..
```

4. Start frontend + Node gateway (repo root):

```bash
corepack pnpm dev
```

- Frontend dev server: `http://localhost:5173`
- Node gateway: `http://localhost:3000`
- Python backend: `http://localhost:8000`

## Runtime API Contract (Summary)

Node API (`/api/*`):
- `GET /api/healthz` (liveness)
- `GET /api/readyz` (readiness)
- `GET /api/health` (readiness mirror)
- `GET /api/version`
- `POST /api/predict` (`multipart/form-data`, single file, field `audio` or `file`)

Success prediction shape:

```json
{
  "label": "positive",
  "prob": 0.84,
  "model_version": "checkpoint-2026.04",
  "processing_time_ms": 123.4
}
```

Error shape (Node and Python):

```json
{
  "error": "Human readable summary",
  "details": "Optional extra context"
}
```

## Quality Gates

Run from repo root:

```bash
corepack pnpm check
corepack pnpm lint
corepack pnpm build
corepack pnpm test
corepack pnpm check:version
python -m pytest python_project/tests -q
python -m compileall python_project/src
```

## Docker Compose (Recommended Deploy Path)

The Node production image installs **ffmpeg** so the gateway can perform best-effort conversion to WAV when the uploaded MIME type is not already WAV (same behavior as a local dev machine with ffmpeg on `PATH`).

```bash
docker compose up --build
```

Services:
- Node gateway: `http://localhost:3000`
- Python inference: `http://localhost:8000`

Strict model contract:
- Repo does **not** ship a real `model.pt`.
- You must provide `python_project/models/model.pt`.
- Without a valid model file, Python service startup failure is expected behavior.
- Compose health/readiness is model-gated via Python `/readyz`.

## Security and Operations Notes

- Production must set `ALLOWED_ORIGINS` for Node.
- Node applies CSP and security headers and enforces API rate limit.
- Frontend shows risk signal wording (`Possible Positive Signal` / `Possible Negative Signal`) and never claims medical diagnosis.
- `python_project/src/experimental/` is research-only code and not wired into production endpoints.
