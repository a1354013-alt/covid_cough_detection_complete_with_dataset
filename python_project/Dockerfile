# Python FastAPI Application Dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
# ffmpeg is required for librosa to load mp3, webm, m4a, and other compressed audio formats
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy project metadata and the installable package (single source of truth: pyproject.toml)
COPY pyproject.toml README.md ./
COPY src/covid_cough_detection ./src/covid_cough_detection

# Install Python dependencies + package
RUN pip install --no-cache-dir .

# Copy remaining source tree (non-packaged modules/tests are excluded via .dockerignore)
COPY src ./src

# Create non-root user
RUN useradd -m -u 1001 python && chown -R python:python /app

# Switch to non-root user
USER python

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/readyz || exit 1

# Start application
CMD ["python", "-m", "uvicorn", "covid_cough_detection.app:app", "--host", "0.0.0.0", "--port", "8000"]
