import numpy as np
import pytest

from covid_cough_detection.audio_processor import AudioProcessor  # noqa: E402


def test_load_audio_rejects_invalid_bytes(monkeypatch):
    processor = AudioProcessor()

    def fake_load(*_args, **_kwargs):
        raise RuntimeError("decode failed")

    monkeypatch.setattr("covid_cough_detection.audio_processor.librosa.load", fake_load)

    with pytest.raises(ValueError, match="Failed to load audio"):
        processor.load_audio(b"not-audio")


def test_preprocess_rejects_silence_only(monkeypatch):
    processor = AudioProcessor()

    monkeypatch.setattr(
        "covid_cough_detection.audio_processor.librosa.effects.trim",
        lambda _y, top_db=40: (np.array([], dtype=np.float32), None),
    )

    with pytest.raises(ValueError, match="silence only"):
        processor.preprocess_audio(np.zeros(16000, dtype=np.float32))


def test_preprocess_rejects_too_short_audio(monkeypatch):
    processor = AudioProcessor(sample_rate=16000, duration=10)
    tiny_signal = np.ones(1000, dtype=np.float32)

    monkeypatch.setattr(
        "covid_cough_detection.audio_processor.librosa.effects.trim",
        lambda y, top_db=40: (y, None),
    )

    with pytest.raises(ValueError, match="too short"):
        processor.preprocess_audio(tiny_signal)


def test_preprocess_rejects_low_amplitude(monkeypatch):
    processor = AudioProcessor()
    low_amp = np.full(16000, 1e-10, dtype=np.float32)

    monkeypatch.setattr(
        "covid_cough_detection.audio_processor.librosa.effects.trim",
        lambda y, top_db=40: (y, None),
    )

    with pytest.raises(ValueError, match="amplitude is too low"):
        processor.preprocess_audio(low_amp)
