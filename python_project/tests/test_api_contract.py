import asyncio
import io
import json
import sys
import types

import numpy as np
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.responses import JSONResponse
from starlette.requests import Request

if "librosa" not in sys.modules:
    fake_librosa = types.SimpleNamespace()
    fake_librosa.load = lambda *_args, **_kwargs: (np.zeros(1600, dtype=np.float32), 16000)
    fake_librosa.resample = lambda y, **_kwargs: y
    fake_librosa.effects = types.SimpleNamespace(trim=lambda y, top_db=40: (y, None))
    fake_librosa.feature = types.SimpleNamespace(
        mfcc=lambda **_kwargs: np.zeros((13, 10), dtype=np.float32),
        melspectrogram=lambda **_kwargs: np.zeros((64, 10), dtype=np.float32),
    )
    fake_librosa.power_to_db = lambda spec, ref=None: spec
    sys.modules["librosa"] = fake_librosa

from covid_cough_detection import app as app_module


class ReadyModel:
    model_version = "checkpoint-v2"

    def get_status(self):
        return {
            "is_ready": True,
            "model_version": self.model_version,
            "device": "cpu",
            "error": None,
        }

    def predict(self, _features):
        return "positive", 0.88


class NotReadyModel:
    def get_status(self):
        return {
            "is_ready": False,
            "model_version": None,
            "device": "cpu",
            "error": "model not loaded",
        }


class OkProcessor:
    def process_audio_file(self, _audio_data):
        return {"features": {"mel_spectrogram": np.zeros((64, 10), dtype=np.float32)}}


class ValueErrorProcessor:
    def process_audio_file(self, _audio_data):
        raise ValueError("Audio contains silence only after trimming")


def make_request(path: str = "/predict") -> Request:
    return Request({"type": "http", "method": "POST", "path": path, "headers": []})


def decode_json_response(response: JSONResponse) -> dict:
    return json.loads(response.body.decode("utf-8"))


def test_healthz_contract():
    result = asyncio.run(app_module.healthz())
    assert result["status"] == "alive"
    assert "timestamp" in result


def test_readyz_ready_contract(monkeypatch):
    monkeypatch.setattr(app_module, "model_inference", ReadyModel())

    result = asyncio.run(app_module.readyz())
    assert result["status"] == "ready"
    assert result["model_loaded"] is True
    assert result["model_version"] == "checkpoint-v2"


def test_readyz_degraded_contract(monkeypatch):
    monkeypatch.setattr(app_module, "model_inference", NotReadyModel())

    result = asyncio.run(app_module.readyz())
    assert isinstance(result, JSONResponse)
    assert result.status_code == 503

    payload = decode_json_response(result)
    assert payload["status"] == "degraded"
    assert payload["error"] == "model not loaded"
    assert "detail" not in payload


def test_version_contract(monkeypatch):
    monkeypatch.setattr(app_module, "model_inference", ReadyModel())

    result = asyncio.run(app_module.get_version())
    assert "api_version" in result
    assert result["model_ready"] is True
    assert result["model_version"] == "checkpoint-v2"


def test_version_not_initialized_uses_stable_error_shape(monkeypatch):
    monkeypatch.setattr(app_module, "model_inference", None)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(app_module.get_version())

    response = asyncio.run(
        app_module.http_exception_handler(make_request("/version"), exc_info.value)
    )
    payload = decode_json_response(response)

    assert response.status_code == 503
    assert payload["error"] == "Inference service not initialized"
    assert "detail" not in payload


def test_predict_success_contract(monkeypatch):
    monkeypatch.setattr(app_module, "audio_processor", OkProcessor())
    monkeypatch.setattr(app_module, "model_inference", ReadyModel())

    upload = UploadFile(filename="cough.wav", file=io.BytesIO(b"abc"))
    result = asyncio.run(app_module.predict(upload))

    assert result["label"] == "positive"
    assert isinstance(result["prob"], float)
    assert result["model_version"] == "checkpoint-v2"
    assert result["processing_time_ms"] >= 0


def test_predict_audio_validation_error_maps_to_http_400(monkeypatch):
    monkeypatch.setattr(app_module, "audio_processor", ValueErrorProcessor())
    monkeypatch.setattr(app_module, "model_inference", ReadyModel())

    upload = UploadFile(filename="cough.wav", file=io.BytesIO(b"abc"))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(app_module.predict(upload))

    response = asyncio.run(app_module.http_exception_handler(make_request(), exc_info.value))
    payload = decode_json_response(response)

    assert response.status_code == 400
    assert payload["error"] == "Audio contains silence only after trimming"
    assert "detail" not in payload


def test_predict_rejects_empty_file_with_stable_error_shape(monkeypatch):
    monkeypatch.setattr(app_module, "audio_processor", OkProcessor())
    monkeypatch.setattr(app_module, "model_inference", ReadyModel())

    upload = UploadFile(filename="empty.wav", file=io.BytesIO(b""))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(app_module.predict(upload))

    response = asyncio.run(app_module.http_exception_handler(make_request(), exc_info.value))
    payload = decode_json_response(response)

    assert response.status_code == 400
    assert payload["error"] == "Empty file"


def test_predict_rejects_missing_filename(monkeypatch):
    monkeypatch.setattr(app_module, "audio_processor", OkProcessor())
    monkeypatch.setattr(app_module, "model_inference", ReadyModel())

    upload = UploadFile(filename="", file=io.BytesIO(b"abc"))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(app_module.predict(upload))

    response = asyncio.run(app_module.http_exception_handler(make_request(), exc_info.value))
    payload = decode_json_response(response)

    assert response.status_code == 400
    assert payload["error"] == "No filename provided"


def test_predict_rejects_oversized_upload(monkeypatch):
    monkeypatch.setattr(app_module, "audio_processor", OkProcessor())
    monkeypatch.setattr(app_module, "model_inference", ReadyModel())

    oversized = io.BytesIO(b"a" * (10 * 1024 * 1024 + 1))
    upload = UploadFile(filename="big.wav", file=oversized)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(app_module.predict(upload))

    response = asyncio.run(app_module.http_exception_handler(make_request(), exc_info.value))
    payload = decode_json_response(response)

    assert response.status_code == 413
    assert "File too large" in payload["error"]


def test_predict_service_not_initialized_maps_to_stable_error_shape(monkeypatch):
    monkeypatch.setattr(app_module, "audio_processor", None)
    monkeypatch.setattr(app_module, "model_inference", None)

    upload = UploadFile(filename="cough.wav", file=io.BytesIO(b"abc"))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(app_module.predict(upload))

    response = asyncio.run(app_module.http_exception_handler(make_request(), exc_info.value))
    payload = decode_json_response(response)

    assert response.status_code == 503
    assert payload["error"] == "Service not initialized"
