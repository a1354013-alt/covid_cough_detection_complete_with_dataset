"""COVID-19 Cough Detection Python Package"""

__version__ = "1.0.0"
__author__ = "COVID Detection Team"

from .audio_processor import AudioProcessor, create_audio_processor
from .model_inference import ModelInference, create_model_inference

__all__ = [
    "AudioProcessor",
    "create_audio_processor",
    "ModelInference",
    "create_model_inference",
]
