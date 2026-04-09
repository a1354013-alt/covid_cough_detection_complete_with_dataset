# API Documentation

This document defines the runtime contract for the current production codebase.

## 1. Service Topology

- Frontend (Vite dev or static build): `http://localhost:5173` in dev, served by Node in deploy.
- Node API gateway: `http://localhost:3000`
- Python inference service: `http://localhost:8000`

Client traffic should always go to Node (`/api/*`).

## 2. Error Envelope (Stable)

All Node API errors use this shape:

```json
{
  "error": "Human readable summary",
  "details": "Optional debug detail (development mode only)"
}
```

## 3. Node API (`/api/*`)

### 3.1 `GET /api/healthz`
Liveness endpoint for Node process.

Success (`200`):

```json
{
  "status": "alive",
  "timestamp": "2026-04-09T00:00:00.000Z",
  "service": "covid-cough-detection-api",
  "version": "1.0.13"
}
```

### 3.2 `GET /api/readyz`
Readiness endpoint for Node + Python + model status.

Ready (`200`):

```json
{
  "status": "ready",
  "timestamp": "2026-04-09T00:00:00.000Z",
  "python_backend": "ok",
  "model_loaded": true,
  "model_version": "trained-1.0",
  "device": "cpu"
}
```

Not ready (`503`):

```json
{
  "status": "not_ready",
  "timestamp": "2026-04-09T00:00:00.000Z",
  "python_backend": "unreachable",
  "model_loaded": false,
  "reason": "Python backend unreachable: ..."
}
```

### 3.3 `GET /api/health`
Backward-compatible mirror of `/api/readyz`.

### 3.4 `POST /api/predict`
Audio inference endpoint.

- Content type: `multipart/form-data`
- File field name: `audio` (preferred) or `file` (supported)
- Max size: `10MB`
- Accepted by Node validation: WAV, MP3, OGG, WebM

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
  "model_version": "trained-1.0",
  "processing_time_ms": 123.4
}
```

Common error statuses:

- `400`: malformed multipart, missing file, invalid format, extension mismatch
- `413`: file too large from Python backend
- `429`: rate limit exceeded
- `503`: Python/model service unavailable

### 3.5 `GET /api/version`
Version metadata with graceful degradation if Python is unavailable.

Success (`200`):

```json
{
  "api_version": "1.0.13",
  "node_version": "v22.14.0",
  "python_backend": {
    "api_version": "1.0.13",
    "model_version": "trained-1.0",
    "model_ready": true,
    "device": "cpu",
    "timestamp": "2026-04-09T00:00:00.000Z"
  },
  "timestamp": "2026-04-09T00:00:00.000Z"
}
```

## 4. Python API

### 4.1 `GET /healthz`
Liveness endpoint.

### 4.2 `GET /readyz`
Readiness endpoint. Returns `503` if model is not ready.

### 4.3 `GET /health`
Backward-compatible mirror of `/readyz`.

### 4.4 `GET /version`
Python-side version and model runtime status.

### 4.5 `POST /predict`
Direct inference endpoint (normally called by Node gateway).

- Content type: `multipart/form-data`
- File field name: `file`

## 5. Contract Notes

- Python backend runs in strict startup mode: missing/invalid `MODEL_PATH` prevents process startup.
- Frontend should check `/api/readyz` before enabling analyze actions.
- This project is for demo/research workflow and is not a medical diagnosis tool.
