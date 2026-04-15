"""
Experimental patient history tracking.

Not integrated with the production prediction API.
"""

from dataclasses import dataclass
from typing import List


@dataclass
class PredictionRecord:
  timestamp: str
  probability: float
  confidence: float


class InMemoryHistoryTracker:
  def __init__(self) -> None:
    self._records: List[PredictionRecord] = []

  def add(self, record: PredictionRecord) -> None:
    self._records.append(record)

  def list_all(self) -> List[PredictionRecord]:
    return list(self._records)

