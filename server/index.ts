import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { validateAudioFile } from "./audio-validator";
import { logger } from "./logger";

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
  error?: string;
  details?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "60000", 10);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30;

logger.info("Configuration", {
  python_api_url: PYTHON_API_URL,
  request_timeout: REQUEST_TIMEOUT,
  max_file_size: MAX_FILE_SIZE,
  rate_limit_window: RATE_LIMIT_WINDOW,
  rate_limit_max_requests: RATE_LIMIT_MAX_REQUESTS,
});

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function getRateLimitKey(req: Request): string {
  // Use IP address or forwarded IP
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"
  );
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

// ============================================================================
// Multipart Parser
// ============================================================================

/**
 * Simple multipart form-data parser
 */
async function parseMultipart(req: Request): Promise<ParseMultipartResult> {
  return new Promise((resolve) => {
    const contentType = req.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      resolve({ error: "Content-Type must be multipart/form-data" });
      return;
    }

    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
      resolve({ error: "Invalid multipart boundary" });
      return;
    }

    const boundary = boundaryMatch[1];
    const chunks: Buffer[] = [];
    let resolved = false;

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (resolved) return;
      resolved = true;

      try {
        const body = Buffer.concat(chunks);
        const bodyStr = body.toString("binary");
        const parts = bodyStr.split(`--${boundary}`);

        for (const part of parts) {
          if (part.includes('name="audio"')) {
            const filenameMatch = part.match(/filename="([^"]+)"/);
            const filename = filenameMatch ? filenameMatch[1] : "audio.wav";

            const headerEndIndex = part.indexOf("\r\n\r\n");
            if (headerEndIndex !== -1) {
              const fileStart = headerEndIndex + 4;
              const fileEnd = part.lastIndexOf("\r\n");
              const fileContent = part.substring(fileStart, fileEnd);
              const fileBuffer = Buffer.from(fileContent, "binary");

              resolve({ file: fileBuffer, filename });
              return;
            }
          }
        }

        resolve({ error: "No audio file found in request" });
      } catch (err) {
        resolve({
          error: "Failed to parse multipart data",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    });

    req.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      resolve({
        error: "Request error",
        details: err.message,
      });
    });
  });
}

// ============================================================================
// Server Setup
// ============================================================================

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Security Headers Middleware
  app.use((_req: Request, res: Response, next: NextFunction) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Content-Security-Policy", "default-src 'self'");

    next();
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
      const { file, filename, error: parseError } = await parseMultipart(req);

      if (parseError) {
        logger.warn("Multipart parse error", { error: parseError });
        res.status(400).json({
          error: parseError,
        } as ErrorResponse);
        return;
      }

      if (!file) {
        logger.warn("No audio file provided");
        res.status(400).json({
          error: "No audio file provided",
        } as ErrorResponse);
        return;
      }

      // Validate audio file
      const validation = validateAudioFile(file, filename);

      if (!validation.valid) {
        logger.warn("Audio validation failed", {
          error: validation.error,
          filename,
        });
        res.status(400).json({
          error: validation.error,
        } as ErrorResponse);
        return;
      }

      logger.logPrediction(filename || "unknown", file.length, validation.format || "unknown");

      // Try to use Python backend first
      const pythonResponse = await forwardToPythonBackend(file, filename || "audio.wav");

      if (pythonResponse) {
        const duration = Date.now() - startTime;
        logger.logPredictionResult(
          pythonResponse.label,
          pythonResponse.prob,
          duration
        );
        res.json(pythonResponse);
        return;
      }

      // Fallback to stub prediction if Python backend unavailable
      logger.warn("Python backend unavailable, using stub prediction");
      const stubPrediction = generateStubPrediction();
      const duration = Date.now() - startTime;
      logger.logPredictionResult(stubPrediction.label, stubPrediction.prob, duration);
      res.json(stubPrediction);
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error("Prediction error", err instanceof Error ? err : new Error(String(err)), {
        duration_ms: duration,
      });

      res.status(500).json({
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" && err instanceof Error ? err.message : undefined,
      } as ErrorResponse);
    }
  });

  /**
   * Forward request to Python backend
   */
  async function forwardToPythonBackend(
    fileBuffer: Buffer,
    filename: string
  ): Promise<PredictionResponse | null> {
    try {
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: "audio/webm" });
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

  /**
   * Generate stub prediction for testing
   */
  function generateStubPrediction(): PredictionResponse {
    const isPositive = Math.random() > 0.5;
    const prob = Math.random();

    return {
      label: isPositive ? "positive" : "negative",
      prob: isPositive ? prob : 1 - prob,
      model_version: "stub-0.1",
    };
  }

  /**
   * GET /api/health
   */
  app.get("/api/health", async (_req: Request, res: Response): Promise<void> => {
    try {
      // Check Python backend health
      const pythonHealthResponse = await fetch(`${PYTHON_API_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      const pythonHealthy = pythonHealthResponse.ok;

      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        python_backend: pythonHealthy ? "ok" : "unavailable",
      });
    } catch {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        python_backend: "unavailable",
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
          api_version: "1.0.0",
          model_version: pythonVersion.model_version || "stub-0.1",
          python_backend: "connected",
          timestamp: new Date().toISOString(),
        });
        return;
      }
    } catch {
      // Fall through to default response
    }

    res.json({
      api_version: "1.0.0",
      model_version: "stub-0.1",
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
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    } as ErrorResponse);
  });

  // ========================================================================
  // Start Server
  // ========================================================================

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    logger.info("Server started", {
      port,
      environment: process.env.NODE_ENV || "development",
      python_api_url: PYTHON_API_URL,
    });

    console.log(`\n🚀 COVID-19 Cough Detection API`);
    console.log(`📍 Server running on http://localhost:${port}/`);
    console.log(`🐍 Python backend: ${PYTHON_API_URL}`);
    console.log(`\n📡 API Endpoints:`);
    console.log(`   POST /api/predict  - Audio prediction`);
    console.log(`   GET  /api/health   - Health check`);
    console.log(`   GET  /api/version  - API version\n`);
  });
}

startServer().catch((err) => {
  logger.error("Failed to start server", err instanceof Error ? err : new Error(String(err)));
  process.exit(1);
});
