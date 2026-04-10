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
- `python_project/src/version.py`
- `client/package.json` / `server/package.json` version fields
- `python_project/pyproject.toml` version field

## Local Development

1. Install JavaScript dependencies (repo root):

```bash
corepack pnpm install
```

2. Install Python dependencies:

```bash
cd python_project
pip install -r requirements.txt
pip install -r requirements-dev.txt
cd ..
```

3. Start Python inference service (strict startup):

```bash
cd python_project
set MODEL_PATH=./models/model.pt
# macOS/Linux: export MODEL_PATH=./models/model.pt
python -m uvicorn src.app:app --host 0.0.0.0 --port 8000 --reload
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