# Deployment Guide

## Topology

- Public entrypoint: Node gateway (`3000`)
- Private backend: Python inference (`8000`)
- Node serves API + frontend static assets

## Strict Startup Contract (Python)

- `MODEL_PATH` is required
- model file must exist and load successfully
- startup fails fast if model is missing/invalid

## Environment Variables

### Node
- `PORT` (default `3000`)
- `PYTHON_API_URL` (default `http://localhost:8000`)
- `ALLOWED_ORIGINS` (**required in production**)
- `REQUEST_TIMEOUT` (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default `30`)
- `TRUST_PROXY` (default `1` in production)
- `CSP_CONNECT_SRC_EXTRA` (optional)
- `FFMPEG_PATH` (optional, default `ffmpeg`)

### Python
- `MODEL_PATH` (**required**)
- `MODEL_DEVICE` (`auto|cpu|cuda`, default `auto`)
- `ALLOWED_ORIGINS` (optional)

## Local Production-like Run

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm start
```

## Docker Compose

1. Provide model artifact:

```text
python_project/models/model.pt
```

2. Build and run:

```bash
docker compose up --build
```

3. Verify endpoints:

```bash
curl -f http://localhost:3000/api/healthz
curl -f http://localhost:3000/api/readyz
curl -f http://localhost:3000/api/version
```

## CI Responsibility Split

CI jobs are split by single responsibility:
- JS check
- JS lint
- JS build
- JS test
- Version contract
- Smoke contract
- Python quality
- Docker build validation

This avoids duplicated nested checks in one job.

## Release

Use [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
