from .version import APP_VERSION, API_VERSION
"""
FastAPI Application for COVID-19 Cough Detection

Provides REST API endpoints for audio upload, processing, and inference.
"""

import logging
import os
import time
from typing import Optional
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from .audio_processor import AudioProcessor
from .model_inference import ModelInference

# ============================================================================
# Logging Setup
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ============================================================================
# Global State
# ============================================================================

audio_processor: Optional[AudioProcessor] = None
model_inference: Optional[ModelInference] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown."""
    # Startup
    global audio_processor, model_inference

    logger.info("Starting COVID-19 Cough Detection API...")

    audio_processor = AudioProcessor(
        sample_rate=16000,
        duration=10,
        n_mfcc=13,
        n_mel=64,
    )
    logger.info("✓ Audio processor initialized")

    # Load model path from environment variable (optional)
    model_path = os.getenv("MODEL_PATH")
    model_inference = ModelInference(model_path=model_path, device="cpu")
    logger.info("✓ Model inference initialized")
    if model_path:
        logger.info(f"  Model path: {model_path}")
    else:
        logger.info("  Model not ready - service in strict mode")

    logger.info("API startup complete")

    yield

    # Shutdown
    logger.info("Shutting down COVID-19 Cough Detection API...")
    logger.info("API shutdown complete")


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="COVID-19 Cough Detection API",
    description="AI-powered COVID-19 detection from cough audio",
    version=APP_VERSION,
    lifespan=lifespan,
)

# ✅ CORS configuration from environment
import os
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # Credentials handled at proxy level (server/index.ts)
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# ============================================================================
# Request/Response Models
# ============================================================================


class PredictionResponse(BaseModel):
    """Prediction response model."""

    label: str  # "positive" or "negative"
    prob: float  # Probability (0-1)
    model_version: str
    processing_time_ms: float


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    model_loaded: bool
    model_version: Optional[str] = None
    device: str
    error: Optional[str] = None
    timestamp: str


class VersionResponse(BaseModel):
    """Version information response."""

    api_version: str
    model_version: Optional[str] = None
    model_ready: bool
    device: str
    timestamp: str


class ErrorResponse(BaseModel):
    """Error response."""

    error: str
    details: Optional[str] = None


# ============================================================================
# Health & Info Endpoints
# ============================================================================


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint - returns real model status.
    
    Returns:
    - 200 OK: Model is loaded and ready
    - 503 Service Unavailable: Model is not ready
    
    Used by Docker/K8s health checks to determine if container is ready.
    """
    # ✅ 使用 model_inference.get_status() 獲取真實狀態
    status = model_inference.get_status()
    
    response_data = {
        "status": "ok" if status["is_ready"] else "degraded",
        "model_loaded": status["is_ready"],
        "model_version": status["model_version"],
        "device": status["device"],
        "error": status["error"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    
    # ✅ 後端不準備時回傳 503，不是 200
    if not status["is_ready"]:
        raise HTTPException(
            status_code=503,
            detail=response_data
        )
    
    return response_data


@app.get("/version", response_model=VersionResponse)
async def get_version():
    """Get API and model version information."""
    # ✅ 使用真實的 model 狀態
    status = model_inference.get_status()
    
    return {
        "api_version": API_VERSION,
        "model_version": status["model_version"],
        "model_ready": status["is_ready"],
        "device": status["device"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================================
# Prediction Endpoint
# ============================================================================


@app.post("/predict", response_model=PredictionResponse)
async def predict(file: UploadFile = File(...)):
    """
    Predict COVID-19 infection from cough audio.

    Args:
        file: Audio file (WAV, MP3, WebM, etc.)

    Returns:
        Prediction result with confidence score

    Raises:
        HTTPException: If processing or inference fails
    """
    start_time = time.time()

    try:
        if not audio_processor or not model_inference:
            raise HTTPException(status_code=503, detail="Service not initialized")

        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        # Read file
        logger.info(f"Processing file: {file.filename}")
        audio_data = await file.read()

        if not audio_data:
            raise HTTPException(status_code=400, detail="Empty file")

        if len(audio_data) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=413, detail="File too large (max 10MB)")

        # Process audio
        logger.info(f"Audio file size: {len(audio_data)} bytes")
        processed = audio_processor.process_audio_file(audio_data)

        # Extract features for inference
        mel_spec = processed["features"]["mel_spectrogram"]

        # Run inference
        label, prob = model_inference.predict(mel_spec)

        processing_time = (time.time() - start_time) * 1000  # Convert to ms

        logger.info(
            f"Prediction complete: {label} ({prob:.2%}) in {processing_time:.1f}ms"
        )

        return {
            "label": label,
            "prob": prob,
            "model_version": model_inference.model_version,
            "processing_time_ms": processing_time,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        # ✅ 改進：不直接暴露異常信息，改為更通用的錯誤訊息
        raise HTTPException(
            status_code=500,
            detail="Prediction processing failed. Please check the audio file and try again."
        )


# ============================================================================
# Root Endpoint
# ============================================================================


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "COVID-19 Cough Detection API",
        "version": APP_VERSION,
        "endpoints": {
            "health": "/health",
            "version": "/version",
            "predict": "/predict",
            "docs": "/docs",
        },
    }


# ============================================================================
# Main
# ============================================================================


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
