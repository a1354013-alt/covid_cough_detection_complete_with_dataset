# Deployment Guide

## Overview

This guide covers deployment strategies for the COVID-19 Cough Detection platform, from local development to production environments.

## Architecture Topology

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser   │────▶│  Node.js Gateway │────▶│ Python Inference│
│   (HTTPS)   │     │  (Port 3000)     │     │ (Port 8000)     │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │ Static Files│
                    │ (dist/)     │
                    └─────────────┘
```

## Environment Variables

### Node Gateway

| Variable | Default | Required (Prod) | Description |
|----------|---------|-----------------|-------------|
| `PORT` | 3000 | No | HTTP port for gateway |
| `PYTHON_API_URL` | http://localhost:8000 | No | Python backend URL |
| `ALLOWED_ORIGINS` | * | **Yes** | Comma-separated allowed CORS origins |
| `REQUEST_TIMEOUT` | 60000 | No | Request timeout in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | 30 | No | Max requests per minute per IP |
| `TRUST_PROXY` | 1 | Recommended | Number of trusted proxy hops |
| `CSP_CONNECT_SRC_EXTRA` | "" | No | Additional CSP connect-src values |
| `FFMPEG_PATH` | ffmpeg | No | Path to FFmpeg binary |

### Python Service

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MODEL_PATH` | - | **Yes** | Absolute path to model.pt file |
| `MODEL_DEVICE` | auto | No | Device: `auto`, `cpu`, or `cuda` |
| `ALLOWED_ORIGINS` | * | No | CORS origins (internal use) |

## Local Development

### Prerequisites

```bash
# Node.js 20+ with pnpm
node --version  # v20.x
pnpm --version  # 10.x

# Python 3.10-3.12
python --version  # 3.10+

# FFmpeg
ffmpeg -version
```

### Setup

```bash
# Install dependencies
corepack enable
corepack pnpm install --frozen-lockfile

# Install Python package
python -m pip install -e "./python_project[dev]"
```

### Running Services

**Terminal 1 - Python Backend:**
```bash
cd python_project
export MODEL_PATH=$(pwd)/models/model.pt
export MODEL_DEVICE=cpu  # or cuda if available
python -m uvicorn covid_cough_detection.app:app \
  --host 0.0.0.0 \
  --port 8000 \
  --reload
```

**Terminal 2 - Node Gateway + Client:**
```bash
corepack pnpm dev
```

Access at `http://localhost:5173`.

## Docker Compose Deployment

### Step 1: Prepare Model File

Place your trained model at:
```
python_project/models/model.pt
```

### Step 2: Configure Environment

Create `.env` file (optional, for customization):
```bash
NODE_ENV=production
PORT=3000
PYTHON_API_URL=http://python-backend:8000
ALLOWED_ORIGINS=https://your-domain.com
RATE_LIMIT_MAX_REQUESTS=30
MODEL_PATH=/app/models/model.pt
MODEL_DEVICE=cpu
```

### Step 3: Build and Run

```bash
docker compose up --build -d
```

### Step 4: Verify Deployment

```bash
# Check service health
curl http://localhost:3000/api/healthz
curl http://localhost:3000/api/readyz
curl http://localhost:3000/api/version

# Test prediction endpoint
curl -X POST http://localhost:3000/api/predict \
  -F "audio=@test_audio.wav"
```

### Step 5: View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f node-gateway
docker compose logs -f python-backend
```

## Production Deployment Considerations

### 1. Security Hardening

```bash
# Required for production
export ALLOWED_ORIGINS="https://your-domain.com"
export TRUST_PROXY=1  # Behind load balancer
export NODE_ENV=production
```

### 2. HTTPS Termination

Terminate HTTPS at load balancer or reverse proxy:

**Nginx Example:**
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Resource Allocation

**Recommended Minimum:**
- CPU: 2 cores
- RAM: 4GB
- Storage: 10GB (for model + logs)

**With GPU Support:**
- GPU: NVIDIA T4 or better
- CUDA drivers installed on host

### 4. Health Checks

Configure load balancer health checks:
- **Liveness**: `/api/healthz` (process alive)
- **Readiness**: `/api/readyz` (model loaded, ready for traffic)

### 5. Logging Strategy

```bash
# Structured JSON logging recommended
export LOG_FORMAT=json

# Log aggregation options:
# - ELK Stack (Elasticsearch, Logstash, Kibana)
# - Datadog
# - CloudWatch (AWS)
# - Stackdriver (GCP)
```

### 6. Monitoring Metrics

Track these key metrics:
- Request latency (p50, p95, p99)
- Error rates by endpoint
- Rate limit hits
- Model inference time
- Memory usage
- CPU utilization

## Kubernetes Deployment (Outline)

```yaml
# Basic structure - adapt to your cluster
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cough-detection
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cough-detection
  template:
    spec:
      containers:
      - name: node-gateway
        image: your-registry/node-gateway:latest
        ports:
        - containerPort: 3000
        env:
        - name: PYTHON_API_URL
          value: "http://python-backend:8000"
      - name: python-backend
        image: your-registry/python-backend:latest
        ports:
        - containerPort: 8000
```

## Troubleshooting

### Common Issues

**Python service won't start:**
```bash
# Check MODEL_PATH is set and file exists
echo $MODEL_PATH
ls -la $MODEL_PATH

# Check Python dependencies
python -c "import torch; import librosa; print('OK')"
```

**Node gateway can't reach Python:**
```bash
# Test connectivity
curl http://localhost:8000/healthz

# Check PYTHON_API_URL
echo $PYTHON_API_URL
```

**Rate limiting too aggressive:**
```bash
# Increase limit
export RATE_LIMIT_MAX_REQUESTS=60
```

**CORS errors in browser:**
```bash
# Set correct origin
export ALLOWED_ORIGINS="https://your-actual-domain.com"
```

## Release Process

See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for complete release validation steps.

---
Last Updated: 2026
Version: 1.0.13
