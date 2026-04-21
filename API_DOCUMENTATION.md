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
  "processing_time_ms": 187,
  "model_processing_time_ms": 123.4,
  "cached": false,
  "request_id": "req_abc123_xyz789"
}
```

The `request_id` field enables request tracing and can be used to look up the inference in the history endpoint.

Timing fields:
- `processing_time_ms`: gateway-measured end-to-end request time (includes cache lookup + network).
- `model_processing_time_ms`: Python-reported model inference time (available for both cache hits and misses).
- `cached`: `true` when the response is served from the prediction cache.

Gateway response-code mapping:
- `400`: bad multipart/input/format mismatch
- `413`: payload too large
- `429`: rate-limit exceeded
- `500`: inference backend internal error
- `502`: invalid backend prediction payload (including `prob` out of `0..1` or negative `processing_time_ms`)
- `503`: backend degraded/unavailable

### `GET /api/history` (Portfolio Feature)
Returns recent inference history for demonstration purposes.

Query parameters:
- `limit` (optional): Number of records to return (default: 10, max: 50)

Success `200`:

```json
{
  "count": 3,
  "records": [
    {
      "requestId": "req_abc123_xyz789",
      "timestamp": "2026-04-10T00:00:00.000Z",
      "filename": "cough_sample.wav",
      "label": "positive",
      "confidence": 0.84,
      "processingTimeMs": 123,
      "clientIp": "127.0.0.1"
    }
  ]
}
```

### `GET /api/status` (Portfolio Feature)
Returns system status dashboard data including aggregate metrics.

Success `200`:

```json
{
  "status": "operational",
  "timestamp": "2026-04-10T00:00:00.000Z",
  "uptime_ms": 3600000,
  "metrics": {
    "totalRequests": 42,
    "avgLatencyMs": 156,
    "positiveCount": 18,
    "negativeCount": 24,
    "positivityRate": 43
  },
  "rateLimit": {
    "windowMs": 60000,
    "maxRequests": 30
  },
  "version": "1.0.13"
}
```

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
