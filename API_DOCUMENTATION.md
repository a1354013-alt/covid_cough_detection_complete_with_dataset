# API Documentation

This document defines the runtime API contract for the current codebase.

## 1. Service Topology

- Frontend dev server: `http://localhost:5173`
- Node gateway: `http://localhost:3000`
- Python inference service: `http://localhost:8000`

Client traffic should target Node (`/api/*`).

## 2. Stable Error Envelope

Node gateway and Python backend expose a consistent error JSON shape:

```json
{
  "error": "Human readable summary",
  "details": "Optional extra context"
}
```

`details` is optional and may be omitted.

## 3. Node API (`/api/*`)

### 3.1 `GET /api/healthz`
Liveness endpoint for Node process.

Success (`200`):

```json
{
  "status": "alive",
  "timestamp": "2026-04-10T00:00:00.000Z",
  "service": "covid-cough-detection-api",
  "version": "1.0.13"
}
```

### 3.2 `GET /api/readyz`
Readiness endpoint for Node + Python + model state.

Ready (`200`):

```json
{
  "status": "ready",
  "timestamp": "2026-04-10T00:00:00.000Z",
  "python_backend": "ok",
  "model_loaded": true,
  "model_version": "checkpoint-2026.04",
  "device": "cpu"
}
```

Not ready (`503`):

```json
{
  "status": "not_ready",
  "timestamp": "2026-04-10T00:00:00.000Z",
  "python_backend": "started",
  "model_loaded": false,
  "reason": "model unavailable"
}
```

### 3.3 `GET /api/health`
Backward-compatible readiness mirror of `/api/readyz`.

### 3.4 `GET /api/version`
Version metadata with graceful degradation when Python backend is unavailable.

Success (`200`) example:

```json
{
  "api_version": "1.0.13",
  "node_version": "v22.14.0",
  "python_backend": {
    "api_version": "1.0.13",
    "model_version": "checkpoint-2026.04",
    "model_ready": true,
    "device": "cpu",
    "timestamp": "2026-04-10T00:00:00.000Z"
  },
  "timestamp": "2026-04-10T00:00:00.000Z"
}
```

Degraded (`200`) example when Python is unreachable:

```json
{
  "api_version": "1.0.13",
  "node_version": "v22.14.0",
  "python_backend": {
    "status": "unreachable",
    "error": "fetch failed"
  },
  "timestamp": "2026-04-10T00:00:00.000Z"
}
```

### 3.5 `POST /api/predict`
Audio inference endpoint.

- Content type: `multipart/form-data`
- Field name: `audio` (preferred) or `file`
- Exactly one file is allowed
- Max size: `10MB`
- Node validation accepts WAV, MP3, OGG, WebM

Example:

```bash
curl -X POST http://localhost:3000/api/predict \
  -F "audio=@./sample.wav"
```

Success (`200`):

```json
{
  "label": "positive",
  "prob": 0.84,
  "model_version": "checkpoint-2026.04",
  "processing_time_ms": 123.4
}
```

Error semantics:
- `400`: malformed multipart, missing file, multiple files, invalid format, extension/magic mismatch
- `413`: payload too large
- `429`: rate limit exceeded (`Retry-After` + rate-limit headers)
- `500`: inference backend internal error
- `503`: model service not ready/unavailable

Rate-limit headers on `/api/predict` responses:
- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`
- `Retry-After` (present on `429`)

## 4. Python API

### 4.1 `GET /healthz`
Liveness endpoint.

### 4.2 `GET /readyz`
Readiness endpoint. Uses same JSON shape for ready/not-ready, with `503` when not ready.

### 4.3 `GET /health`
Backward-compatible mirror of `/readyz`.

### 4.4 `GET /version`
Python-side version + model status.

### 4.5 `POST /predict`
Direct inference endpoint (usually called by Node).

- Content type: `multipart/form-data`
- File field name: `file`

Success shape matches Node pass-through contract:

```json
{
  "label": "positive",
  "prob": 0.84,
  "model_version": "checkpoint-2026.04",
  "processing_time_ms": 123.4
}
```

## 5. Operational Notes

- Python backend is strict startup: missing/invalid `MODEL_PATH` causes startup failure.
- Node keeps compatibility normalization for legacy Python `{"detail": ...}` payloads, but canonical payload is flat `error`/`details`.
- Frontend should check `/api/readyz` before enabling analysis actions.
- Project output is risk-signal guidance and not a medical diagnosis.