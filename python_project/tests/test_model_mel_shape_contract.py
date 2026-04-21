"""Contract smoke: SimpleConvNet forward with standard mel feature map shape."""

import numpy as np
import torch

from covid_cough_detection.model_inference import ModelInference, SimpleConvNet  # noqa: E402


def test_predict_accepts_standard_mel_feature_shape(tmp_path):
    """Mel (n_mel, time) as produced by AudioProcessor with defaults (64 bands, short clip)."""
    model = SimpleConvNet(input_channels=1, num_classes=2)
    ckpt_path = tmp_path / "shape-smoke.pt"
    torch.save(
        {"state_dict": model.state_dict(), "model_version": "shape-smoke-v1"},
        ckpt_path,
    )

    inference = ModelInference(model_path=str(ckpt_path), device="cpu")
    mel = np.zeros((64, 10), dtype=np.float32)
    label, prob = inference.predict(mel)

    assert label in ("positive", "negative")
    assert isinstance(prob, float)
    assert 0.0 <= prob <= 1.0
