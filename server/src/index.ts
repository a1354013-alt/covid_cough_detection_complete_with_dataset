import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import Busboy from "busboy";
import type { FileInfo } from "busboy";
import { validateAudioFile } from "./audio-validator.js";
import { logger } from "./logger.js";
import { convertToWav } from "./audio-converter.js";
import { API_VERSION } from "./config/version.js"; // ✅ Central version management

// ============================================================================
// Type Definitions
// ============================================================================

interface PredictionResponse {
  label: "positive" | "negative";
  prob: number;
  model_version: string;
  processing_time_ms: number;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

interface ParseMultipartResult {
  file?: Buffer;
  filename?: string;
  mimeType?: string;
  error?: string;
  details?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const isDev = process.env.NODE_ENV !== "production";
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "60000", 10);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const RATE_LIMIT_WINDOW = 60000; // 1 minute
// Read from environment variable with safe fallback
const RATE_LIMIT_MAX_REQUESTS = Math.max(
  1,
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "30", 10)
);
const RATE_LIMIT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ✅ Trust proxy configuration: dev=false, prod=1, env override
const TRUST_PROXY = (() => {
  const envValue = process.env.TRUST_PROXY;
  if (envValue !== undefined) {
    // Allow env override: "1", "true", "false", or specific proxy count
    if (envValue === "true") return true;
    if (envValue === "false") return false;
    const num = parseInt(envValue, 10);
    return isNaN(num) ? (isDev ? false : 1) : num;
  }
  // Default: false in dev, 1 in prod
  return isDev ? false : 1;
})();

logger.info("Configuration", {
  trust_proxy: TRUST_PROXY,
  python_api_url: PYTHON_API_URL,
  request_timeout: REQUEST_TIMEOUT,
  max_file_size: MAX_FILE_SIZE,
  rate_limit_window: RATE_LIMIT_WINDOW,
  rate_limit_max_requests: RATE_LIMIT_MAX_REQUESTS,
});

// ============================================================================
// Rate Limiting with Cleanup
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function getRateLimitKey(req: Request): string {
  // Use Express's req.ip which respects trust proxy setting
  // Falls back to socket address if not available
  return req.ip || req.socket.remoteAddress || "unknown";
}

function checkRateLimit(req: Request): boolean {
  const key = getRateLimitKey(req);
  const now = Date.now();

  let entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    // Reset counter
    entry = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
    rateLimitMap.set(key, entry);
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT_MAX_REQUESTS;
}

// Cleanup expired rate limit entries
function cleanupRateLimitMap(): void {
  const now = Date.now();
  const entriesToDelete: string[] = [];

  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      entriesToDelete.push(key);
    }
  }

  for (const key of entriesToDelete) {
    rateLimitMap.delete(key);
  }

  logger.debug(`Cleaned up ${entriesToDelete.length} expired rate limit entries`);
}

// ✅ Start cleanup interval with unref() for graceful shutdown
const cleanupInterval = setInterval(cleanupRateLimitMap, RATE_LIMIT_CLEANUP_INTERVAL);
cleanupInterval.unref(); // Don't prevent process exit

// ============================================================================
// Multipart Form Data Parser
// ============================================================================

