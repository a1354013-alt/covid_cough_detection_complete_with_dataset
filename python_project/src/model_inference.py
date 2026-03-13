"""
Model Inference Module

Handles model loading and inference for COVID-19 cough detection.
Supports multiple model architectures and provides confidence scoring.
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
    """Handle model loading and inference."""

    def __init__(self, model_path: Optional[str] = None, device: Optional[str] = None):
        """
        Initialize model inference.

        Args:
            model_path: Path to saved model (optional)
            device: Device to run model on ('cpu' or 'cuda')
        """
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.model_version = "stub-0.1"

        if model_path and Path(model_path).exists():
            self.load_model(model_path)
        else:
            logger.warning("No model path provided or model not found. Using stub model.")
            self._create_stub_model()

    def _create_stub_model(self) -> None:
        """Create a stub model for testing."""
        self.model = SimpleConvNet(input_channels=1, num_classes=2)
        self.model.to(self.device)
        self.model.eval()
        logger.info("Created stub CNN model")

    def load_model(self, model_path: str) -> None:
        """
        Load model from file.

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

            # Load model state dict
            self.model = SimpleConvNet(input_channels=1, num_classes=2)
            state_dict = torch.load(model_path, map_location=self.device)
            self.model.load_state_dict(state_dict)
            self.model.to(self.device)
            self.model.eval()

            logger.info(f"Loaded model from {model_path}")

        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            raise

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
            ValueError: If features have invalid shape
        """
        if self.model is None:
            raise RuntimeError("Model not initialized")

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
        Make predictions on multiple samples.

        Args:
            features_list: List of feature arrays

        Returns:
            List of (label, probability) tuples
        """
        results = []
        for features in features_list:
            label, prob = self.predict(features)
            results.append((label, prob))
        return results


def create_model_inference(model_path: Optional[str] = None) -> ModelInference:
    """Factory function to create model inference."""
    return ModelInference(model_path=model_path)
