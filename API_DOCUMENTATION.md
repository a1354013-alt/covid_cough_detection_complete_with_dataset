# API Documentation

This document defines stable runtime contracts.

## Service Topology

- Client dev server: `http://localhost:5173`
- Node gateway: `http://localhost:3000`
- Python inference: `http://localhost:8000`

Client traffic should go to Node (`/api/*`).

## Stable Error Envelope

Node and Python expose:

```json
{
  "error": "Human readable summary",
  "details": "Optional extra context"
}
```

## Node API (`/api/*`)

### `GET /api/healthz`
`200`:

```json
{
  "status": "alive",
  "timestamp": "2026-04-10T00:00:00.000Z",
  "service": "covid-cough-detection-api",
  "version": "{{VERSION}}"
}
```

### `GET /api/readyz` and `GET /api/health`
Ready `200`:

```json
{
  "status": "ready",
  "timestamp": "2026-04-10T00:00:00.000Z",
  "api_version": "{{VERSION}}",
  "python_backend": {
    "status": "ready",
    "model_loaded": true,
    "model_version": "checkpoint-2026.04",
    "device": "cpu"
  }
}
```

Degraded `503`:

```json
{
  "status": "degraded",
  "timestamp": "2026-04-10T00:00:00.000Z",
  "api_version": "{{VERSION}}",
  "python_backend": {
    "status": "degraded",
    "model_loaded": false,
    "error": "model not loaded"
  }
}
```

### `GET /api/version`
Always `200`, with Python metadata if available.

### `POST /api/predict`
- Content type: `multipart/form-data`
- File field: `audio` (preferred) or `file`
- Max size: `10MB`
- Exactly one file

Success `200`:

```json
{
  "label": "positive",
  "prob": 0.84,
  "model_version": "checkpoint-2026.04",
  "processing_time_ms": 123.4
}
```

Gateway response-code mapping:
- `400`: bad multipart/input/format mismatch
- `413`: payload too large
- `429`: rate-limit exceeded
- `500`: inference backend internal error
- `502`: invalid backend prediction payload (including `prob` out of `0..1` or negative `processing_time_ms`)
- `503`: backend degraded/unavailable

## Python API

### `GET /healthz`
Liveness.

### `GET /readyz` and `GET /health`
Readiness (returns `503` with degraded shape when model not ready).

### `GET /version`
Version/model readiness/device metadata.

### `POST /predict`
- Content type: `multipart/form-data`
- File field: `file`
- Success payload shape matches Node prediction shape.

## Operational Notes

- Python startup is strict: missing/invalid `MODEL_PATH` fails startup.
- Python runtime device is configured by `MODEL_DEVICE=auto|cpu|cuda` (default `auto`).
- Node normalizes legacy Python `detail` payloads but always returns canonical `error`/`details` to clients.
