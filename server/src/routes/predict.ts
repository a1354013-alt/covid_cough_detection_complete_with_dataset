import type { Request, Response } from "express";
import type { Express } from "express";
import { createHash } from "node:crypto";

import { sendError } from "../http.js";
import { InferenceHistoryStore } from "../inference-history.js";

type ParseMultipartResult = {
  file?: Buffer;
  filename?: string;
  mimeType?: string;
  status?: number;
  error?: string;
  details?: string;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type BackendForwardSuccess = {
  ok: true;
  prediction: {
    label: "positive" | "negative";
    prob: number;
    model_version: string;
    processing_time_ms: number;
  };
};

type BackendForwardFailure = {
  ok: false;
  status: number;
  error: string;
  details?: string;
};

type BackendForwardResult = BackendForwardSuccess | BackendForwardFailure;

type ValidationResult = {
  valid: boolean;
  error?: string;
  details?: unknown;
  format?: string;
};

type InferenceDatabaseLike = {
  getCachedPrediction: (
    audioHash: string
  ) => {
    label: "positive" | "negative";
    confidence: number;
    processingTimeMs: number;
    modelVersion: string;
  } | null;
  add: (record: {
    requestId: string;
    timestamp: string;
    filename: string;
    label: "positive" | "negative";
    confidence: number;
    processingTimeMs: number;
    clientIp?: string;
    audioHash?: string;
  }) => { requestId: string };
  setCachedPrediction: (
    audioHash: string,
    prediction: {
      label: "positive" | "negative";
      confidence: number;
      processingTimeMs: number;
      modelVersion: string;
    },
    ttlSeconds: number
  ) => void;
  logError: (
    errorType: string,
    errorMessage: string,
    context?: { endpoint?: string; clientIp?: string; stackTrace?: string }
  ) => void;
};

type InferenceHistoryLike = {
  add: (record: {
    timestamp: Date;
    filename: string;
    label: "positive" | "negative";
    confidence: number;
    processingTimeMs: number;
    clientIp?: string;
  }) => { requestId: string };
};

export function registerPredictRoutes(
  app: Express,
  deps: {
    databaseReady: boolean;
    maxFileSizeBytes: number;
    cacheTtlSeconds: number;
    rateLimitMaxRequests: number;
    checkRateLimit: (req: Request) => RateLimitResult;
    setRateLimitHeaders: (res: Response, result: RateLimitResult) => number;
    parseMultipart: (req: Request) => Promise<ParseMultipartResult>;
    validateAudioFile: (buffer: Buffer, filename: string | undefined, maxBytes: number) => ValidationResult;
    forwardToPythonBackend: (
      buffer: Buffer,
      filename: string,
      mimeType: string
    ) => Promise<BackendForwardResult>;
    mapBackendFailureToGatewayResponse: (failure: BackendForwardFailure) => {
      status: number;
      error: string;
      details?: string;
    };
    getRateLimitKey: (req: Request) => string;
    inferenceDatabase: InferenceDatabaseLike;
    inferenceHistory: InferenceHistoryLike;
    logger: {
      info: (msg: string, meta?: Record<string, unknown>) => void;
      logPrediction: (filename: string, bytes: number, format: string) => void;
      logPredictionResult: (label: string, prob: number, processingTimeMs: number) => void;
    };
  }
): void {
  app.post("/api/predict", async (req: Request, res: Response) => {
    const startTime = Date.now();

    const rateLimit = deps.checkRateLimit(req);
    const resetInSeconds = deps.setRateLimitHeaders(res, rateLimit);

    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", resetInSeconds.toString());
      sendError(
        req,
        res,
        429,
        "Too many requests",
        `Rate limit exceeded: ${deps.rateLimitMaxRequests} requests per minute`
      );
      return;
    }

    const parseResult = await deps.parseMultipart(req);
    if (parseResult.error) {
      sendError(req, res, parseResult.status ?? 400, parseResult.error, parseResult.details);
      return;
    }

    if (!parseResult.file) {
      sendError(req, res, 400, "No audio file provided", "Missing multipart audio payload");
      return;
    }

    const validation = deps.validateAudioFile(parseResult.file, parseResult.filename, deps.maxFileSizeBytes);
    if (!validation.valid) {
      sendError(
        req,
        res,
        400,
        validation.error || "Invalid audio file",
        validation.details ? JSON.stringify(validation.details) : undefined
      );
      return;
    }

    const audioHash = createHash("sha256").update(parseResult.file).digest("hex");

    const requestId = (req as { requestId?: string }).requestId || InferenceHistoryStore.generateRequestId();

    if (deps.databaseReady) {
      const cached = deps.inferenceDatabase.getCachedPrediction(audioHash);
      if (cached) {
        deps.logger.info("Cache hit", { audioHash: `${audioHash.substring(0, 16)}...` });

        deps.inferenceDatabase.add({
          requestId,
          timestamp: new Date().toISOString(),
          filename: parseResult.filename || "unknown",
          label: cached.label,
          confidence: cached.confidence,
          processingTimeMs: cached.processingTimeMs,
          clientIp: deps.getRateLimitKey(req),
          audioHash,
        });

        res.json({
          label: cached.label,
          prob: cached.confidence,
          model_version: cached.modelVersion,
          processing_time_ms: cached.processingTimeMs,
          request_id: requestId,
          cached: true,
        });
        return;
      }
    }

    deps.logger.logPrediction(
      parseResult.filename || "unknown",
      parseResult.file.length,
      validation.format || "unknown"
    );

    const forwarded = await deps.forwardToPythonBackend(
      parseResult.file,
      parseResult.filename || "audio.wav",
      parseResult.mimeType || "audio/wav"
    );

    if (!forwarded.ok) {
      const mapped = deps.mapBackendFailureToGatewayResponse(forwarded);

      if (deps.databaseReady) {
        deps.inferenceDatabase.logError("PREDICTION_FAILED", mapped.error, {
          endpoint: "/api/predict",
          clientIp: deps.getRateLimitKey(req),
          stackTrace: mapped.details,
        });
      }

      sendError(req, res, mapped.status, mapped.error, mapped.details);
      return;
    }

    const processingTimeMs = Date.now() - startTime;

    let recorded: { requestId: string };
    if (deps.databaseReady) {
      recorded = deps.inferenceDatabase.add({
        requestId,
        timestamp: new Date().toISOString(),
        filename: parseResult.filename || "unknown",
        label: forwarded.prediction.label,
        confidence: forwarded.prediction.prob,
        processingTimeMs,
        clientIp: deps.getRateLimitKey(req),
        audioHash,
      });

      deps.inferenceDatabase.setCachedPrediction(
        audioHash,
        {
          label: forwarded.prediction.label,
          confidence: forwarded.prediction.prob,
          processingTimeMs,
          modelVersion: forwarded.prediction.model_version,
        },
        deps.cacheTtlSeconds
      );
    } else {
      recorded = deps.inferenceHistory.add({
        timestamp: new Date(),
        filename: parseResult.filename || "unknown",
        label: forwarded.prediction.label,
        confidence: forwarded.prediction.prob,
        processingTimeMs,
        clientIp: deps.getRateLimitKey(req),
      });
    }

    deps.logger.logPredictionResult(
      forwarded.prediction.label,
      forwarded.prediction.prob,
      processingTimeMs
    );

    res.json({
      ...forwarded.prediction,
      request_id: recorded.requestId,
    });
  });
}

