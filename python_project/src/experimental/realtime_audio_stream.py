"""
Experimental real-time streaming prototype.

This module is intentionally not wired into production API routes.
It is retained for research iteration only.
"""

from dataclasses import dataclass
from queue import Queue
from typing import Optional
import threading
import time

import numpy as np
import torch


@dataclass
class StreamChunk:
  audio_data: np.ndarray
  timestamp: float
  chunk_id: int
  sample_rate: int


class RealtimeAudioProcessor:
  """
  Research-only helper for chunk-level model inference.
  """

  def __init__(self, feature_extractor, model) -> None:
    self.feature_extractor = feature_extractor
    self.model = model
    self.queue: "Queue[StreamChunk]" = Queue()
    self.result_queue: "Queue[dict]" = Queue()
    self.running = False
    self.worker: Optional[threading.Thread] = None

  def start(self) -> None:
    if self.running:
      return
    self.running = True
    self.worker = threading.Thread(target=self._loop, daemon=True)
    self.worker.start()

  def stop(self) -> None:
    self.running = False
    if self.worker:
      self.worker.join(timeout=2)

  def submit(self, chunk: StreamChunk) -> None:
    self.queue.put(chunk)

  def get_result(self, timeout: float = 0.5) -> Optional[dict]:
    try:
      return self.result_queue.get(timeout=timeout)
    except Exception:
      return None

  def _loop(self) -> None:
    while self.running:
      try:
        chunk = self.queue.get(timeout=0.1)
      except Exception:
        continue

      start = time.time()
      features = self.feature_extractor.extract(chunk.audio_data)
      with torch.no_grad():
        prediction = self.model.predict(features)

      self.result_queue.put(
        {
          "chunk_id": chunk.chunk_id,
          "timestamp": chunk.timestamp,
          "prediction": prediction,
          "processing_time": time.time() - start,
        }
      )
