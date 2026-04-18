# System Architecture

## Overview

This project implements a production-oriented monorepo for cough-audio risk signal inference. The system follows a microservices architecture with clear separation of concerns between the browser client, API gateway, and ML inference backend.

## High-Level Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│   Browser       │────▶│   Node.js Gateway   │────▶│  Python Inference │
│   (React 19)    │     │   (Express + TS)    │     │  (FastAPI+PyTorch)│
│   Port 5173     │     │   Port 3000         │     │  Port 8000        │
└─────────────────┘     └─────────────────────┘     └───────────────────┘
         │                       │                           │
         │                       │                           │
         ▼                       ▼                           ▼
┌─────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│  Static Assets  │     │  Rate Limiting      │     │  Model Loading    │
│  Vite Build     │     │  Audio Validation   │     │  Feature Extract  │
│  TypeScript     │     │  Format Conversion  │     │  Prediction       │
└─────────────────┘     └─────────────────────┘     └───────────────────┘
```

## Component Details

### 1. Browser Client (React 19 + Vite)

**Technology Stack:**
- React 19 with TypeScript
- Vite for bundling and HMR
- Tailwind CSS v4 for styling
- Radix UI primitives
- Wouter for routing
- Sonner for notifications

**Key Features:**
- Real-time audio recording via Web Audio API
- Progress tracking for uploads
- Responsive design with dark mode support
- Error boundary handling
- Health status visualization

**File Structure:**
```
client/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Route components
│   ├── lib/            # API client, utilities
│   ├── contexts/       # React contexts
│   └── test/           # Test setup
├── public/             # Static assets
└── dist/               # Production build
```

### 2. Node.js Gateway (Express + TypeScript)

**Responsibilities:**
- API routing and request validation
- Rate limiting (sliding window)
- Audio format validation
- FFmpeg-based audio conversion
- CORS and security headers
- Static asset serving (production)
- Backend health monitoring

**Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/healthz` | GET | Liveness probe |
| `/api/readyz` | GET | Readiness probe |
| `/api/health` | GET | Readiness mirror |
| `/api/version` | GET | Version information |
| `/api/predict` | POST | Audio prediction |

**Security Features:**
- Content Security Policy (CSP)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Strict Transport Security (HSTS)
- Rate limiting per IP
- Allowed origins enforcement

**Rate Limiting:**
- Default: 30 requests per minute per IP
- Configurable via `RATE_LIMIT_MAX_REQUESTS`
- LRU eviction for memory management
- Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`

### 3. Python Inference Service (FastAPI + PyTorch)

**Responsibilities:**
- Model loading and management
- Audio feature extraction (mel-spectrogram)
- ML inference
- Health/readiness reporting

**Strict Startup Contract:**
- `MODEL_PATH` environment variable required
- Process exits if model file missing/invalid
- Fast failure preferred over degraded operation

**Audio Processing Pipeline:**
1. Receive audio file (WAV/MP3/OGG/WebM)
2. Resample to 16kHz mono
3. Extract 10-second window (or pad/truncate)
4. Compute mel-spectrogram (64 mel bins)
5. Normalize features
6. Run model inference
7. Return probability and label

**Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/healthz` | GET | Liveness (process alive) |
| `/readyz` | GET | Readiness (model loaded) |
| `/health` | GET | Readiness alias |
| `/version` | GET | Version/model info |
| `/predict` | POST | Inference request |

## Data Flow

### Prediction Request Flow

```
1. User records audio in browser
2. Client sends multipart/form-data to /api/predict
3. Node gateway validates:
   - Content-Type is multipart/form-data
   - File field named 'audio' or 'file'
   - File size <= 10MB
   - MIME type is supported
4. Node converts audio to WAV (if needed)
5. Node forwards to Python /predict endpoint
6. Python extracts mel-spectrogram features
7. Python runs model inference
8. Response flows back through gateway
9. Client displays results
```

### Health Check Flow

```
1. Client polls /api/readyz every 30s
2. Node queries Python /readyz
3. Node aggregates response with own status
4. Client updates UI based on readiness
```

## Environment Configuration

### Node Gateway Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | 3000 | No | HTTP port |
| `PYTHON_API_URL` | http://localhost:8000 | No | Backend URL |
| `ALLOWED_ORIGINS` | * | Yes (prod) | CORS origins |
| `REQUEST_TIMEOUT` | 60000 | No | Request timeout (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | 30 | No | Max requests/window |
| `TRUST_PROXY` | 1 (prod) | No | Trust proxy hops |
| `FFMPEG_PATH` | ffmpeg | No | FFmpeg binary path |

### Python Service Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MODEL_PATH` | - | Yes | Path to model.pt |
| `MODEL_DEVICE` | auto | No | cpu/cuda/auto |
| `ALLOWED_ORIGINS` | * | No | CORS origins |

## Deployment Topology

### Development
```
Browser :5173 → Vite HMR
Node    :3000 → Express dev server (tsx watch)
Python  :8000 → FastAPI (uvicorn --reload)
```

### Production (Docker Compose)
```
Browser ←→ Node :3000 (static + API) ←→ Python :8000
                    ↓
              docker-compose.yml
                    ↓
            ┌───────────────┐
            │ node-gateway  │
            │ python-backend│
            └───────────────┘
```

### Production (Single Container)
```
Node serves both API and static assets
Python runs as sidecar or separate container
```

## Version Management

**Source of Truth:** Root `package.json` version

**Sync Targets:**
- `shared/version.ts` (generated)
- `server/src/config/version.ts` (generated)
- `python_project/src/covid_cough_detection/version.py` (generated)
- `client/package.json` (synced)
- `server/package.json` (synced)
- `python_project/pyproject.toml` (synced)

**Sync Command:**
```bash
corepack pnpm run sync:version
```

## Testing Strategy

| Layer | Framework | Scope |
|-------|-----------|-------|
| Client | Vitest + jsdom | Unit, component |
| Server | node:test | Unit, integration |
| Python | pytest | Unit, contract |
| E2E | Custom (fetch) | Full stack (opt-in) |

**Test Commands:**
```bash
corepack pnpm test          # Unit tests
corepack pnpm test:smoke    # Build smoke tests
corepack pnpm test:e2e      # End-to-end (opt-in)
python -m pytest            # Python tests
```

## Release Boundary

**Included in Release:**
- Client dist/
- Server dist/
- Python src/covid_cough_detection/
- Docker configurations
- Documentation

**Excluded from Release:**
- `.git/`
- `node_modules/`
- `dataset/` (large files)
- `experimental/` directories
- Test fixtures
- Build caches
- `.env*` files

See `.dockerignore` and `.gitignore` for complete exclusion lists.

## Monitoring Considerations

### Health Indicators
- `/api/healthz` - Process liveness
- `/api/readyz` - Service readiness
- Model load status
- Memory usage (via process metrics)

### Logging
- Structured JSON logging recommended
- Include request IDs for tracing
- Log level configurable per service

### Metrics to Track
- Request latency (p50, p95, p99)
- Error rates by endpoint
- Rate limit hits
- Model inference time
- Queue depth (if applicable)

---
Architecture Version: 1.0.13
Last Updated: 2024
