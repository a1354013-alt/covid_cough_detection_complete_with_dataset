"""
Model Inference Module

Handles model loading and inference for COVID-19 cough detection.
Supports multiple model architectures and provides confidence scoring.

IMPORTANT: This module operates in STRICT MODE.
- No stub/demo models in production
- Model must be successfully loaded or service returns error
- /predict endpoint requires valid model
"""

import logging
from typing import Dict, Tuple, Optional
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)


class SimpleConvNet(nn.Module):
    """Simple Convolutional Neural Network for audio classification."""

    def __init__(self, input_channels: int = 1, num_classes: int = 2):
        """
        Initialize CNN.

        Args:
            input_channels: Number of input channels (1 for mono)
            num_classes: Number of output classes (2 for binary classification)
        """
        super().__init__()

        self.conv1 = nn.Conv2d(input_channels, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)

        self.pool = nn.MaxPool2d(2, 2)
        self.relu = nn.ReLU()

        # Adaptive pooling to handle variable input sizes
        self.adaptive_pool = nn.AdaptiveAvgPool2d((1, 1))

        self.fc1 = nn.Linear(128, 64)
        self.fc2 = nn.Linear(64, num_classes)
        self.dropout = nn.Dropout(0.5)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass."""
        x = self.relu(self.conv1(x))
        x = self.pool(x)

        x = self.relu(self.conv2(x))
        x = self.pool(x)

        x = self.relu(self.conv3(x))
        x = self.pool(x)

        x = self.adaptive_pool(x)
        x = x.view(x.size(0), -1)

        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)

        return x


class ModelInference:
    """Handle model loading and inference in STRICT MODE."""

    def __init__(self, model_path: Optional[str] = None, device: Optional[str] = None):
        """
        Initialize model inference.

        STRICT MODE: Model must be successfully loaded or initialization fails.

        Args:
            model_path: Path to saved model (required in production)
            device: Device to run model on ('cpu' or 'cuda')

        Raises:
            RuntimeError: If model_path not provided or model fails to load
        """
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.model_version = None
        self.is_ready = False
        self.error_message = None

        # ✅ 嚴格模式：沒有 model_path 直接失敗
        if not model_path:
            error_msg = (
                "MODEL_PATH environment variable not set. "
                "Strict mode requires a valid model path. "
                "Service cannot start without a trained model."
            )
            logger.error(error_msg)
            self.error_message = error_msg
            self.is_ready = False
            return

        # ✅ 嚴格模式：model_path 不存在直接失敗
        if not Path(model_path).exists():
            error_msg = f"Model file not found at {model_path}. Service cannot start."
            logger.error(error_msg)
            self.error_message = error_msg
            self.is_ready = False
            return

        # ✅ 嚴格模式：model load 失敗直接失敗
        try:
            self.load_model(model_path)
            self.is_ready = True
        except Exception as e:
            error_msg = f"Failed to load model: {str(e)}"
            logger.error(error_msg)
            self.error_message = error_msg
            self.is_ready = False

    def load_model(self, model_path: str) -> None:
        """
        Load model from file.

        Supports multiple checkpoint formats:
        - state_dict: torch.save(model.state_dict(), path)
        - full model: torch.save(model, path)
        - checkpoint dict with keys like 'state_dict', 'model_state_dict', 'model'

        Args:
            model_path: Path to saved model

        Raises:
            FileNotFoundError: If model file not found
            RuntimeError: If model loading fails
        """
        try:
            path = Path(model_path)
            if not path.exists():
                raise FileNotFoundError(f"Model file not found: {model_path}")

            loaded = torch.load(model_path, map_location=self.device)

            # ✅ 改進：支援多種 checkpoint 格式
            state_dict = None

            if isinstance(loaded, dict):
                # 檢查常見的 checkpoint key
                checkpoint_keys = [
                    "model_state_dict",  # 常見的 checkpoint 格式
                    "state_dict",        # PyTorch Lightning 格式
                    "model",             # 另一種常見格式
                ]

                # 嘗試找到 state_dict
                for key in checkpoint_keys:
                    if key in loaded:
                        state_dict = loaded[key]
                        logger.info(f"Found state_dict under key '{key}'")
                        break

                # 如果沒找到特定 key，檢查是否整個 dict 就是 state_dict
                if state_dict is None:
                    # 檢查 dict 的 value 是否都是 tensor（state_dict 的特徵）
                    if all(isinstance(v, (torch.Tensor, torch.nn.Parameter)) for v in loaded.values()):
                        state_dict = loaded
                        logger.info("Treating entire dict as state_dict")
                    else:
                        # 可能是包含其他信息的 checkpoint，嘗試直接作為模型
                        logger.warning("Dict does not appear to be a state_dict, attempting to load as full model")
                        self.model = loaded
                        self.model.to(self.device)
                        self.model.eval()
                        self.model_version = "trained-1.0"
                        logger.info(f"Successfully loaded model from {model_path}")
                        return

                # 加載 state_dict
                if state_dict is not None:
                    logger.info("Loading model from state_dict")
                    self.model = SimpleConvNet(input_channels=1, num_classes=2)
                    self.model.load_state_dict(state_dict)
            else:
                # 直接是模型
                logger.info("Loading full model")
                self.model = loaded

            self.model.to(self.device)
            self.model.eval()
            self.model_version = "trained-1.0"

            logger.info(f"Successfully loaded model from {model_path}")

        except FileNotFoundError as e:
            logger.error(f"Model file not found: {model_path}")
            raise
        except Exception as e:
            logger.error(
                f"Failed to load model: {str(e)}. "
                f"Ensure the file is a valid PyTorch model, state_dict, or checkpoint."
            )
            raise RuntimeError(f"Model loading failed: {str(e)}")

    def predict(self, features: np.ndarray) -> Tuple[str, float]:
        """
        Make prediction on audio features.

        Args:
            features: Audio features (e.g., mel-spectrogram) with shape (1, channels, height, width)

        Returns:
            Tuple of (label, probability)
            - label: "positive" or "negative"
            - probability: confidence score (0-1)

        Raises:
            RuntimeError: If model not ready
            ValueError: If features have invalid shape
        """
        # ✅ 嚴格模式：model 不 ready 直接拒絕
        if not self.is_ready or self.model is None:
            raise RuntimeError(
                "Model not ready. Service cannot process predictions. "
                f"Error: {self.error_message}"
            )

        try:
            # Ensure features are in correct format
            if features.ndim == 2:
                # Add batch and channel dimensions
                features = features[np.newaxis, np.newaxis, :, :]
            elif features.ndim == 3:
                # Add batch dimension
                features = features[np.newaxis, :, :, :]

            # Convert to tensor
            features_tensor = torch.from_numpy(features).float().to(self.device)

            # Run inference
            with torch.no_grad():
                logits = self.model(features_tensor)
                probabilities = torch.softmax(logits, dim=1)

            # Get prediction
            pred_class = torch.argmax(probabilities, dim=1).item()
            confidence = probabilities[0, pred_class].item()

            label = "positive" if pred_class == 1 else "negative"

            logger.info(f"Prediction: {label} (confidence: {confidence:.2%})")

            return label, float(confidence)

        except Exception as e:
            logger.error(f"Prediction failed: {str(e)}")
            raise ValueError(f"Prediction failed: {str(e)}")

    def predict_batch(self, features_list: list) -> list:
        """
        Make batch predictions.

        Args:
            features_list: List of audio features

        Returns:
            List of (label, probability) tuples
        """
        # ✅ 嚴格模式：model 不 ready 直接拒絕
        if not self.is_ready or self.model is None:
            raise RuntimeError("Model not ready for batch prediction")

        results = []
        for features in features_list:
            label, confidence = self.predict(features)
            results.append({"label": label, "confidence": confidence})

        return results

    def get_status(self) -> Dict:
        """
        Get model status for health checks.

        Returns:
            Dict with model status information
        """
        return {
            "is_ready": self.is_ready,
            "model_version": self.model_version,
            "device": self.device,
            "error": self.error_message,
        }
