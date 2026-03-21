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

from audio_processor import AudioProcessor
from model_inference import ModelInference

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
        logger.info("  Using stub model (demo mode)")

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
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
# Note: allow_origins=["*"] with allow_credentials=True is not valid per CORS spec
# Using allow_credentials=False with wildcard origins for maximum compatibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (credentials not needed for same-origin proxy)
    allow_credentials=False,  # Credentials handled at proxy level (server/index.ts)
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
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
    timestamp: str


class VersionResponse(BaseModel):
    """Version information response."""

    api_version: str
    model_version: str
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
    """Health check endpoint."""
    # ✅ 改進：使用 timezone-aware datetime
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/version", response_model=VersionResponse)
async def get_version():
    """Get API and model version information."""
    # ✅ 改進：使用 timezone-aware datetime
    return {
        "api_version": "1.0.0",
        "model_version": model_inference.model_version if model_inference else "unknown",
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
        "version": "1.0.0",
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
