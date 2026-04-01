# COVID-19 Cough Detection - Python Backend

FastAPI-based inference server for COVID-19 cough detection using deep learning.

## 📋 Overview

This is the Python backend component of the COVID-19 Cough Detection system. It provides:

- **Audio Processing**: Load, preprocess, and extract features from audio files
- **Model Inference**: Run deep learning models for COVID-19 detection
- **REST API**: FastAPI endpoints for audio upload and prediction
- **CORS Support**: Cross-origin requests for frontend integration

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- pip or conda

### Installation

#### Option 1: Using pip

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

#### Option 2: Using conda

```bash
# Create environment
conda create -n covid-detection python=3.10
conda activate covid-detection

# Install dependencies
pip install -r requirements.txt
```

### Running the Server

```bash
# Development mode with auto-reload
python -m uvicorn src.app:app --reload --host 0.0.0.0 --port 8000

# Production mode
python -m uvicorn src.app:app --host 0.0.0.0 --port 8000 --workers 4
```

The API will be available at `http://localhost:8000`

## 📚 API Documentation

### Interactive API Docs

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Endpoints

#### Health Check
```
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-02T03:00:00.000000"
}
```

#### Version Information
```
GET /version
```

Response:
```json
{
  "version": "1.0.13",
  "timestamp": "2026-03-02T03:00:00.000000"
}
```

#### Prediction
```
POST /predict
Content-Type: multipart/form-data

file: <audio_file>
```

Response:
```json
{
  "label": "positive",
  "prob": 0.85,
  "model_version": "1.0.13",
  "processing_time_ms": 1234.5
}
```

Supported audio formats: WAV, MP3, WebM, OGG

## 🏗️ Project Structure

```
python_project/
├── src/
│   ├── __init__.py              # Package initialization
│   ├── app.py                   # FastAPI application
│   ├── audio_processor.py       # Audio processing module
│   └── model_inference.py       # Model inference module
├── models/                      # Saved model files
├── data/                        # Data directory
├── pyproject.toml              # Project metadata
├── requirements.txt            # Python dependencies
└── README.md                   # This file
```

## 🔧 Configuration

### Audio Processing

Modify `AudioProcessor` parameters in `src/app.py`:

```python
audio_processor = AudioProcessor(
    sample_rate=16000,      # Target sample rate (Hz)
    duration=10,            # Target duration (seconds)
    n_mfcc=13,             # Number of MFCC coefficients
    n_mel=64,              # Number of mel bands
)
```

### Model Loading

To use a custom trained model:

```python
model_inference = ModelInference(model_path="path/to/model.pt")
```

## 📊 Audio Features

The system extracts the following features from audio:

### MFCC (Mel-Frequency Cepstral Coefficients)
- 13 coefficients
- Captures spectral characteristics of audio
- Commonly used in speech and audio processing

### Mel-Spectrogram
- 64 mel bands
- Frequency representation of audio
- Better represents human perception of sound

## 🤖 Model Architecture

The default model is a simple CNN:

```
Input (1, H, W)
    ↓
Conv2d(1, 32, 3x3) + ReLU + MaxPool
    ↓
Conv2d(32, 64, 3x3) + ReLU + MaxPool
    ↓
Conv2d(64, 128, 3x3) + ReLU + MaxPool
    ↓
AdaptiveAvgPool2d(1, 1)
    ↓
Linear(128, 64) + ReLU + Dropout
    ↓
Linear(64, 2)
    ↓
Output (2,) → Softmax → [prob_negative, prob_positive]
```

## 📈 Performance

Expected performance metrics:

- **Inference Time**: ~100-500ms per sample (CPU)
- **Memory Usage**: ~200MB (model + dependencies)
- **Throughput**: ~10-20 requests/second (single worker)

## 🧪 Testing

### Manual Testing

```bash
# Test health endpoint
curl http://localhost:8000/health

# Test version endpoint
curl http://localhost:8000/version

# Test prediction with audio file
curl -X POST http://localhost:8000/predict \
  -F "file=@test_audio.wav"
```

### Automated Testing

```bash
# Run tests
pytest tests/

# With coverage
pytest --cov=src tests/
```

## 🔐 Security Considerations

1. **File Size Limit**: 10MB per request
2. **CORS**: Currently allows all origins (configure in production)
3. **Rate Limiting**: Not implemented (add middleware in production)
4. **Authentication**: Not implemented (add JWT/OAuth in production)

## 🚨 Error Handling

Common error responses:

| Status | Error | Solution |
|--------|-------|----------|
| 400 | Empty file | Provide a valid audio file |
| 400 | Invalid format | Use supported audio format |
| 413 | File too large | Use file < 10MB |
| 500 | Processing error | Check server logs |
| 503 | Service unavailable | Wait for service to initialize |

## 📝 Logging

Logs are printed to console with format:

```
2026-03-02 03:00:00,000 - src.app - INFO - Starting COVID-19 Cough Detection API...
```

To change log level, modify `logging.basicConfig()` in `src/app.py`

## 🔄 Integration with Node.js Backend

The Python server is designed to work with the Node.js backend:

1. **Node.js Server** (port 3000)
   - Handles frontend requests
   - Validates audio files
   - Proxies to Python server

2. **Python Server** (port 8000)
   - Processes audio
   - Runs inference
   - Returns predictions

Communication flow:
```
Frontend → Node.js (/api/predict) → Python (http://localhost:8000/predict) → Response
```

## 📦 Dependencies

### Core
- **fastapi**: Web framework
- **uvicorn**: ASGI server
- **pydantic**: Data validation

### Audio Processing
- **librosa**: Audio analysis
- **scipy**: Scientific computing
- **numpy**: Numerical computing

### Machine Learning
- **torch**: Deep learning framework
- **torchaudio**: Audio processing for PyTorch

### Development
- **pytest**: Testing framework
- **black**: Code formatter
- **mypy**: Type checker

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

## 🆘 Troubleshooting

### ImportError: No module named 'librosa'

```bash
pip install librosa
```

### CUDA not available

The system automatically falls back to CPU. To use GPU:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Port already in use

Change the port in the startup command:

```bash
python -m uvicorn src.app:app --port 8001
```

### Audio file not recognized

Ensure the file is a valid audio format. Test with:

```python
import librosa
y, sr = librosa.load("your_file.wav")
```

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review logs for error messages
3. Consult FastAPI documentation
4. Open an issue on GitHub

---

**Version**: 1.0.13  
**Last Updated**: April 1, 2026
