"""
Model loading and inference for COVID-19 cough detection.

Strict mode contract:
- A real model file is required.
- The process fails during startup if the model cannot be loaded.
- /predict never uses demo fallback.
"""

from pathlib import Path
import logging
from typing import Any, Dict, Mapping, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)
DEFAULT_MODEL_VERSION = "unknown"


class SimpleConvNet(nn.Module):
    """Simple CNN baseline for audio classification."""

    def __init__(self, input_channels: int = 1, num_classes: int = 2):
        super().__init__()
        self.conv1 = nn.Conv2d(input_channels, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.relu = nn.ReLU()
        self.adaptive_pool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc1 = nn.Linear(128, 64)
        self.fc2 = nn.Linear(64, num_classes)
        self.dropout = nn.Dropout(0.5)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.pool(self.relu(self.conv1(x)))
        x = self.pool(self.relu(self.conv2(x)))
        x = self.pool(self.relu(self.conv3(x)))
        x = self.adaptive_pool(x)
        x = x.view(x.size(0), -1)
        x = self.dropout(self.relu(self.fc1(x)))
        return self.fc2(x)


class ModelInference:
    """Model loader/inference facade in strict startup mode."""

    def __init__(self, model_path: Optional[str] = None, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[nn.Module] = None
        self.model_version: Optional[str] = None
        self.is_ready = False
        self.error_message: Optional[str] = None

        if not model_path:
            raise RuntimeError(
                "MODEL_PATH environment variable is required in strict mode. "
                "The service cannot start without a trained model."
            )

        if not Path(model_path).exists():
            raise RuntimeError(
                f"Model file not found at '{model_path}'. "
                "Provide a valid model file before starting the service."
            )

        self.load_model(model_path)
        self.is_ready = True

    def load_model(self, model_path: str) -> None:
        """Load a PyTorch model/checkpoint file."""
        try:
            loaded = self._load_checkpoint(model_path)
            state_dict: Optional[Dict[str, torch.Tensor]] = None

            if isinstance(loaded, dict):
                for key in ("model_state_dict", "state_dict", "model"):
                    candidate = loaded.get(key)
                    if isinstance(candidate, dict):
                        state_dict = candidate
                        logger.info("Loaded state dict from checkpoint key '%s'", key)
                        break
                if state_dict is None and all(
                    isinstance(v, (torch.Tensor, torch.nn.Parameter))
                    for v in loaded.values()
                ):
                    state_dict = loaded  # type: ignore[assignment]

            if state_dict is not None:
                model = SimpleConvNet(input_channels=1, num_classes=2)
                model.load_state_dict(state_dict)
                self.model = model
            elif isinstance(loaded, nn.Module):
                self.model = loaded
            else:
                raise RuntimeError("Unsupported model file format")

            assert self.model is not None
            self.model.to(self.device)
            self.model.eval()
            self.model_version = self._extract_model_version(loaded) or DEFAULT_MODEL_VERSION
            self.error_message = None
            logger.info("Successfully loaded model from %s", model_path)
        except Exception as exc:
            self.is_ready = False
            self.error_message = str(exc)
            raise RuntimeError(f"Model loading failed: {exc}") from exc

    def _load_checkpoint(self, model_path: str) -> Any:
        """Load checkpoint with best-effort safer defaults."""
        try:
            return torch.load(model_path, map_location=self.device, weights_only=True)
        except TypeError:
            logger.debug("weights_only not supported by installed torch; using default torch.load")
            return torch.load(model_path, map_location=self.device)
        except RuntimeError as exc:
            logger.warning(
                "weights_only checkpoint load failed, falling back to default torch.load: %s",
                exc,
            )
            return torch.load(model_path, map_location=self.device)

    def _extract_model_version(self, loaded: Any) -> Optional[str]:
        if not isinstance(loaded, Mapping):
            return None

        direct_version = loaded.get("model_version") or loaded.get("version")
        if isinstance(direct_version, str) and direct_version:
            return direct_version

        metadata = loaded.get("metadata")
        if isinstance(metadata, Mapping):
            meta_version = metadata.get("model_version") or metadata.get("version")
            if isinstance(meta_version, str) and meta_version:
                return meta_version

        return None

    def predict(self, features: np.ndarray) -> Tuple[str, float]:
        if not self.is_ready or self.model is None:
            raise RuntimeError("Model is not ready for prediction")

        try:
            if features.ndim == 2:
                features = features[np.newaxis, np.newaxis, :, :]
            elif features.ndim == 3:
                features = features[np.newaxis, :, :, :]

            features_tensor = torch.from_numpy(features).float().to(self.device)

            with torch.no_grad():
                logits = self.model(features_tensor)
                probabilities = torch.softmax(logits, dim=1)

            pred_class = int(torch.argmax(probabilities, dim=1).item())
            confidence = float(probabilities[0, pred_class].item())
            label = "positive" if pred_class == 1 else "negative"
            return label, confidence
        except Exception as exc:
            raise ValueError(f"Prediction failed: {exc}") from exc

    def predict_batch(self, features_list: list[np.ndarray]) -> list[Dict[str, float | str]]:
        if not self.is_ready or self.model is None:
            raise RuntimeError("Model not ready for batch prediction")
        results: list[Dict[str, float | str]] = []
        for features in features_list:
            label, confidence = self.predict(features)
            results.append({"label": label, "confidence": confidence})
        return results

    def get_status(self) -> Dict[str, Optional[str] | bool]:
        return {
            "is_ready": self.is_ready,
            "model_version": self.model_version,
            "device": self.device,
            "error": self.error_message,
        }


def create_model_inference(
    model_path: Optional[str] = None,
    device: Optional[str] = None,
) -> ModelInference:
    """Factory helper for parity with other modules."""
    return ModelInference(model_path=model_path, device=device)
