# COVID-19 Cough Signal Analysis Platform

[![CI](https://github.com/covid-cough-detection/covid-cough-detection/actions/workflows/ci.yml/badge.svg)](https://github.com/covid-cough-detection/covid-cough-detection/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-oriented monorepo implementing an AI-powered cough audio analysis platform. This project demonstrates enterprise-grade engineering practices for ML inference systems, including strict API contracts, comprehensive testing, rate limiting, and containerized deployment.

> **⚠️ Research Use Only**: This system is designed for educational and research purposes. It is **NOT** a medical diagnostic tool and should not be used for clinical decision-making.

## 🎯 Project Value

This platform showcases:
- **Full-stack TypeScript + Python integration** with clean API boundaries
- **Production-ready patterns**: rate limiting, health checks, graceful error handling
- **ML inference pipeline** with strict validation and monitoring
- **Containerized deployment** with Docker Compose
- **Comprehensive testing** across all layers (unit, integration, E2E)
- **Version synchronization** across polyglot services

## 🏗️ System Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser   │────▶│  Node.js Gateway │────▶│ Python Inference│
│  React 19   │     │  Express + TS    │     │  FastAPI+PyTorch│
│  Vite       │     │  Rate Limiting   │     │  Model Serving  │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

### Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI |
| **Gateway** | Node.js 20, Express, TypeScript, Busboy, FFmpeg |
| **Inference** | Python 3.11, FastAPI, PyTorch, Librosa, NumPy |
| **Testing** | Vitest, node:test, pytest |
| **Deployment** | Docker, Docker Compose |

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ with pnpm 10+
- Python 3.10-3.12
- FFmpeg (for audio conversion)
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/covid-cough-detection/covid-cough-detection.git
cd covid-cough-detection

# Enable Corepack and install dependencies
corepack enable
corepack pnpm install --frozen-lockfile

# Install Python package in development mode
python -m pip install -e "./python_project[dev]"
```

### Development Mode

```bash
# Terminal 1: Start Python backend
cd python_project
export MODEL_PATH=./models/model.pt
python -m uvicorn covid_cough_detection.app:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Start Node gateway + Client
corepack pnpm dev
```

Access the application at `http://localhost:5173`.

### Docker Deployment

```bash
# Place model file at python_project/models/model.pt
# Build and run all services
docker compose up --build

# Verify endpoints
curl http://localhost:3000/api/healthz
curl http://localhost:3000/api/readyz
```

## 📡 API Endpoints

### Node Gateway (`/api/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/healthz` | GET | Liveness probe |
| `/api/readyz` | GET | Readiness (includes backend status) |
| `/api/version` | GET | Version information |
| `/api/predict` | POST | Audio prediction (multipart/form-data) |
| `/api/history` | GET | Recent inference history (demo/portfolio) |
| `/api/status` | GET | System status dashboard payload (demo/portfolio) |
| `/api/stats/daily` | GET | Daily statistics (requires DB enabled) |
| `/api/admin/errors` | GET | Recent error logs (requires admin API key + DB) |

### Prediction Request

```bash
curl -X POST http://localhost:3000/api/predict \
  -F "audio=@cough_sample.wav"
```

Response:
```json
{
  "label": "positive",
  "prob": 0.84,
  "model_version": "checkpoint-2026.04",
  "processing_time_ms": 123.4
}
```

## ✅ Quality Gates

Run all validation checks:

```bash
# Type checking
corepack pnpm check

# Linting
corepack pnpm lint

# Build
corepack pnpm build

# Unit tests
corepack pnpm test

# Smoke tests (build contract)
corepack pnpm test:smoke

# Version consistency
corepack pnpm check:version

# Python tests
python -m pytest python_project/tests -q
```

## 🧪 Testing Strategy

| Layer | Framework | Coverage |
|-------|-----------|----------|
| Client | Vitest + jsdom | API contracts, state management, components |
| Server | node:test | Validation, rate limiting, error handling |
| Python | pytest | Model loading, API contracts, audio processing |
| E2E | Custom (fetch) | Full-stack integration (opt-in) |

Run E2E tests (requires running services):
```bash
RUN_E2E=1 corepack pnpm test:e2e
```

## 📁 Project Structure

```
covid-cough-detection/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route components
│   │   ├── lib/            # API client, utilities
│   │   └── contexts/       # React contexts
│   └── dist/               # Production build
├── server/                 # Node.js gateway
│   └── src/
│       ├── config/         # Configuration
│       └── public/         # Static assets (prod)
├── python_project/         # Python inference service
│   └── src/covid_cough_detection/
│       ├── app.py          # FastAPI application
│       ├── audio_processor.py
│       └── model_inference.py
├── shared/                 # Shared TypeScript types
├── scripts/                # Build/release scripts
├── tests/e2e/              # End-to-end tests
├── docs/                   # Documentation assets
└── dataset/                # Sample data (excluded from release)
```

## 🔒 Security Features

- **Rate Limiting**: 30 requests/minute per IP (configurable)
- **CORS**: Strict origin enforcement in production
- **Content Security Policy**: Restrictive CSP headers
- **Input Validation**: File type, size, and format validation
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, HSTS

## 📊 Environment Variables

### Node Gateway

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | 3000 | No | HTTP port |
| `PYTHON_API_URL` | http://localhost:8000 | No | Backend URL (alias: `PYTHON_BACKEND_URL`) |
| `ALLOWED_ORIGINS` | * | Yes (prod) | CORS origins (comma-separated) |
| `RATE_LIMIT_MAX_REQUESTS` | 30 | No | Max requests per window |
| `ENABLE_DATABASE` | true | No | Enable SQLite persistence/caching (falls back to memory if unavailable) |
| `DATABASE_PATH` | server/data/inferences.db | No | SQLite file path |
| `CACHE_TTL_SECONDS` | 3600 | No | Prediction cache TTL (seconds) |
| `API_KEYS` | - | No | Optional API keys (comma-separated) |
| `API_KEY_FILE` | - | No | Optional API key file path (one key per line) |

### Python Service

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MODEL_PATH` | - | Yes | Path to model.pt |
| `MODEL_DEVICE` | auto | No | cpu/cuda/auto |

## 📄 Documentation

- [System Architecture](./SYSTEM_ARCHITECTURE.md) - Detailed architecture overview
- [Model Card](./MODEL_CARD.md) - Model details, limitations, and ethical considerations
- [API Documentation](./API_DOCUMENTATION.md) - Complete API reference
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Production deployment instructions
- [Testing Guide](./TESTING_GUIDE.md) - Testing strategy and commands
- [Release Checklist](./RELEASE_CHECKLIST.md) - Release validation steps

## ⚠️ Limitations & Disclaimers

### Technical Limitations
- Requires audio recordings of sufficient quality
- Performance may vary across different recording devices
- Background noise can affect prediction accuracy
- Model may exhibit bias based on training data demographics

### Medical Disclaimer
**THIS SYSTEM IS FOR RESEARCH AND EDUCATIONAL PURPOSES ONLY. IT IS NOT APPROVED FOR MEDICAL DIAGNOSIS, TREATMENT, OR PREVENTION OF ANY DISEASE. ALWAYS CONSULT QUALIFIED HEALTHCARE PROFESSIONALS FOR MEDICAL CONCERNS.**

## 🚧 Future Enhancements

- [ ] Batch analysis support
- [ ] Real-time streaming inference
- [ ] Multi-model ensemble support
- [ ] Enhanced monitoring dashboard
- [ ] Audio quality assessment feedback

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

**Version**: 1.0.13  
**Last Updated**: 2026  
**Status**: Production-ready for research/demo use
