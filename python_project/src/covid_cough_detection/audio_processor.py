"""
Audio Processing Module

Handles audio file loading, preprocessing, and feature extraction for COVID-19 cough detection.
Supports multiple audio formats and feature extraction methods.
"""

import io
import logging
from typing import Optional, Dict, Any

import numpy as np
import librosa

logger = logging.getLogger(__name__)


class AudioProcessor:
    """Process audio files and extract features for model inference."""

    # Audio processing constants
    SAMPLE_RATE = 16000  # 16 kHz
    DURATION = 10  # seconds
    N_MFCC = 13
    N_MEL = 64
    N_FFT = 2048
    HOP_LENGTH = 512

    def __init__(
        self,
        sample_rate: int = SAMPLE_RATE,
        duration: int = DURATION,
        n_mfcc: int = N_MFCC,
        n_mel: int = N_MEL,
    ):
        self.sample_rate = sample_rate
        self.duration = duration
        self.n_mfcc = n_mfcc
        self.n_mel = n_mel

    def load_audio(self, audio_data: bytes, original_sr: Optional[int] = None) -> np.ndarray:
        """
        Load audio from bytes.

        Raises:
            ValueError: If audio cannot be loaded
        """
        try:
            if not audio_data:
                raise ValueError("Empty audio payload")

            y, sr = librosa.load(
                io.BytesIO(audio_data),
                sr=original_sr,
                mono=True,
            )

            if y.size == 0:
                raise ValueError("Decoded audio has zero samples")

            if sr != self.sample_rate:
                y = librosa.resample(y, orig_sr=sr, target_sr=self.sample_rate)

            logger.info("Loaded audio: %s samples at %s Hz", len(y), self.sample_rate)
            return y

        except Exception as exc:
            logger.error("Failed to load audio: %s", str(exc))
            raise ValueError(f"Failed to load audio: {str(exc)}") from exc

    def preprocess_audio(self, y: np.ndarray) -> np.ndarray:
        if y.size == 0:
            raise ValueError("Cannot preprocess empty audio array")

        y_trimmed, _ = librosa.effects.trim(y, top_db=40)
        if y_trimmed.size == 0:
            raise ValueError("Audio contains silence only after trimming")

        peak = np.max(np.abs(y_trimmed))
        if peak <= 1e-8:
            raise ValueError("Audio signal amplitude is too low for reliable inference")

        y_normalized = y_trimmed / peak

        n_samples = self.sample_rate * self.duration
        min_required_samples = max(int(self.sample_rate * 0.25), 1)
        if len(y_normalized) < min_required_samples:
            raise ValueError(
                "Audio too short for analysis. Minimum required duration is "
                f"{min_required_samples / self.sample_rate:.2f}s"
            )

        if len(y_normalized) < n_samples:
            y_padded = np.pad(y_normalized, (0, n_samples - len(y_normalized)), mode="constant")
        else:
            y_padded = y_normalized[:n_samples]

        logger.info("Preprocessed audio: %s samples", len(y_padded))
        return y_padded

    def extract_mfcc(self, y: np.ndarray) -> np.ndarray:
        mfcc = librosa.feature.mfcc(
            y=y,
            sr=self.sample_rate,
            n_mfcc=self.n_mfcc,
            n_fft=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )

        logger.info("Extracted MFCC: %s", mfcc.shape)
        return mfcc

    def extract_mel_spectrogram(self, y: np.ndarray) -> np.ndarray:
        mel_spec = librosa.feature.melspectrogram(
            y=y,
            sr=self.sample_rate,
            n_mels=self.n_mel,
            n_fft=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )

        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)

        logger.info("Extracted mel-spectrogram: %s", mel_spec_db.shape)
        return mel_spec_db

    def extract_features(self, y: np.ndarray) -> Dict[str, np.ndarray]:
        return {
            "mfcc": self.extract_mfcc(y),
            "mel_spectrogram": self.extract_mel_spectrogram(y),
        }

    def process_audio_file(self, audio_data: bytes) -> Dict[str, Any]:
        y = self.load_audio(audio_data)
        y_processed = self.preprocess_audio(y)
        features = self.extract_features(y_processed)

        return {
            "audio": y_processed,
            "features": features,
            "sample_rate": self.sample_rate,
            "duration": self.duration,
        }


def create_audio_processor(**kwargs) -> AudioProcessor:
    return AudioProcessor(**kwargs)

