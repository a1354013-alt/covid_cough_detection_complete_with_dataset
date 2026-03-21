import { APP_VERSION } from "./version.js";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import Busboy from "busboy";
import type { FileInfo } from "busboy";
import { validateAudioFile } from "./audio-validator.js";
import { logger } from "./logger.js";
import { convertToWav } from "./audio-converter.js"; // ✅ 音訊格式轉換

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Type Definitions
// ============================================================================

interface PredictionResponse {
  label: "positive" | "negative";
  prob: number;
  model_version: string;
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

logger.info("Configuration", {
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
  let cleaned = 0;

  const keysToDelete: string[] = [];
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetTime) {
      keysToDelete.push(key);
      cleaned++;
    }
  });

  keysToDelete.forEach((key) => {
    rateLimitMap.delete(key);
  });

  if (cleaned > 0) {
    logger.debug("Rate limit cleanup", { cleaned, remaining: rateLimitMap.size });
  }
}

// Start cleanup interval
// ✅ 修正：使用 unref() 讓 process 可以優雅退出
// 不會因為 interval 還在執行就阻止 process 關閉
const cleanupInterval = setInterval(cleanupRateLimitMap, RATE_LIMIT_CLEANUP_INTERVAL);
cleanupInterval.unref(); // 不阻止 process 退出

// ============================================================================
// Multipart Parser with Size Limit
// ============================================================================

/**
 * Parse multipart form data using Busboy
 * Streams multipart parsing with size limit enforcement.
 * - Only accepts the first audio/file field (subsequent files are ignored)
 * - Enforces 10MB size limit per file
 * - Currently buffers file content in memory
 * Future optimization: Stream directly to Python backend or temp file.
 */
