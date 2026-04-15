"""
Experimental audio quality assessment utilities.

Not integrated into production inference flow.
"""

from dataclasses import dataclass
import numpy as np


@dataclass
class AudioQualityMetrics:
  snr: float
  clipping_ratio: float
  quality_score: float


def estimate_quality(audio: np.ndarray) -> AudioQualityMetrics:
  if audio.size == 0:
    return AudioQualityMetrics(snr=0.0, clipping_ratio=1.0, quality_score=0.0)
  peak = float(np.max(np.abs(audio)))
  rms = float(np.sqrt(np.mean(audio**2))) if audio.size else 0.0
  snr = 20 * np.log10((peak + 1e-8) / (rms + 1e-8))
  clipping_ratio = float(np.mean(np.abs(audio) >= 0.99))
  quality_score = float(np.clip((snr + 20) * (1 - clipping_ratio), 0, 100))
  return AudioQualityMetrics(snr=snr, clipping_ratio=clipping_ratio, quality_score=quality_score)

