import pytest
from fastapi import HTTPException
from pathlib import Path
import sys
import types
import numpy as np
import asyncio

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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import app as app_module


class _ReadyModel:
    def get_status(self):
        return {
            "is_ready": True,
            "model_version": "trained-1.0",
            "device": "cpu",
            "error": None,
        }


class _NotReadyModel:
    def get_status(self):
        return {
            "is_ready": False,
            "model_version": None,
            "device": "cpu",
            "error": "model unavailable",
        }


def test_healthz_contract():
    result = asyncio.run(app_module.healthz())
    assert result["status"] == "alive"
    assert "timestamp" in result


def test_readyz_ready_contract():
    original = app_module.model_inference
    app_module.model_inference = _ReadyModel()
    try:
        result = asyncio.run(app_module.readyz())
        assert result["status"] == "ready"
        assert result["model_loaded"] is True
    finally:
        app_module.model_inference = original


def test_readyz_not_ready_contract():
    original = app_module.model_inference
    app_module.model_inference = _NotReadyModel()
    try:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(app_module.readyz())
        assert exc.value.status_code == 503
    finally:
        app_module.model_inference = original


def test_version_contract():
    original = app_module.model_inference
    app_module.model_inference = _ReadyModel()
    try:
        result = asyncio.run(app_module.get_version())
        assert "api_version" in result
        assert result["model_ready"] is True
    finally:
        app_module.model_inference = original
