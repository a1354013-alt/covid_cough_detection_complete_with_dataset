# Deployment Guide

This guide describes the current deployable path for this repository.

## 1. Production Contract

- Public entrypoint: Node service (`PORT`, default `3000`)
- Node serves both:
  - `/api/*` (gateway endpoints)
  - frontend static build with SPA fallback
- Python service must be reachable from Node via `PYTHON_API_URL`
- Python startup is strict: `MODEL_PATH` must point to a valid model file

## 2. Required Runtime Inputs

### Node environment

- `PORT` (default `3000`)
- `PYTHON_API_URL` (default `http://localhost:8000`)
- `ALLOWED_ORIGINS` (required in production)
- `REQUEST_TIMEOUT` (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default `30`)
- `TRUST_PROXY` (default `1` in production)

### Python environment

- `MODEL_PATH` (required)
- `ALLOWED_ORIGINS` (optional, default `*`)

## 3. Local Production-Like Build

From repository root:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm start
```

Notes:
- `corepack pnpm start` starts Node (`server/dist/index.js`).
- In non-Docker local mode, Node serves static UI only if `client/dist` exists.

## 4. Docker Compose (Recommended)

## 4.1 Prepare model file

Place a trained model at:

```text
python_project/models/model.pt
```

Compose maps this path into Python container as `/app/models/model.pt`.
If this file is missing, `python-backend` stays unhealthy by design because readiness is model-gated.

## 4.2 Build and run

```bash
docker compose up --build
```

Services:
- Node: [http://localhost:3000](http://localhost:3000)
- Python: [http://localhost:8000](http://localhost:8000)

Health checks:
- Node: `GET /api/healthz`
- Python: `GET /readyz`

`node-backend` depends on healthy `python-backend`.

## 5. Smoke Verification

```bash
curl -f http://localhost:3000/api/healthz
curl -f http://localhost:3000/api/readyz
curl -f http://localhost:3000/api/version
```

A ready deployment should return `200` for all three.

## 6. Security Notes

- Configure `ALLOWED_ORIGINS` explicitly in production.
- Node sets CSP, frame, content-type, and referrer-policy headers.
- If running behind reverse proxy, set `TRUST_PROXY` appropriately.

## 7. Release Checklist

1. Run quality gates (`check`, `lint`, `build`, `test`, `check:version`).
2. Run Python syntax gate (`python -m compileall python_project/src`).
3. Ensure model artifact exists and matches expected model version.
4. Verify `/api/readyz` and `/api/predict` in target environment.
5. Publish only source + configuration (no build outputs or node_modules).
