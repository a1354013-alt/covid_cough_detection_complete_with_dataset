from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.model_inference import DEFAULT_MODEL_VERSION, ModelInference  # noqa: E402


def test_model_inference_requires_model_path():
    with pytest.raises(RuntimeError, match="MODEL_PATH environment variable is required"):
        ModelInference(model_path=None, device="cpu")


def test_model_inference_requires_existing_file(tmp_path):
    missing_path = tmp_path / "missing-model.pt"

    with pytest.raises(RuntimeError, match="Model file not found"):
        ModelInference(model_path=str(missing_path), device="cpu")


def test_extract_model_version_prefers_checkpoint_metadata():
    inference = ModelInference.__new__(ModelInference)

    version = inference._extract_model_version(
        {
            "model_state_dict": {},
            "metadata": {
                "model_version": "checkpoint-2026.04",
            },
        }
    )

    assert version == "checkpoint-2026.04"


def test_extract_model_version_falls_back_to_unknown_when_missing_metadata():
    inference = ModelInference.__new__(ModelInference)

    version = inference._extract_model_version(
        {
            "state_dict": {},
        }
    )

    assert version is None
    assert DEFAULT_MODEL_VERSION == "unknown"
