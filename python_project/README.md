# Python Backend (FastAPI Inference Service)

This service performs audio preprocessing and model inference for the cough detection system.

## Strict Startup Contract

- The service runs in strict mode.
- `MODEL_PATH` is mandatory.
- If the model file is missing or cannot be loaded, process startup fails immediately.
- There is no demo/stub prediction fallback in this backend.
- This repository does not bundle a production `model.pt`; provide it yourself.

## Setup

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

## Run

```bash
set MODEL_PATH=./models/model.pt
# macOS/Linux: export MODEL_PATH=./models/model.pt
python -m uvicorn src.app:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints

- `GET /healthz` - liveness
- `GET /readyz` - readiness (model loaded)
- `GET /readyz` returns a consistent JSON shape for both `200` and `503`
- `GET /health` - backward-compatible readiness mirror
- `GET /version`
- `POST /predict` (`multipart/form-data`, field: `file`)

Prediction response:

```json
{
  "label": "positive",
  "prob": 0.82,
  "model_version": "trained-1.0",
  "processing_time_ms": 214.3
}
```

## Environment Variables

- `MODEL_PATH`: path to trained model file
- `ALLOWED_ORIGINS`: comma-separated CORS origins (`*` by default)

## Validation

```bash
python -m compileall src
```
