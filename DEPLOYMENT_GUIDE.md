# Deployment Guide

This guide describes the production deployment contract for this repository.

## 1. Deployment Topology

- Public entrypoint: Node gateway (`PORT`, default `3000`)
- Node serves:
  - `/api/*` gateway endpoints
  - frontend static assets (`client/dist`) with SPA fallback
- Python inference service runs separately and is reached by Node via `PYTHON_API_URL`

## 2. Strict Model Startup Contract

Python backend runs in strict startup mode:
- `MODEL_PATH` is required
- model file must exist and be loadable
- if model is missing/invalid, process startup fails (expected)

This repository does **not** include a production model artifact.
Provide your own `python_project/models/model.pt`.

## 3. Required Environment Variables

### Node
- `PORT` (default `3000`)
- `PYTHON_API_URL` (default `http://localhost:8000`)
- `ALLOWED_ORIGINS` (**required in production**)
- `REQUEST_TIMEOUT` (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default `30`)
- `TRUST_PROXY` (default `1` in production)
- `CSP_CONNECT_SRC_EXTRA` (optional)

### Python
- `MODEL_PATH` (**required**)
- `ALLOWED_ORIGINS` (optional, default `*`)

## 4. Build and Run Locally (Production-like)

From repository root:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm start
```

Notes:
- `corepack pnpm start` launches Node (`server/dist/index.js`).
- Node serves frontend only when static build exists (`client/dist` copied into deployment image or available locally).

## 5. Docker Compose (Recommended)

### 5.1 Prepare model file

Place model artifact at:

```text
python_project/models/model.pt
```

Compose maps this directory into Python container:
- host: `./python_project/models`
- container: `/app/models`

### 5.2 Build and run

```bash
docker compose up --build
```

Services:
- Node: [http://localhost:3000](http://localhost:3000)
- Python: [http://localhost:8000](http://localhost:8000)

Health/readiness:
- Python container healthcheck: `GET /readyz`
- Node container healthcheck: `GET /api/healthz`
- `node-backend` depends on `python-backend` with `condition: service_healthy`

If model is missing, Python service startup/readiness failure is expected and Node will not be marked ready for inference.

## 6. Verification Checklist

```bash
curl -f http://localhost:3000/api/healthz
curl -f http://localhost:3000/api/readyz
curl -f http://localhost:3000/api/version
```

For readiness-gated deployments, `/api/readyz` must be `200` before exposing traffic.

## 7. Security Baseline

- Production must define explicit `ALLOWED_ORIGINS`.
- Node emits CSP and security headers.
- Node gateway enforces request rate limiting for `/api/predict`.
- Keep reverse-proxy trust (`TRUST_PROXY`) aligned with your ingress setup.

## 8. Release Checklist

1. `corepack pnpm check`
2. `corepack pnpm lint`
3. `corepack pnpm build`
4. `corepack pnpm test`
5. `corepack pnpm check:version`
6. `python -m pytest python_project/tests -q`
7. `python -m compileall python_project/src`
8. Confirm model artifact availability in deployment environment
9. Confirm `/api/readyz` and `/api/predict` behavior in target runtime