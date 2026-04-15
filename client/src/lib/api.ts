import { API_BASE_URL } from "@/const";

export interface ApiPredictionResponse {
  label: "positive" | "negative";
  prob: number;
  model_version: string;
  processing_time_ms: number;
}

export interface UIPredictionResult {
  rawLabel: "positive" | "negative";
  confidenceValue: number;
  displayLabel: string;
  confidenceText: string;
  modelVersion: string;
  timestamp: Date;
  processingTimeMs: number;
}

export interface ApiError {
  error: string;
  details?: string;
}

/** Prefer gateway `error` (human summary); append `details` only in dev when distinct. */
function gatewayErrorUserMessage(parsed: ApiError | null, fallback: string): string {
  const err = parsed?.error?.trim();
  const det = parsed?.details?.trim();
  if (err) {
    if (import.meta.env.DEV && det && det !== err) {
      return `${err} — ${det}`;
    }
    return err;
  }
  if (det) return det;
  return fallback;
}

export class ApiRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export interface HealthzResponse {
  status: "alive";
  timestamp: string;
  service: string;
  version: string;
}

export interface ReadinessResponse {
  status: "ready" | "degraded";
  timestamp: string;
  api_version: string;
  python_backend: {
    status: "ready" | "degraded";
    model_loaded: boolean;
    error?: string;
    model_version?: string;
    device?: string;
  };
}

export interface VersionResponse {
  api_version: string;
  node_version: string;
  python_backend: Record<string, unknown>;
  timestamp: string;
}

class ApiClient {
  private readonly REQUEST_TIMEOUT = 120000;

  constructor(private readonly baseUrl: string = "/api") {}

  async predict(
    audioBlob: Blob,
    filename: string,
    onProgress?: (progress: number) => void
  ): Promise<ApiPredictionResponse> {
    const formData = new FormData();
    formData.append("audio", audioBlob, filename);

    const xhr = new XMLHttpRequest();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
    }

    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        xhr.abort();
        reject(new Error(`Request timeout after ${this.REQUEST_TIMEOUT}ms`));
      }, this.REQUEST_TIMEOUT);

      xhr.onload = () => {
        if (timeoutId) clearTimeout(timeoutId);

        if (xhr.status === 200) {
          try {
            resolve(JSON.parse(xhr.responseText) as ApiPredictionResponse);
            return;
          } catch {
            reject(new ApiRequestError("Invalid response format from server", 502));
            return;
          }
        }

        let parsedError: ApiError | null = null;
        try {
          parsedError = JSON.parse(xhr.responseText) as ApiError;
        } catch {
          parsedError = null;
        }

        if (xhr.status === 400) {
          reject(
            new ApiRequestError(gatewayErrorUserMessage(parsedError, "Invalid audio request"), 400)
          );
          return;
        }

        if (xhr.status === 413) {
          reject(
            new ApiRequestError(
              gatewayErrorUserMessage(
                parsedError,
                "Audio file is too large. Maximum size is 10MB."
              ),
              413
            )
          );
          return;
        }

        if (xhr.status === 429) {
          reject(
            new ApiRequestError(
              gatewayErrorUserMessage(
                parsedError,
                "Too many requests. Please wait before trying again."
              ),
              429
            )
          );
          return;
        }

        if (xhr.status === 503) {
          reject(
            new ApiRequestError(
              gatewayErrorUserMessage(
                parsedError,
                "Model service is not ready. Please try again shortly."
              ),
              503
            )
          );
          return;
        }

        if (xhr.status === 502) {
          reject(
            new ApiRequestError(
              gatewayErrorUserMessage(
                parsedError,
                "Received an invalid response from the inference service."
              ),
              502
            )
          );
          return;
        }

        if (xhr.status === 500) {
          reject(
            new ApiRequestError(
              gatewayErrorUserMessage(
                parsedError,
                "Inference service encountered an internal error."
              ),
              500
            )
          );
          return;
        }

        reject(
          new ApiRequestError(
            gatewayErrorUserMessage(
              parsedError,
              `Server error: ${xhr.status} ${xhr.statusText}`
            ),
            xhr.status
          )
        );
      };

      xhr.onerror = () => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(new ApiRequestError("Network error. Please check your connection."));
      };

      xhr.onabort = () => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(new ApiRequestError("Request cancelled"));
      };

      xhr.open("POST", `${this.baseUrl}/predict`);
      xhr.send(formData);
    });
  }

  async getHealth(): Promise<HealthzResponse> {
    const response = await fetch(`${this.baseUrl}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return (await response.json()) as HealthzResponse;
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const response = await fetch(`${this.baseUrl}/readyz`, {
      signal: AbortSignal.timeout(5000),
    });

    let parsed: ReadinessResponse | null = null;
    try {
      parsed = (await response.json()) as ReadinessResponse;
    } catch {
      parsed = null;
    }

    // /api/readyz uses 503 + a structured degraded payload (not the error envelope).
    if (response.status === 503 && parsed) {
      return parsed;
    }

    if (!response.ok) {
      throw new ApiRequestError(`Readiness check failed: ${response.statusText}`, response.status);
    }

    if (!parsed) {
      throw new ApiRequestError("Readiness check returned invalid JSON", 502);
    }

    return parsed;
  }

  async getVersion(): Promise<VersionResponse> {
    const response = await fetch(`${this.baseUrl}/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Version check failed: ${response.statusText}`);
    }
    return (await response.json()) as VersionResponse;
  }
}

export function formatPrediction(response: ApiPredictionResponse): UIPredictionResult {
  const confidenceValue = Math.round(Math.max(response.prob, 1 - response.prob) * 100);
  const displayLabel =
    response.label === "positive" ? "Possible Positive Signal" : "Possible Negative Signal";

  return {
    rawLabel: response.label,
    confidenceValue,
    displayLabel,
    confidenceText: `${confidenceValue}%`,
    modelVersion: response.model_version,
    timestamp: new Date(),
    processingTimeMs: response.processing_time_ms,
  };
}

export function getAudioFileName(mimeType: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

  if (mimeType.includes("audio/mpeg")) return `cough-${timestamp}.mp3`;
  if (mimeType.includes("audio/wav")) return `cough-${timestamp}.wav`;
  if (mimeType.includes("audio/ogg")) return `cough-${timestamp}.ogg`;
  return `cough-${timestamp}.webm`;
}

export const apiClient = new ApiClient(API_BASE_URL);
