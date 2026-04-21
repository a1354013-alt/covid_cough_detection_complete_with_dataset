import express, { NextFunction, Request, Response } from "express";
import { createServer, Server } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Busboy from "busboy";
import type { FileInfo } from "busboy";

import { convertToWav } from "./audio-converter.js";
import { validateAudioFile } from "./audio-validator.js";
import { API_VERSION } from "./config/version.js";
import { logger } from "./logger.js";
import { RateLimiter } from "./rate-limiter.js";
import { inferenceHistory } from "./inference-history.js";
import { inferenceDatabase } from "./inference-database.js";
import { optionalApiKeyAuth, getApiKeyStats } from "./api-key-auth.js";
import { requestIdMiddleware, sendError } from "./http.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerStatusRoutes } from "./routes/status.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerPredictRoutes } from "./routes/predict.js";

interface BackendPredictionResponse {
  label: "positive" | "negative";
  prob: number;
  model_version: string;
  /**
   * Model-side processing time reported by the Python inference service.
   * Gateway end-to-end request time is measured separately in the Node route.
   */
  processing_time_ms: number;
  request_id?: string; // Added for request tracing
}

interface ParseMultipartResult {
  file?: Buffer;
  filename?: string;
  mimeType?: string;
  status?: number;
  error?: string;
  details?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface BackendForwardSuccess {
  ok: true;
  prediction: BackendPredictionResponse;
}

interface BackendForwardFailure {
  ok: false;
  status: number;
  error: string;
  details?: string;
}

type BackendForwardResult = BackendForwardSuccess | BackendForwardFailure;

interface ReadinessCheckResult {
  isReady: boolean;
  modelLoaded: boolean;
  error?: string;
  modelVersion?: string;
  device?: string;
}

const isDev = process.env.NODE_ENV !== "production";
const PORT = parseInteger(process.env.PORT, 3000);
const PYTHON_API_URL =
  process.env.PYTHON_API_URL || process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const PYTHON_API_ORIGIN = parseOrigin(PYTHON_API_URL);
const REQUEST_TIMEOUT = parseInteger(process.env.REQUEST_TIMEOUT, 60000);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = Math.max(1, parseInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 30));
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60_000;
const CACHE_TTL_SECONDS = parseInteger(process.env.CACHE_TTL_SECONDS, 3600);
const ENABLE_DATABASE = process.env.ENABLE_DATABASE !== "false";

const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY, isDev);
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const CONNECT_SRC_EXTRA = parseConnectSrcExtra(process.env.CSP_CONNECT_SRC_EXTRA);

if (!isDev && ALLOWED_ORIGINS.length === 0) {
  throw new Error(
    "ALLOWED_ORIGINS must be configured in production. Example: https://app.example.com"
  );
}

logger.info("Server configuration", {
  node_env: process.env.NODE_ENV || "development",
  port: PORT,
  python_api_url: PYTHON_API_URL,
  request_timeout_ms: REQUEST_TIMEOUT,
  trust_proxy: TRUST_PROXY,
  rate_limit_window_ms: RATE_LIMIT_WINDOW_MS,
  rate_limit_max_requests: RATE_LIMIT_MAX_REQUESTS,
  allowed_origins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : ["*"],
  csp_connect_src_extra: CONNECT_SRC_EXTRA,
});

const rateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS, {
  maxEntries: 10000,
  cleanupIntervalMs: RATE_LIMIT_CLEANUP_INTERVAL_MS,
});
let signalHandlersRegistered = false;
let shutdownInFlight: Promise<void> | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    throw new Error(`Invalid PYTHON_API_URL: ${url}`);
  }
}

