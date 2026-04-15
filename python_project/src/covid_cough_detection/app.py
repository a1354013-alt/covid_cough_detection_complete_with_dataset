"""
FastAPI service for COVID-19 cough prediction.

Deployment contract:
- Strict startup mode: the process exits if MODEL_PATH is missing/invalid.
- /healthz is liveness for an already-started process.
- /readyz mirrors model readiness and should be green after strict startup.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import os
import time
from typing import Any, Literal, Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from .audio_processor import AudioProcessor
from .model_inference import ModelInference
from .version import API_VERSION, APP_VERSION

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

audio_processor: Optional[AudioProcessor] = None
model_inference: Optional[ModelInference] = None


class PredictionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    label: Literal["positive", "negative"]
    prob: float
    model_version: str
    processing_time_ms: float


class ErrorResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    error: str
    details: Optional[str] = None


class HealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: Literal["ready", "degraded"]
    model_loaded: bool
    model_version: Optional[str] = None
    device: str
    error: Optional[str] = None
    timestamp: str


class VersionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    api_version: str
    model_version: Optional[str] = None
    model_ready: bool
    device: str
    timestamp: str


@asynccontextmanager
async def lifespan(_: FastAPI):
    global audio_processor, model_inference

    logger.info("Starting COVID-19 Cough Detection API")
    audio_processor = AudioProcessor(sample_rate=16000, duration=10, n_mfcc=13, n_mel=64)

    model_path = os.getenv("MODEL_PATH")
    model_inference = ModelInference(model_path=model_path, device="cpu")
    logger.info("Model loaded successfully from %s", model_path)

    yield

    logger.info("Shutting down COVID-19 Cough Detection API")


app = FastAPI(
    title="COVID-19 Cough Signal API",
    description="Research API for cough risk signal estimation (not medical diagnosis)",
    version=APP_VERSION,
    lifespan=lifespan,
)


def error_response(status_code: int, error: str, details: Optional[str] = None) -> JSONResponse:
    payload: dict[str, str] = {"error": error}
    if details:
        payload["details"] = details
    return JSONResponse(status_code=status_code, content=payload)


def normalize_exception_detail(detail: Any) -> tuple[str, Optional[str]]:
    if isinstance(detail, dict):
        error = detail.get("error")
        details = detail.get("details")
        if isinstance(error, str) and error:
            return error, details if isinstance(details, str) and details else None
        if isinstance(details, str) and details:
            return details, None
        return "Request failed", None

    if isinstance(detail, list):
        return "Invalid request payload", str(detail)

    if isinstance(detail, str) and detail:
        return detail, None

    return "Request failed", None


allowed_origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=3600,
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    error, details = normalize_exception_detail(exc.detail)
    return error_response(exc.status_code, error, details)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_: Request, exc: RequestValidationError):
    return error_response(400, "Invalid request payload", str(exc.errors()))


@app.exception_handler(Exception)
async def unexpected_exception_handler(_: Request, exc: Exception):
    logger.exception("Unhandled API error", exc_info=exc)
    return error_response(500, "Internal server error", "Unexpected backend failure")


@app.get("/healthz")
async def healthz():
    return {
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/readyz", response_model=HealthResponse)
async def readyz():
    if model_inference is None:
        response_data = {
            "status": "degraded",
            "model_loaded": False,
            "model_version": None,
            "device": "cpu",
            "error": "Inference service not initialized",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return JSONResponse(status_code=503, content=response_data)

    status = model_inference.get_status()
    response_data = {
        "status": "ready" if status["is_ready"] else "degraded",
        "model_loaded": bool(status["is_ready"]),
        "model_version": status["model_version"],
        "device": status["device"],
        "error": status["error"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if not status["is_ready"]:
        return JSONResponse(status_code=503, content=response_data)
    return response_data


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return await readyz()


@app.get("/version", response_model=VersionResponse)
async def get_version():
    if model_inference is None:
        raise HTTPException(status_code=503, detail="Inference service not initialized")

    status = model_inference.get_status()
    return {
        "api_version": API_VERSION,
        "model_version": status["model_version"],
        "model_ready": status["is_ready"],
        "device": status["device"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict(file: UploadFile = File(...)):
    start_time = time.time()

    if audio_processor is None or model_inference is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    audio_data = await file.read()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(audio_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")

    try:
        processed = audio_processor.process_audio_file(audio_data)
        mel_spec = processed["features"]["mel_spectrogram"]
        label, prob = model_inference.predict(mel_spec)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Prediction processing failed")
        raise HTTPException(
            status_code=500,
            detail="Prediction processing failed. Please verify audio format and quality.",
        ) from exc

    processing_time = (time.time() - start_time) * 1000
    return {
        "label": label,
        "prob": prob,
        "model_version": model_inference.model_version or "unknown",
        "processing_time_ms": processing_time,
    }


@app.get("/")
async def root():
    return {
        "name": "COVID-19 Cough Signal API",
        "version": APP_VERSION,
        "endpoints": {
            "healthz": "/healthz",
            "readyz": "/readyz",
            "version": "/version",
            "predict": "/predict",
            "docs": "/docs",
        },
    }
