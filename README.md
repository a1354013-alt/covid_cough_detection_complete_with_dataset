# COVID-19 Cough Detection

Production-oriented full-stack project for cough-audio based COVID-19 risk inference.

Tech stack:
- Frontend: React 19 + Vite + TypeScript + Tailwind
- API gateway: Node.js + Express + TypeScript
- Inference service: FastAPI + PyTorch

## Repository Structure

```text
client/           React application
server/           Node.js API gateway and security middleware
python_project/   FastAPI inference backend
scripts/          Consistency and maintenance scripts
shared/           Shared constants and version metadata
```

## Prerequisites

- Node.js 18+
- Python 3.8+
- `corepack` enabled (comes with modern Node versions)
- pnpm is pinned via `packageManager` in root `package.json` (`pnpm@10.33.0`)

## Local Development

1. Install JS dependencies from repository root:

```bash
corepack pnpm install
```

2. Install Python dependencies:

```bash
cd python_project
pip install -r requirements.txt
cd ..
```

3. Start Python service:

```bash
cd python_project
set MODEL_PATH=./models/model.pt
# macOS/Linux: export MODEL_PATH=./models/model.pt
python -m uvicorn src.app:app --host 0.0.0.0 --port 8000 --reload
cd ..
```

4. Start frontend + Node gateway from repository root:

```bash
corepack pnpm dev
```

## Quality Gates

From repository root:

```bash
corepack pnpm check
corepack pnpm lint
corepack pnpm build
corepack pnpm test
corepack pnpm check:version
```

Python syntax validation:

```bash
python -m compileall python_project/src
```

## Runtime Contract

Client uploads audio to Node gateway:
- `POST /api/predict` (`multipart/form-data`, field: `audio` or `file`)

Node gateway proxies to Python service and returns:

```json
{
  "label": "positive",
  "prob": 0.84,
  "model_version": "trained-1.0",
  "processing_time_ms": 123.4
}
```

Health endpoints:
- Node liveness: `GET /api/healthz`
- Node readiness: `GET /api/readyz`
- Backward-compatible mirror: `GET /api/health`
- Version info: `GET /api/version`

Python endpoints:
- `GET /healthz`
- `GET /readyz`
- `GET /health`
- `GET /version`
- `POST /predict`

## Environment Variables

Node (`server/src/index.ts`):
- `PORT` (default: `3000`)
- `PYTHON_API_URL` (default: `http://localhost:8000`)
- `REQUEST_TIMEOUT` (ms, default: `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default: `30`)
- `TRUST_PROXY` (default: `false` in dev, `1` in prod)
- `ALLOWED_ORIGINS` (required in prod)
- `CSP_CONNECT_SRC_EXTRA` (optional)

Python (`python_project/src/app.py`):
- `MODEL_PATH` (required; startup fails fast when missing/invalid)
- `ALLOWED_ORIGINS` (default: `*`)

## Docker

Use Docker Compose from repository root:

```bash
docker compose up --build
```

Services:
- Node gateway: `http://localhost:3000`
- Python backend: `http://localhost:8000`

### Strict Model Requirement

- This repository does **not** ship a production model artifact.
- You must provide `python_project/models/model.pt` before expecting readiness.
- If model is missing or invalid, Python container startup/readiness failure is expected behavior (not a bug).

## Notes

- This project is for research/demo workflow and is **not** a medical diagnosis tool.
- Inference backend is strict-mode fail-fast and requires a real model file at `MODEL_PATH`.
- Docker Compose expects the model to be available at `./python_project/models/model.pt`.
- `python_project/src/experimental/` contains research modules that are intentionally not part of production API flow.
