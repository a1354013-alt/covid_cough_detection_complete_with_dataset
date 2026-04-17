# Python Backend (FastAPI Inference Service)

This service performs audio preprocessing and model inference for cough risk signal analysis.

## Strict Startup Contract

- Service runs in strict startup mode.
- `MODEL_PATH` is mandatory.
- Missing or invalid model causes startup failure (fail-fast).
- No demo/stub prediction fallback is available in this backend.
- Repository does not bundle a production `model.pt`; provide your own artifact.

## Setup

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate

pip install -r requirements.txt
pip install -r requirements-dev.txt
```

Preferred (single source of truth: `pyproject.toml`):

```bash
pip install -e ".[dev]"
```

## Requirements

- Python 3.10+
- PyTorch 2.0+
- CUDA/CPU compatible

## Run

```bash
set MODEL_PATH=./models/model.pt
set MODEL_DEVICE=auto
# macOS/Linux: export MODEL_PATH=./models/model.pt
python -m uvicorn covid_cough_detection.app:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints

- `GET /healthz` - liveness
- `GET /readyz` - readiness (model-loaded gate)
- `GET /health` - backward-compatible readiness mirror
- `GET /version` - API/model version + readiness state
- `POST /predict` (`multipart/form-data`, field: `file`)

Prediction success response:

```json
{
  "label": "positive",
  "prob": 0.82,
  "model_version": "checkpoint-2026.04",
  "processing_time_ms": 214.3
}
```

Error response contract:

```json
{
  "error": "Human readable summary",
  "details": "Optional extra context"
}
```

## Model Version Contract

- `model_version` is read from checkpoint metadata when available.
- Accepted metadata keys include:
  - top-level `model_version` / `version`
  - `metadata.model_version` / `metadata.version`
- If no metadata is found, fallback is `"unknown"`.

## Environment Variables

- `MODEL_PATH`: path to trained model file (**required**)
- `MODEL_DEVICE`: `auto|cpu|cuda` (default `auto`)
- `ALLOWED_ORIGINS`: comma-separated CORS origins (`*` by default)

## Validation

```bash
python -m pytest tests -q
python -m compileall src/covid_cough_detection
```

This backend is for research/demo risk signaling and is **not** a medical diagnosis service.
