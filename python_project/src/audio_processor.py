"""
Audio Processing Module

Handles audio file loading, preprocessing, and feature extraction for COVID-19 cough detection.
Supports multiple audio formats and feature extraction methods.
"""

import io
import logging
from typing import Tuple, Optional, Dict, Any

import numpy as np
import librosa
from scipy import signal

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
        """
        Initialize audio processor.

        Args:
            sample_rate: Target sample rate in Hz
            duration: Target duration in seconds
            n_mfcc: Number of MFCC coefficients
            n_mel: Number of mel bands
        """
        self.sample_rate = sample_rate
        self.duration = duration
        self.n_mfcc = n_mfcc
        self.n_mel = n_mel

    def load_audio(self, audio_data: bytes, original_sr: Optional[int] = None) -> np.ndarray:
        """
        Load audio from bytes.

        Args:
            audio_data: Audio file bytes
            original_sr: Original sample rate (if known)

        Returns:
            Audio time series resampled to target sample rate

        Raises:
            ValueError: If audio cannot be loaded
        """
        try:
            if not audio_data:
                raise ValueError("Empty audio payload")

            # Load audio from bytes
            y, sr = librosa.load(
                io.BytesIO(audio_data),
                sr=original_sr,
                mono=True,
            )

            if y.size == 0:
                raise ValueError("Decoded audio has zero samples")

            # Resample to target sample rate if needed
            if sr != self.sample_rate:
                y = librosa.resample(y, orig_sr=sr, target_sr=self.sample_rate)

            logger.info(f"Loaded audio: {len(y)} samples at {self.sample_rate} Hz")
            return y

        except Exception as e:
            logger.error(f"Failed to load audio: {str(e)}")
            raise ValueError(f"Failed to load audio: {str(e)}")

    def preprocess_audio(self, y: np.ndarray) -> np.ndarray:
        """
        Preprocess audio signal.

        Args:
            y: Audio time series

        Returns:
            Preprocessed audio

        Processes:
        - Trim silence
        - Normalize amplitude
        - Pad/truncate to fixed duration
        """
        if y.size == 0:
            raise ValueError("Cannot preprocess empty audio array")

        # Trim silence
        y_trimmed, _ = librosa.effects.trim(y, top_db=40)
        if y_trimmed.size == 0:
            raise ValueError("Audio contains silence only after trimming")

        peak = np.max(np.abs(y_trimmed))
        if peak <= 1e-8:
            raise ValueError("Audio signal amplitude is too low for reliable inference")

        # Normalize amplitude
        y_normalized = y_trimmed / peak

        # Pad or truncate to fixed duration
        n_samples = self.sample_rate * self.duration
        min_required_samples = max(int(self.sample_rate * 0.25), 1)
        if len(y_normalized) < min_required_samples:
            raise ValueError(
                f"Audio too short for analysis. Minimum required duration is {min_required_samples / self.sample_rate:.2f}s"
            )

        if len(y_normalized) < n_samples:
            # Pad with zeros
            y_padded = np.pad(y_normalized, (0, n_samples - len(y_normalized)), mode="constant")
        else:
            # Truncate
            y_padded = y_normalized[:n_samples]

        logger.info(f"Preprocessed audio: {len(y_padded)} samples")
        return y_padded

    def extract_mfcc(self, y: np.ndarray) -> np.ndarray:
        """
        Extract MFCC features.

        Args:
            y: Audio time series

        Returns:
            MFCC features (n_mfcc, time_steps)
        """
        mfcc = librosa.feature.mfcc(
            y=y,
            sr=self.sample_rate,
            n_mfcc=self.n_mfcc,
            n_fft=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )

        logger.info(f"Extracted MFCC: {mfcc.shape}")
        return mfcc

    def extract_mel_spectrogram(self, y: np.ndarray) -> np.ndarray:
        """
        Extract mel-spectrogram features.

        Args:
            y: Audio time series

        Returns:
            Mel-spectrogram (n_mel, time_steps)
        """
        mel_spec = librosa.feature.melspectrogram(
            y=y,
            sr=self.sample_rate,
            n_mels=self.n_mel,
            n_fft=self.N_FFT,
            hop_length=self.HOP_LENGTH,
        )

        # Convert to dB scale
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)

        logger.info(f"Extracted mel-spectrogram: {mel_spec_db.shape}")
        return mel_spec_db

    def extract_features(self, y: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Extract all features from audio.

        Args:
            y: Audio time series

        Returns:
            Dictionary with feature arrays
        """
        features = {
            "mfcc": self.extract_mfcc(y),
            "mel_spectrogram": self.extract_mel_spectrogram(y),
        }

        return features

    def process_audio_file(self, audio_data: bytes) -> Dict[str, Any]:
        """
        Complete audio processing pipeline.

        Args:
            audio_data: Audio file bytes

        Returns:
            Dictionary with processed audio and features

        Raises:
            ValueError: If processing fails
        """
        try:
            # Load audio
            y = self.load_audio(audio_data)

            # Preprocess
            y_processed = self.preprocess_audio(y)

            # Extract features
            features = self.extract_features(y_processed)

            return {
                "audio": y_processed,
                "features": features,
                "sample_rate": self.sample_rate,
                "duration": self.duration,
            }

        except Exception as e:
            logger.error(f"Audio processing failed: {str(e)}")
            raise


def create_audio_processor(**kwargs) -> AudioProcessor:
    """Factory function to create audio processor with custom parameters."""
    return AudioProcessor(**kwargs)
