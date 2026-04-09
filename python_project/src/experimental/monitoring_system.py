"""
Experimental monitoring helpers (not part of runtime contract).
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass
class MonitoringSnapshot:
  timestamp: str
  message: str


def create_snapshot(message: str) -> MonitoringSnapshot:
  return MonitoringSnapshot(timestamp=datetime.utcnow().isoformat(), message=message)
