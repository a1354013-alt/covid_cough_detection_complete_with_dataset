# Release Checklist

## Prerequisites

1. Enable Corepack and install dependencies.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
python -m pip install -e "./python_project[dev]"
```

2. Ensure model file exists for runtime/deployment.

```text
python_project/models/model.pt
```

## Validation Gates

Run from repo root in this exact order:

1. `corepack pnpm check`
2. `corepack pnpm lint`
3. `corepack pnpm build`
4. `corepack pnpm test`
5. `corepack pnpm test:smoke`
6. `corepack pnpm check:version`
7. `python -m pytest python_project/tests -q`
8. `python -m compileall python_project/src/covid_cough_detection`

## Optional E2E Gate (manual/CI opt-in)

E2E is intentionally not part of default `pnpm test`.

```bash
RUN_E2E=1 corepack pnpm test:e2e
```

Expected runtime services:
- Node gateway at `E2E_NODE_URL` (default `http://localhost:3000`)
- Python backend at `E2E_PYTHON_URL` (default `http://localhost:8000`)

## Container Validation

1. Build images:

```bash
docker compose build --no-cache
```

2. Launch stack:

```bash
docker compose up --build
```

3. Verify contracts:

```bash
curl -f http://localhost:3000/api/healthz
curl -f http://localhost:3000/api/readyz
curl -f http://localhost:3000/api/version
```

## Contract Sync

1. Version source of truth is root `package.json`.
2. After bumping version, run `corepack pnpm run sync:version`.
3. Re-run `corepack pnpm check:version` before release.