function parseMultipart(req: Request): Promise<ParseMultipartResult> {
  return new Promise((resolve) => {
    // Check Content-Type
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      resolve({ error: "Content-Type must be multipart/form-data" });
      return;
    }

    let resolved = false;
    let fileReceived = false; // Track if we already received a file
    let hasError = false; // Track if error occurred

    // Timeout protection
    // ✅ 改進：timeout 時立即 destroy 與 unpipe，避免半開連線
    const timeoutHandle = setTimeout(() => {
      if (!resolved) {
        hasError = true;
        // Immediately destroy busboy and unpipe request
        try {
          bb.destroy();
          req.unpipe(bb);
        } catch {
          // Ignore errors during cleanup
        }
        resolved = true;
        resolve({
          error: "Request timeout",
          details: "Upload timeout",
        });
      }
    }, REQUEST_TIMEOUT);

    let bb: any; // Declare bb outside try block for timeout handler

    try {
      bb = Busboy({ headers: req.headers });

      // ✅ 改進：使用正確的型別而不是 any
      bb.on("file", (fieldname: string, file: any, info: FileInfo) => {
        if (fieldname !== "audio" && fieldname !== "file") {
          file.resume();
          return;
        }

        // Only accept the first audio file, ignore subsequent ones
        if (fileReceived) {
          file.resume();
          return;
        }

        const chunks: Buffer[] = [];
        let fileSize = 0;
        // ⚠️ Note: This implementation buffers entire file in memory.
        // For production with large files, consider streaming to disk or external storage.
        // Current MAX_FILE_SIZE=10MB is acceptable for MVP.

        file.on("data", (chunk: Buffer) => {
          // Check if already timed out or resolved
          if (hasError || resolved) {
            file.destroy();
            return;
          }

          fileSize += chunk.length;

          // Check size limits (per file, not cumulative)
          if (fileSize > MAX_FILE_SIZE) {
            file.destroy();
            bb.destroy();
            clearTimeout(timeoutHandle);
            if (!resolved) {
              resolved = true;
              resolve({
                error: "File too large",
                details: `Audio file size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
              });
            }
            return;
          }

          chunks.push(chunk);
        });

        file.on("end", () => {
          // ✅ 改進：檢查是否已經超時或出錯
          if (hasError) {
            clearTimeout(timeoutHandle);
            if (!resolved) {
              resolved = true;
              resolve({
                error: "Request timeout",
                details: "Multipart parsing took too long",
              });
            }
            return;
          }

          const fileContent = Buffer.concat(chunks);
          const { filename } = info;
          const mimeType = info.mimeType || "audio/wav";

          fileReceived = true;
          clearTimeout(timeoutHandle);
          if (!resolved) {
            resolved = true;
            resolve({ file: fileContent, filename, mimeType });
          }
        });

        file.on("error", (err: Error) => {
          clearTimeout(timeoutHandle);
          if (!resolved) {
            resolved = true;
            logger.error("File upload error", err);
            resolve({
              error: "File upload error",
              details: err.message,
            });
          }
        });
      });

      bb.on("error", (err: Error) => {
        clearTimeout(timeoutHandle);
        if (!resolved) {
          resolved = true;
          logger.error("Busboy parsing error", err);
          resolve({
            error: "Failed to parse multipart data",
            details: err.message,
          });
        }
      });

      bb.on("close", () => {
        if (!resolved) {
          clearTimeout(timeoutHandle);
          resolved = true;
          if (fileReceived) {
            // File was received but not properly resolved (shouldn't happen)
            resolve({ error: "File processing error", details: "Failed to finalize file" });
          } else {
            resolve({ error: "No audio file found in request", details: "Ensure audio or file field is present" });
          }
        }
      });

      // Pipe request to busboy parser
      // Note: If multiple files are sent, only the first one is processed
      req.pipe(bb);
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (!resolved) {
        resolved = true;
        const parseErr = err instanceof Error ? err : new Error(String(err));
        logger.error("Multipart parsing exception", parseErr);
        resolve({
          error: "Failed to parse multipart data",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

// ============================================================================
// Server Setup
// ============================================================================

async function startServer() {
  const app = express();

  // ✅ Trust proxy configuration for accurate client IP behind reverse proxy
  app.set("trust proxy", TRUST_PROXY);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Security Headers Middleware
  // ✅ CORS configuration from environment
  const ALLOWED_ORIGINS_STR = process.env.ALLOWED_ORIGINS || (isDev ? "*" : "https://your-domain");
  const ALLOWED_ORIGINS_LIST = ALLOWED_ORIGINS_STR === "*" ? ["*"] : ALLOWED_ORIGINS_STR.split(",").map(o => o.trim());
  
  // ⚠️ Production CORS warning
  if (!isDev && !process.env.ALLOWED_ORIGINS) {
    logger.warn(
      "CORS_PRODUCTION_WARNING: ALLOWED_ORIGINS not set in production. Using default 'https://your-domain'. " +
      "Please set ALLOWED_ORIGINS environment variable to your actual domain(s) for security."
    );
  }
  
  app.use((req: Request, res: Response, next: NextFunction) => {
    // ✅ CORS headers - properly handle multiple origins
    const origin = req.headers.origin as string;
    
    // Check if origin is allowed
    if (ALLOWED_ORIGINS_LIST.includes("*")) {
      // Wildcard: allow all origins
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (origin && ALLOWED_ORIGINS_LIST.includes(origin)) {
      // Specific origin match: return only that origin
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    // If origin not in whitelist, don't set CORS header (request will be blocked)
    
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader("Access-Control-Max-Age", "3600");

    // ✅ Security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // ✅ HSTS: Only on production with HTTPS
    if (!isDev && req.secure) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
    }

    // ✅ Comprehensive CSP with media/blob support for audio recording and playback
    const cspPolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Note: unsafe-inline needed for inline event handlers
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "media-src 'self' blob:", // Allow blob URLs for audio playback
      "connect-src 'self' https:", // Allow HTTPS connections to backend
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    res.setHeader("Content-Security-Policy", cspPolicy);

    next();
  });

  // ============================================================================
  // Health Check Endpoints
  // ============================================================================

  /**
   * GET /api/healthz (Liveness Probe)
   * 
   * Returns 200 if Node.js process is alive.
   * Does NOT check Python backend or model status.
   * Used by Docker/K8s to determine if process should be restarted.
   */
  app.get("/api/healthz", (_req: Request, res: Response): void => {
    res.json({
      status: "alive",
      timestamp: new Date().toISOString(),
      service: "covid-cough-detection-api",
      version: "1.0.13",
    });
  });

  /**
   * GET /api/readyz (Readiness Probe)
   * 
   * Returns 200 only if Node.js AND Python backend AND model are ready.
   * Used by Docker/K8s to determine if service can accept traffic.
   * Calls Python /readyz endpoint to check model readiness.
   * Returns 503 if any dependency is unavailable.
   */
  app.get("/api/readyz", async (_req: Request, res: Response): Promise<void> => {
    try {
      // Check Python backend readiness (not just liveness)
      const pythonReadyzResponse = await fetch(`${PYTHON_API_URL}/readyz`, {
        signal: AbortSignal.timeout(5000),
      });

      // ✅ Parse Python readyz response to check model_loaded and get full status
      const pythonReadyz = (await pythonReadyzResponse.json()) as Record<string, unknown>;
      const modelLoaded = pythonReadyz.model_loaded === true;

      if (!pythonReadyzResponse.ok) {
        // Python backend returned 503, meaning model is not ready
        res.status(503).json({
          status: "not_ready",
          timestamp: new Date().toISOString(),
          python_backend: "started",
          model_loaded: modelLoaded,
          reason: pythonReadyz.error || "Model not ready in Python backend",
        });
        return;
      }

      // Python backend returned 200, model is ready
      res.json({
        status: "ready",
        timestamp: new Date().toISOString(),
        python_backend: "ok",
        model_loaded: true,
      });
    } catch (err) {
      // Python service is unreachable (network error, timeout, etc.)
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      res.status(503).json({
        status: "not_ready",
        timestamp: new Date().toISOString(),
        python_backend: "unreachable",
        reason: `Python backend unreachable: ${errorMessage}`,
      });
    }
  });

  /**
   * GET /api/health (Deprecated - for backward compatibility)
   * 
   * Use /api/healthz for liveness or /api/readyz for readiness.
   */
  app.get("/api/health", async (_req: Request, res: Response): Promise<void> => {
    try {
      const pythonHealthResponse = await fetch(`${PYTHON_API_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!pythonHealthResponse.ok) {
        res.status(503).json({
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          python_backend: "unavailable",
          reason: "Python backend is not responding",
        });
        return;
      }

      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        python_backend: "ok",
      });
    } catch (err) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        python_backend: "unavailable",
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ============================================================================
  // Prediction Endpoint
  // ============================================================================

  /**
   * POST /api/predict
   * 
   * Proxies audio prediction to Python backend or uses local inference
   */
  app.post("/api/predict", async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      // Rate limiting
      if (!checkRateLimit(req)) {
        res.status(429).json({
          error: "Too many requests",
          details: isDev ? `Rate limit exceeded: ${RATE_LIMIT_MAX_REQUESTS} requests per minute` : undefined,
        } as ErrorResponse);
        return;
      }

      // Parse multipart form data
      const { file, filename, mimeType, error: parseError, details: parseDetails } = await parseMultipart(req);

      if (parseError) {
        logger.warn("Multipart parse error", { error: parseError, details: parseDetails });
        res.status(400).json({
          error: parseError,
          details: isDev ? parseDetails : undefined,
        } as ErrorResponse);
        return;
      }

      if (!file) {
        logger.warn("No audio file provided");
        res.status(400).json({
          error: "No audio file provided",
          details: isDev ? "Ensure audio or file field is present in the request" : undefined,
        } as ErrorResponse);
        return;
      }

      // Validate audio file
      const validation = validateAudioFile(file, filename);

      if (!validation.valid) {
        logger.warn("Audio validation failed", {
          error: validation.error,
          details: validation.details,
          filename,
        });
        res.status(400).json({
          error: validation.error,
          details: isDev ? validation.details : undefined,
        } as ErrorResponse);
        return;
      }

      logger.logPrediction(
        filename || "unknown",
        file.length,
        validation.format || "unknown"
      );

      // Try to use Python backend first
      const pythonResponse = await forwardToPythonBackend(
        file,
        filename || "audio.wav",
        mimeType || "audio/wav"
      );

      if (pythonResponse) {
        const duration = Date.now() - startTime;
        logger.logPredictionResult(pythonResponse.label, pythonResponse.prob, duration);
        res.json(pythonResponse);
        return;
      }

      // ✅ 修正：Python 後端不可用時回傳 503 而不是隨機結果
      // 這是醫療應用，絕對不能在模型服務不可用時偷偷返回隨機結果
      logger.error("Python backend unavailable - returning 503 Service Unavailable");
      res.status(503).json({
        error: "Model service temporarily unavailable",
        details: isDev ? "Python backend is not responding. Please check the service status." : undefined,
      } as ErrorResponse);
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(
        "Prediction error",
        err instanceof Error ? err : new Error(String(err)),
        {
          duration_ms: duration,
        }
      );

      res.status(500).json({
        error: "Internal server error",
        details: isDev ? (err instanceof Error ? err.message : String(err)) : undefined,
      } as ErrorResponse);
    }
  });

  /**
   * Forward prediction request to Python backend
   * ✅ 修正：在轉送前轉換音訊格式為 WAV
   */
  async function forwardToPythonBackend(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<PredictionResponse | null> {
    try {
      // Audio format conversion logic
      let convertedBuffer = fileBuffer;
      let actualMimeType = mimeType;
      let actualFilename = filename;

      // Try to convert to WAV
      try {
        convertedBuffer = await convertToWav(fileBuffer, mimeType);
        actualMimeType = "audio/wav";
        // Update filename extension to .wav
        actualFilename = filename.replace(/\.[^.]+$/, ".wav");
        logger.info("Audio format conversion successful", {
          source: mimeType,
          target: "audio/wav",
          filename: actualFilename,
        });
      } catch (conversionError) {
        // Conversion failed: keep original format, don't fake
        logger.warn("Audio format conversion failed, using original format", {
          source: mimeType,
          error: conversionError instanceof Error ? conversionError.message : String(conversionError),
        });
        // Keep original buffer and MIME type
        actualMimeType = mimeType;
      }

      const formData = new FormData();
      const blob = new Blob([convertedBuffer], { type: actualMimeType });
      formData.append("file", blob, actualFilename);

      const response = await fetch(`${PYTHON_API_URL}/predict`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!response.ok) {
        logger.warn("Python backend error", {
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const data = (await response.json()) as PredictionResponse;
      logger.info("Python backend prediction successful", {
        label: data.label,
        prob: data.prob,
        processing_time_ms: data.processing_time_ms,
      });
      return data;
    } catch (err) {
      logger.warn("Failed to forward to Python backend", {
        error: err instanceof Error ? err.message : String(err),
        python_api_url: PYTHON_API_URL,
      });
      return null;
    }
  }

  // ============================================================================
  // Version Endpoint
  // ============================================================================

  /**
   * GET /api/version
   * 
   * Returns API version and model information
   */
  app.get("/api/version", async (_req: Request, res: Response): Promise<void> => {
    try {
      const pythonVersionResponse = await fetch(`${PYTHON_API_URL}/version`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!pythonVersionResponse.ok) {
        res.status(503).json({
          error: "Python backend unavailable",
          details: isDev ? "Could not fetch version information from Python backend" : undefined,
        });
        return;
      }

      const pythonVersion = (await pythonVersionResponse.json()) as Record<string, unknown>;

      res.json({
        api_version: API_VERSION, // ✅ Use central version config
        node_version: process.version,
        python_backend: pythonVersion,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        error: "Version check failed",
        details: isDev ? (err instanceof Error ? err.message : String(err)) : undefined,
      });
    }
  });

  // ============================================================================
  // 404 Handler
  // ============================================================================

  app.use((_req: Request, res: Response): void => {
    res.status(404).json({
      error: "Not found",
      details: isDev ? "The requested endpoint does not exist" : undefined,
    });
  });

  // ============================================================================
  // Server Startup
  // ============================================================================

  const PORT = parseInt(process.env.PORT || "3001", 10);
  const server = createServer(app);

  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Trust proxy: ${TRUST_PROXY}`);
  });

  // ✅ Graceful shutdown with cleanup interval unref
  process.on("SIGTERM", () => {
    logger.info("SIGTERM signal received: closing HTTP server");
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT signal received: closing HTTP server");
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  });
}

startServer().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