function parseTrustProxy(raw: string | undefined, devMode: boolean): boolean | number {
  if (raw === undefined) {
    return devMode ? false : 1;
  }

  if (raw === "true") return true;
  if (raw === "false") return false;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : devMode ? false : 1;
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "*") {
    return [];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parseConnectSrcExtra(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(" ")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function getRateLimitKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function checkRateLimit(req: Request): RateLimitResult {
  const key = getRateLimitKey(req);
  return rateLimiter.check(key);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizePythonPayload(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  if (!record) return {};

  const detail = asRecord(record.detail);
  return detail ?? record;
}

function parseValidatedPredictionResponse(payload: unknown): BackendPredictionResponse | null {
  const record = asRecord(payload);
  if (!record) return null;

  const label = record.label;
  if (label !== "positive" && label !== "negative") return null;

  const prob = record.prob;
  if (typeof prob !== "number" || !Number.isFinite(prob) || prob < 0 || prob > 1) return null;

  const modelVersion = record.model_version;
  if (typeof modelVersion !== "string" || modelVersion.length === 0) return null;

  const processingTimeMs = record.processing_time_ms;
  if (
    typeof processingTimeMs !== "number" ||
    !Number.isFinite(processingTimeMs) ||
    processingTimeMs < 0
  ) {
    return null;
  }

  return {
    label,
    prob,
    model_version: modelVersion,
    processing_time_ms: processingTimeMs,
  };
}

function errorFromPythonPayload(payload: Record<string, unknown>): {
  error: string;
  details?: string;
} {
  const detailValue = payload.detail;

  if (typeof detailValue === "string" && detailValue.length > 0) {
    return { error: detailValue };
  }

  const detailObject = asRecord(detailValue);
  if (detailObject) {
    const reason = detailObject.error;
    if (typeof reason === "string" && reason.length > 0) {
      const details =
        typeof detailObject.details === "string" && detailObject.details.length > 0
          ? detailObject.details
          : undefined;
      return { error: reason, details };
    }
  }

  const errorValue = payload.error;
  if (typeof errorValue === "string" && errorValue.length > 0) {
    const details =
      typeof payload.details === "string" && payload.details.length > 0
        ? payload.details
        : undefined;
    return { error: errorValue, details };
  }

  return { error: "Python backend returned an unknown error" };
}

function setRateLimitHeaders(res: Response, result: RateLimitResult): number {
  const resetInSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  const remaining = Math.max(0, result.remaining);

  res.setHeader("RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS.toString());
  res.setHeader("RateLimit-Remaining", remaining.toString());
  res.setHeader("RateLimit-Reset", resetInSeconds.toString());
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS.toString());
  res.setHeader("X-RateLimit-Remaining", remaining.toString());
  res.setHeader("X-RateLimit-Reset", resetInSeconds.toString());

  return resetInSeconds;
}

function resolveClientPublicDir(): string | null {
  const candidates = [
    path.resolve(__dirname, "public"),
    path.resolve(__dirname, "../../client/dist"),
    path.resolve(process.cwd(), "server/dist/public"),
    path.resolve(process.cwd(), "client/dist"),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  return null;
}

function setVaryOrigin(res: Response): void {
  const current = res.getHeader("Vary");
  if (!current) {
    res.setHeader("Vary", "Origin");
    return;
  }

  const normalized = String(current);
  if (!normalized.toLowerCase().includes("origin")) {
    res.setHeader("Vary", `${normalized}, Origin`);
  }
}

function applySecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  const requestOrigin = req.headers.origin;

  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (typeof requestOrigin === "string" && ALLOWED_ORIGINS.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    setVaryOrigin(res);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (!isDev && req.secure) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  const connectSources = ["'self'", PYTHON_API_ORIGIN, ...CONNECT_SRC_EXTRA];
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "media-src 'self' blob:",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

function parseMultipart(req: Request): Promise<ParseMultipartResult> {
  return new Promise((resolve) => {
    const contentType = req.headers["content-type"];
    if (!contentType?.includes("multipart/form-data")) {
      resolve({ error: "Content-Type must be multipart/form-data" });
      return;
    }

    let settled = false;
    let selectedFile: Buffer | undefined;
    let selectedFilename: string | undefined;
    let selectedMimeType: string | undefined;
    let sawCandidateField = false;
    let parser: ReturnType<typeof Busboy> | null = null;

    const timeoutId = setTimeout(() => {
      finalize({
        status: 408,
        error: "Request timeout",
        details: "Upload timed out before multipart parsing completed",
      });
    }, REQUEST_TIMEOUT);

    const finalize = (result: ParseMultipartResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      req.removeListener("aborted", onAborted);
      req.removeListener("error", onRequestError);

      if (parser) {
        try {
          req.unpipe(parser);
        } catch {
          // no-op
        }
      }

      resolve(result);
    };

    const onAborted = () => {
      finalize({ error: "Request aborted by client" });
    };

    const onRequestError = (err: Error) => {
      finalize({ status: 400, error: "Request stream error", details: err.message });
    };

    req.on("aborted", onAborted);
    req.on("error", onRequestError);

    try {
      parser = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: MAX_FILE_SIZE,
        },
      });

      parser.on("filesLimit", () => {
        finalize({
          status: 400,
          error: "Only one audio file is allowed",
          details: "Upload exactly one file using field name 'audio' or 'file'",
        });
      });

      parser.on("file", (fieldname: string, file: NodeJS.ReadableStream, info: FileInfo) => {
        if (fieldname !== "audio" && fieldname !== "file") {
          file.resume();
          return;
        }

        if (selectedFile) {
          file.resume();
          return;
        }

        sawCandidateField = true;
        const chunks: Buffer[] = [];
        let fileSize = 0;

        selectedFilename = info.filename || "audio.bin";
        selectedMimeType = info.mimeType || "application/octet-stream";

        file.on("data", (chunk: Buffer) => {
          fileSize += chunk.length;
          if (fileSize > MAX_FILE_SIZE) {
            finalize({
              status: 413,
              error: "File too large",
              details: `Audio file size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
            });
            return;
          }
          chunks.push(chunk);
        });

        file.on("limit", () => {
          finalize({
            status: 413,
            error: "File too large",
            details: `Audio file size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
          });
        });

        file.on("end", () => {
          if (settled) return;
          selectedFile = Buffer.concat(chunks);
        });

        file.on("error", (err: Error) => {
          finalize({ status: 400, error: "File upload error", details: err.message });
        });
      });

      parser.on("error", (err: Error) => {
        finalize({ status: 400, error: "Failed to parse multipart data", details: err.message });
      });

      parser.on("close", () => {
        if (settled) return;

        if (!sawCandidateField || !selectedFile) {
          finalize({
            status: 400,
            error: "No audio file found in request",
            details: "Use multipart/form-data with field name 'audio' or 'file'",
          });
          return;
        }

        finalize({
          file: selectedFile,
          filename: selectedFilename,
          mimeType: selectedMimeType,
        });
      });

      req.pipe(parser);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      finalize({ status: 400, error: "Failed to parse multipart data", details: message });
    }
  });
}

async function parseJsonSafely(response: globalThis.Response): Promise<Record<string, unknown>> {
  try {
    const payload = (await response.json()) as unknown;
    return normalizePythonPayload(payload);
  } catch {
    return {};
  }
}

async function checkPythonReadiness(): Promise<ReadinessCheckResult> {
  try {
    const response = await fetch(`${PYTHON_API_URL}/readyz`, {
      signal: AbortSignal.timeout(5000),
    });

    const payload = await parseJsonSafely(response);
    const modelLoaded = payload.model_loaded === true;
    const status = payload.status;
    const isReady = response.ok && status === "ready" && modelLoaded;

    if (!isReady) {
      const payloadError =
        typeof payload.error === "string"
          ? payload.error
          : `Python backend readiness returned ${response.status}`;

      return {
        isReady: false,
        modelLoaded,
        error: payloadError,
        modelVersion:
          typeof payload.model_version === "string" ? payload.model_version : undefined,
        device: typeof payload.device === "string" ? payload.device : undefined,
      };
    }

    return {
      isReady: true,
      modelLoaded: true,
      modelVersion: typeof payload.model_version === "string" ? payload.model_version : undefined,
      device: typeof payload.device === "string" ? payload.device : undefined,
    };
  } catch (err) {
    return {
      isReady: false,
      modelLoaded: false,
      error: `Python backend connection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function buildReadinessBody(result: ReadinessCheckResult): Record<string, unknown> {
  const timestamp = new Date().toISOString();

  if (!result.isReady) {
    return {
      status: "degraded",
      timestamp,
      api_version: API_VERSION,
      python_backend: {
        status: "degraded",
        model_loaded: result.modelLoaded,
        ...(result.modelVersion ? { model_version: result.modelVersion } : {}),
        ...(result.device ? { device: result.device } : {}),
        ...(result.error ? { error: result.error } : { error: "Model not ready" }),
      },
    };
  }

  return {
    status: "ready",
    timestamp,
    api_version: API_VERSION,
    python_backend: {
      status: "ready",
      model_loaded: true,
      ...(result.modelVersion ? { model_version: result.modelVersion } : {}),
      ...(result.device ? { device: result.device } : {}),
    },
  };
}

function mapBackendFailureToGatewayResponse(failure: BackendForwardFailure): {
  status: number;
  error: string;
  details?: string;
} {
  if (failure.status === 400 || failure.status === 422) {
    return {
      status: 400,
      error: failure.error || "Invalid audio input",
      details: failure.details,
    };
  }

  if (failure.status === 413) {
    return {
      status: 413,
      error: failure.error || "File too large",
      details: failure.details,
    };
  }

  if (failure.status === 503) {
    return {
      status: 503,
      error: failure.error || "Model service not ready",
      details: failure.details,
    };
  }

  if (failure.status === 502) {
    return {
      status: 502,
      error: failure.error || "Unexpected response from inference backend",
      details: failure.details,
    };
  }

  if (failure.status >= 500) {
    return {
      status: 500,
      error: "Inference backend internal error",
      details: failure.details || failure.error,
    };
  }

  return {
    status: 502,
    error: "Unexpected response from inference backend",
    details: failure.details || failure.error,
  };
}

async function forwardToPythonBackend(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<BackendForwardResult> {
  let payloadBuffer = fileBuffer;
  let payloadFileName = filename;
  let payloadMimeType = mimeType;

  try {
    payloadBuffer = await convertToWav(fileBuffer, mimeType);
    payloadMimeType = "audio/wav";
    payloadFileName = filename.replace(/\.[^.]+$/, ".wav");
  } catch (err) {
    logger.warn("Audio conversion skipped; forwarding original payload", {
      source_mime_type: mimeType,
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const formData = new FormData();
    const payloadBytes = new Uint8Array(payloadBuffer);

    formData.append(
      "file",
      new Blob([payloadBytes], { type: payloadMimeType }),
      payloadFileName
    );

    const response = await fetch(`${PYTHON_API_URL}/predict`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      const payload = await parseJsonSafely(response);
      const parsedError = errorFromPythonPayload(payload);
      return {
        ok: false,
        status: response.status,
        error: parsedError.error,
        details: parsedError.details,
      };
    }

    let rawBody: unknown;
    try {
      rawBody = await response.json();
    } catch {
      return {
        ok: false,
        status: 502,
        error: "Inference backend returned invalid JSON",
      };
    }

    const prediction = parseValidatedPredictionResponse(rawBody);
    if (!prediction) {
      const snippet =
        rawBody !== null && typeof rawBody === "object"
          ? JSON.stringify(rawBody).slice(0, 500)
          : String(rawBody).slice(0, 500);
      return {
        ok: false,
        status: 502,
        error: "Inference backend returned an invalid prediction payload",
        details: snippet || undefined,
      };
    }

    return { ok: true, prediction };
  } catch (err) {
    return {
      ok: false,
      status: 503,
      error: "Model service degraded",
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

function logApiRequestLifecycle(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }

  const start = Date.now();
  const pathLabel = req.originalUrl || req.url;
  logger.logRequest(req.method, pathLabel);

  res.on("finish", () => {
    logger.logResponse(req.method, pathLabel, res.statusCode, Date.now() - start);
  });

  next();
}

function registerSignalHandlers(deps: {
  server: Server;
  stopBackgroundWork: () => void;
  closeDatabase: () => Promise<void>;
}): void {
  if (signalHandlersRegistered) return;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shutdownInFlight) {
      logger.info(`${signal} received while shutdown is in progress`);
      return;
    }

    shutdownInFlight = (async () => {
      logger.info(`${signal} received, starting graceful shutdown`);

      // Stop accepting new work ASAP (rate limiter + intervals).
      deps.stopBackgroundWork();

      await new Promise<void>((resolve) => {
        deps.server.close(() => resolve());
      });
      logger.info("HTTP server closed");

      await deps.closeDatabase();

      process.exit(0);
    })().catch((err) => {
      logger.error(
        "Graceful shutdown failed",
        err instanceof Error ? err : new Error(String(err))
      );
      process.exit(1);
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  signalHandlersRegistered = true;
}

export async function startServer(): Promise<Server> {
  // Initialize database if enabled
  if (ENABLE_DATABASE) {
    await inferenceDatabase.initialize();
  }

  const app = express();
  const databaseReady = ENABLE_DATABASE && inferenceDatabase.isReady();

  app.set("trust proxy", TRUST_PROXY);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.use(applySecurityHeaders);
  app.use(logApiRequestLifecycle);
  // Optional API key authentication (validates if provided, doesn't require)
  app.use(optionalApiKeyAuth);

  registerStatusRoutes(app, {
    databaseReady,
    enableDatabaseFlag: ENABLE_DATABASE,
    inferenceDatabase,
    inferenceHistory,
    rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: RATE_LIMIT_MAX_REQUESTS,
    getApiKeyStats,
    isDev,
    pythonApiUrl: PYTHON_API_URL,
    checkPythonReadiness: async () => ({ ...(await checkPythonReadiness()) } as Record<string, unknown> & { isReady: boolean }),
    buildReadinessBody: (readiness) => buildReadinessBody(readiness as any),
  });

  registerHistoryRoutes(app, {
    databaseReady,
    enableDatabaseFlag: ENABLE_DATABASE,
    inferenceDatabase,
    inferenceHistory,
  });

  registerAdminRoutes(app, {
    databaseReady,
    enableDatabaseFlag: ENABLE_DATABASE,
    inferenceDatabase,
  });

  registerPredictRoutes(app, {
    databaseReady,
    maxFileSizeBytes: MAX_FILE_SIZE,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    rateLimitMaxRequests: RATE_LIMIT_MAX_REQUESTS,
    checkRateLimit,
    setRateLimitHeaders,
    parseMultipart,
    validateAudioFile,
    forwardToPythonBackend,
    mapBackendFailureToGatewayResponse,
    getRateLimitKey,
    inferenceDatabase,
    inferenceHistory,
    logger,
  });

  const publicDir = resolveClientPublicDir();
  if (publicDir) {
    logger.info("Serving frontend static assets", { public_dir: publicDir });
    app.use(express.static(publicDir, { index: false }));

    app.get("*", (req: Request, res: Response, next: NextFunction) => {
      if (req.path === "/api" || req.path.startsWith("/api/")) {
        next();
        return;
      }

      if (!req.accepts("html")) {
        next();
        return;
      }

      res.sendFile(path.join(publicDir, "index.html"));
    });
  } else {
    logger.warn("No frontend dist found; API-only mode enabled");
  }

  app.use((_req: Request, res: Response) => {
    // If request_id middleware was skipped for some reason, still return a stable envelope.
    sendError(_req, res, 404, "Not found", "The requested endpoint does not exist");
  });

  const server = createServer(app);
  rateLimiter.start();

  // Start cache cleanup interval if database is enabled
  let cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;
  if (databaseReady) {
    cacheCleanupInterval = setInterval(() => {
      const deleted = inferenceDatabase.cleanupExpiredCache();
      if (deleted > 0) {
        logger.debug('Cleaned up expired cache entries', { count: deleted });
      }
    }, 5 * 60_000); // Every 5 minutes
  }

  server.listen(PORT, "0.0.0.0", () => {
    logger.info("HTTP server started", { port: PORT, trust_proxy: TRUST_PROXY });
  });

  server.on("close", () => {
    rateLimiter.stop();
    rateLimiter.clear();
    
    // Clear cache cleanup interval
    if (cacheCleanupInterval) {
      clearInterval(cacheCleanupInterval);
      cacheCleanupInterval = null;
    }
  });

  registerSignalHandlers({
    server,
    stopBackgroundWork: () => {
      rateLimiter.stop();
      rateLimiter.clear();
      if (cacheCleanupInterval) {
        clearInterval(cacheCleanupInterval);
        cacheCleanupInterval = null;
      }
    },
    closeDatabase: async () => {
      if (ENABLE_DATABASE) {
        await inferenceDatabase.close();
      }
    },
  });

  return server;
}

if (process.env.SKIP_SERVER_START !== "true") {
  startServer().catch((err) => {
    logger.error("Failed to start server", err instanceof Error ? err : new Error(String(err)));
    process.exit(1);
  });
}
