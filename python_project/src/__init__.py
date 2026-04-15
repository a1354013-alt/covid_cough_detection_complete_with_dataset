"""
Compatibility shim.

The production Python package is `covid_cough_detection` (src-layout).
This module remains only to avoid breaking legacy imports in older notebooks.
"""

from covid_cough_detection.version import APP_VERSION

__version__ = APP_VERSION