async function parseMultipart(req: Request): Promise<ParseMultipartResult> {
  return new Promise((resolve) => {
    const contentType = req.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      resolve({ error: "Content-Type must be multipart/form-data" });
      return;
    }

    let resolved = false;
    let totalBytes = 0; // Track total bytes received (for safety)
    let fileReceived = false; // Track if we already received a file
    let hasError = false; // Track if error occurred

    // Timeout protection
    // ✅ 改進：timeout 時不直接 destroy，改為標記 error 並讓 Busboy 正常清理
    const timeoutHandle = setTimeout(() => {
      if (!resolved) {
        hasError = true;
        // 不直接 destroy，讓 Busboy 正常關閉
      }
    }, REQUEST_TIMEOUT);

    try {
      const bb = Busboy({ headers: req.headers });

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

        file.on("data", (chunk: Buffer) => {
          // ✅ 改進：檢查是否已經超時或出錯
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
          totalBytes += chunk.length; // Track total for safety
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
  const server = createServer(app);

  // Trust proxy - set based on environment
  // In production behind a proxy, set to 1 (or number of proxy hops)
  // Can be configured via TRUST_PROXY env var
  // ✅ 修正：Trust proxy 設定要明確 parse
  // 避免字串 "false" 被當成 truthy
  let trustProxy: boolean | number = false;
  if (process.env.TRUST_PROXY) {
    const envValue = process.env.TRUST_PROXY.toLowerCase();
    if (envValue === "true" || envValue === "1") {
      trustProxy = true;
    } else if (envValue === "false" || envValue === "0") {
      trustProxy = false;
    } else {
      // 嘗試解析為數字（proxy 層數）
      const parsed = parseInt(process.env.TRUST_PROXY, 10);
      trustProxy = !isNaN(parsed) ? parsed : false;
    }
  } else {
    // 預設值
    trustProxy = isDev ? false : 1;
  }
  app.set("trust proxy", trustProxy);
  logger.info("Trust proxy setting", { trust_proxy: trustProxy });

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Security Headers Middleware
  // ✅ CORS configuration from environment
  const ALLOWED_ORIGINS_STR = process.env.ALLOWED_ORIGINS || (isDev ? "*" : "https://your-domain");
  const ALLOWED_ORIGINS_LIST = ALLOWED_ORIGINS_STR === "*" ? ["*"] : ALLOWED_ORIGINS_STR.split(",").map(o => o.trim());
  
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

    // Security headers with proper CSP
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Only set HSTS in production with HTTPS (or when behind HTTPS proxy)
    // req.protocol respects trust proxy setting
    const isSecure = !isDev && req.protocol === "https";
    if (isSecure) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    // Build CSP with support for Python backend (supports http/https and ws/wss)
    const pythonUrl = new URL(PYTHON_API_URL);
    const pythonHost = pythonUrl.host;
    const isHttps = pythonUrl.protocol === "https:";
    const httpProtocol = isHttps ? "https" : "http";
    const wsProtocol = isHttps ? "wss" : "ws";
    
    // Allow extra connect sources via environment variable (e.g., for Sentry, analytics)
    const extraConnectSrc = process.env.CSP_CONNECT_SRC_EXTRA || "";
    const connectSrcList = ["'self'", `${httpProtocol}://${pythonHost}`, `${wsProtocol}://${pythonHost}`];
    if (extraConnectSrc) {
      connectSrcList.push(...extraConnectSrc.split(",").map(s => s.trim()));
    }
    const connectSrc = connectSrcList.join(" ");
    
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; " +
        "img-src 'self' data: blob:; " +
        "media-src 'self' blob:; " +
        "style-src 'self' 'unsafe-inline'; " +
        "script-src 'self'; " +
        `connect-src ${connectSrc}`
    );

    next();
  });

  // OPTIONS handler for preflight requests
  app.options("*", (_req: Request, res: Response) => {
    res.status(200).end();
  });

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      logger.logResponse(req.method, req.path, res.statusCode, duration);
    });

    next();
  });

  // Rate limiting middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!checkRateLimit(req)) {
      logger.warn("Rate limit exceeded", {
        ip: getRateLimitKey(req),
        path: req.path,
      });
      res.status(429).json({
        error: "Too many requests",
        details: "Please wait before making another request",
      } as ErrorResponse);
      return;
    }
    next();
  });

  // ========================================================================
  // API Routes
  // ========================================================================

  /**
   * POST /api/predict
   *
   * Proxies audio prediction to Python backend or uses local inference
   */
  app.post("/api/predict", async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      // Parse multipart form data
      const { file, filename, mimeType, error: parseError } = await parseMultipart(req);

      if (parseError) {
        logger.warn("Multipart parse error", { error: parseError });
        res.status(400).json({
          error: parseError,
          details: isDev ? "Check server logs for details" : undefined,
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
        details:
          isDev && err instanceof Error ? err.message : undefined,
      } as ErrorResponse);
    }
  });

  /**
   * Forward request to Python backend with correct MIME type
   * ✅ 修正：在轉送前轉換音訊格式為 WAV
   */
  async function forwardToPythonBackend(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<PredictionResponse | null> {
    try {
      // ✅ 音訊格式轉換邏輯
      let convertedBuffer = fileBuffer;
      let actualMimeType = mimeType;

      // 嘗試轉換為 WAV
      try {
        convertedBuffer = await convertToWav(fileBuffer, mimeType);
        actualMimeType = "audio/wav";
        logger.info("Audio format conversion successful", {
          source: mimeType,
          target: "audio/wav",
        });
      } catch (conversionError) {
        // ✅ 轉換失敗時：保持原始格式，不要偽裝
        logger.warn("Audio format conversion failed, using original format", {
          source: mimeType,
          error: conversionError instanceof Error ? conversionError.message : String(conversionError),
        });
        // 保持原始 buffer 和 MIME type
        actualMimeType = mimeType;
      }

      const formData = new FormData();
      const blob = new Blob([convertedBuffer], { type: actualMimeType });
      formData.append("file", blob, filename);

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

  // ✅ generateStubPrediction 已移除
  // 原因：醫療應用不應該在模型服務不可用時返回隨機結果
  // 改為返回 503 Service Unavailable

  /**
   * GET /api/healthz (Liveness Probe)
   * 
   * Returns 200 if Node.js server is running.
   * Used by Docker/K8s to determine if container should be restarted.
   * Does NOT check Python backend or model status.
   */
  app.get("/api/healthz", (_req: Request, res: Response): void => {
    res.json({
      status: "alive",
      timestamp: new Date().toISOString(),
      service: "covid-cough-detection-api",
      version: APP_VERSION,
    });
  });

  /**
   * GET /api/readyz (Readiness Probe)
   * 
   * Returns 200 only if Node.js AND Python backend AND model are ready.
   * Used by Docker/K8s to determine if service can accept traffic.
   * Returns 503 if any dependency is unavailable.
   */
  app.get("/api/readyz", async (_req: Request, res: Response): Promise<void> => {
    try {
      // Check Python backend health
      const pythonHealthResponse = await fetch(`${PYTHON_API_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!pythonHealthResponse.ok) {
        res.status(503).json({
          status: "not_ready",
          timestamp: new Date().toISOString(),
          python_backend: "unavailable",
          reason: "Python backend is not responding",
        });
        return;
      }

      // ✅ Parse Python health response to check model_loaded
      const pythonHealth = (await pythonHealthResponse.json()) as Record<string, unknown>;
      const modelLoaded = pythonHealth.model_loaded === true;

      if (!modelLoaded) {
        res.status(503).json({
          status: "not_ready",
          timestamp: new Date().toISOString(),
          python_backend: "ok",
          model_loaded: false,
          reason: "Model not loaded in Python backend",
        });
        return;
      }

      res.json({
        status: "ready",
        timestamp: new Date().toISOString(),
        python_backend: "ok",
        model_loaded: true,
      });
    } catch (err) {
      res.status(503).json({
        status: "not_ready",
        timestamp: new Date().toISOString(),
        python_backend: "unavailable",
        reason: err instanceof Error ? err.message : "Unknown error",
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

  /**
   * GET /api/version
   */
  app.get("/api/version", async (_req: Request, res: Response): Promise<void> => {
    try {
      const pythonVersionResponse = await fetch(`${PYTHON_API_URL}/version`, {
        signal: AbortSignal.timeout(5000),
      });

      if (pythonVersionResponse.ok) {
        const pythonVersion = await pythonVersionResponse.json();
        res.json({
          api_version: APP_VERSION,
          model_version: (pythonVersion as Record<string, unknown>).model_version || "unknown",
          python_backend: "connected",
          timestamp: new Date().toISOString(),
        });
        return;
      }
    } catch {
      // Fall through to default response
    }

    res.json({
      api_version: APP_VERSION,
      model_version: "unavailable",
      python_backend: "unavailable",
      timestamp: new Date().toISOString(),
    });
  });

  // ========================================================================
  // Static Files & SPA Fallback
  // ========================================================================

  const staticPath = path.resolve(__dirname, "public");
  app.use(express.static(staticPath));

  // SPA fallback
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  // ========================================================================
  // Error Handler
  // ========================================================================

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error", err);
    res.status(500).json({
      error: "Internal server error",
      details: isDev ? err.message : undefined,
    } as ErrorResponse);
  });

  // ========================================================================
  // Start Server
  // ========================================================================

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    logger.info("Server started", {
      port,
      environment: isDev ? "development" : "production",
      python_api_url: PYTHON_API_URL,
    });
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  });

  return server;
}

// Start server
startServer().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
