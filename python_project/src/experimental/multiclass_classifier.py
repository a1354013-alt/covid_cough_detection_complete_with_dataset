"""
Experimental multi-class disease classifier interfaces.

Production API currently exposes binary positive/negative prediction only.
"""

from dataclasses import dataclass
from typing import Dict


@dataclass
class MultiClassPrediction:
  primary_label: str
  confidence: float
  probabilities: Dict[str, float]


def not_integrated_notice() -> str:
  return "experimental-only: this classifier is not wired into /predict"
