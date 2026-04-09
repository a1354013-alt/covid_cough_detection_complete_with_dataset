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

export interface HealthzResponse {
  status: "alive";
  timestamp: string;
  service: string;
  version: string;
}

export interface ReadinessResponse {
  status: "ready" | "not_ready";
  timestamp: string;
  python_backend: "ok" | "started" | "unreachable";
  model_loaded?: boolean;
  reason?: string;
  model_version?: string;
  device?: string;
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
            reject(new Error("Invalid response format from server"));
            return;
          }
        }

        if (xhr.status === 503) {
          reject(new Error("Model service temporarily unavailable. Please try again later."));
          return;
        }

        if (xhr.status === 400) {
          try {
            const error = JSON.parse(xhr.responseText) as ApiError;
            reject(new Error(error.details || error.error || "Invalid audio format"));
            return;
          } catch {
            reject(new Error("Invalid audio format"));
            return;
          }
        }

        reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
      };

      xhr.onerror = () => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(new Error("Network error. Please check your connection."));
      };

      xhr.onabort = () => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(new Error("Request cancelled"));
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

    if (response.status === 503) {
      let reason: string | undefined;
      try {
        const body = (await response.json()) as Record<string, unknown>;
        if (typeof body.reason === "string" && body.reason.length > 0) {
          reason = body.reason;
        }
      } catch {
        // If response body is not JSON, fall back to a generic message.
      }
      throw new Error(reason ? `Service not ready: ${reason}` : "Service not ready: Model unavailable");
    }

    if (!response.ok) {
      throw new Error(`Readiness check failed: ${response.statusText}`);
    }

    return (await response.json()) as ReadinessResponse;
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

export const apiClient = new ApiClient("/api");
