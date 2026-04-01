"""COVID-19 Cough Detection Python Package"""

from .version import APP_VERSION

__version__ = APP_VERSION
__author__ = "COVID Detection Team"

from .audio_processor import AudioProcessor, create_audio_processor
from .model_inference import ModelInference, create_model_inference

__all__ = [
    "AudioProcessor",
    "create_audio_processor",
    "ModelInference",
    "create_model_inference",
]
