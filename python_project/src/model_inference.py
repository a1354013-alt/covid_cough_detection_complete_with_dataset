"""Compatibility shim; production code moved to `covid_cough_detection.model_inference`."""

from covid_cough_detection.model_inference import (  # noqa: F401
  DEFAULT_MODEL_VERSION,
  ModelInference,
  SimpleConvNet,
  create_model_inference,
)
