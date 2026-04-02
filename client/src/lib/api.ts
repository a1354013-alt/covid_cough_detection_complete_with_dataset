/**
 * API Client for COVID-19 Cough Detection
 * 
 * Handles communication with the backend API for:
 * - Audio file upload and prediction
 * - Health checks
 * - Version information
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Raw API response from prediction endpoint
 */
export interface ApiPredictionResponse {
  label: "positive" | "negative";
  prob: number;
  model_version: string;
  processing_time_ms: number;
}

/**
 * ✅ 改進的 UI Prediction 結果
 * 分離 raw 數據和 display 文本，避免型別混亂
 */
export interface UIPredictionResult {
  // ✅ Raw 數據（用於邏輯判斷）
  rawLabel: "positive" | "negative";
  confidenceValue: number; // 0-100

  // ✅ Display 文本（用於顯示）
  displayLabel: string; // "Possible Positive Signal" 或 "Possible Negative Signal"
  confidenceText: string; // "95%"

  // ✅ 其他信息
  modelVersion: string;
  timestamp: Date; // ✅ 改為 Date 物件，可安全格式化
  processingTimeMs: number;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface VersionResponse {
  api_version: string;
  model_version: string | null;
  python_backend: string;
  timestamp: string;
}

// ============================================================================
// API Client Class
// ============================================================================

class ApiClient {
  private baseUrl: string;
  private readonly REQUEST_TIMEOUT = 120000; // 120 seconds

  constructor(baseUrl: string = "/api") {
    this.baseUrl = baseUrl;
  }

  /**
   * Upload audio file and get prediction
   * 
   * @param audioBlob - Audio blob from MediaRecorder
   * @param filename - Filename for the audio file
   * @param onProgress - Optional progress callback (0-100)
   * @returns Prediction result
   * @throws Error if prediction fails or times out
   */
  async predict(
    audioBlob: Blob,
    filename: string,
    onProgress?: (progress: number) => void
  ): Promise<ApiPredictionResponse> {
    const formData = new FormData();
    formData.append("audio", audioBlob, filename);

    try {
      // Use XMLHttpRequest for progress tracking and timeout
      const xhr = new XMLHttpRequest();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });
      }

      // Wrap in Promise for async/await usage
      return new Promise((resolve, reject) => {
        // Set timeout to prevent hanging requests
        timeoutId = setTimeout(() => {
          xhr.abort();
          reject(new Error(`Request timeout after ${this.REQUEST_TIMEOUT}ms`));
        }, this.REQUEST_TIMEOUT);

        xhr.onload = () => {
          if (timeoutId) clearTimeout(timeoutId);

          if (xhr.status === 200) {
            try {
              const response: ApiPredictionResponse = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (err) {
              reject(new Error("Invalid response format from server"));
            }
          } else if (xhr.status === 503) {
            reject(new Error("Model service temporarily unavailable. Please try again later."));
          } else if (xhr.status === 400) {
            try {
              const error: ApiError = JSON.parse(xhr.responseText);
              reject(new Error(error.details || error.error || "Invalid audio format"));
            } catch {
              reject(new Error("Invalid audio format"));
            }
          } else {
            reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
          }
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
    } catch (err) {
      throw err instanceof Error ? err : new Error("Prediction failed");
    }
  }

  /**
   * Check API health status
   */
  async getHealth(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Health check failed");
    }
  }

  /**
   * Check API readiness (model available)
   */
  async getReadiness(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/readyz`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 503) {
        throw new Error("Service not ready: Model unavailable");
      }

      if (!response.ok) {
        throw new Error(`Readiness check failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Readiness check failed");
    }
  }

  /**
   * Get version information
   */
  async getVersion(): Promise<VersionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/version`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Version check failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Version check failed");
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * ✅ 改進的 formatPrediction 函數
 * 將 raw API 響應轉換為 UI 友好的格式
 * 分離 raw 數據和 display 文本
 */
export function formatPrediction(response: ApiPredictionResponse): UIPredictionResult {
  // ✅ 計算 confidence（0-100）
  const confidenceValue = Math.round(Math.max(response.prob, 1 - response.prob) * 100);

  // ✅ 生成 display 文本
  const displayLabel = response.label === "positive" 
    ? "Possible Positive Signal" 
    : "Possible Negative Signal";

  const confidenceText = `${confidenceValue}%`;

  return {
    // ✅ Raw 數據
    rawLabel: response.label,
    confidenceValue,

    // ✅ Display 文本
    displayLabel,
    confidenceText,

    // ✅ 其他信息
    modelVersion: response.model_version,
    timestamp: new Date(), // ✅ 改為 Date 物件
    processingTimeMs: response.processing_time_ms,
  };
}

/**
 * Get audio filename based on MIME type
 */
export function getAudioFileName(mimeType: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

  if (mimeType.includes("audio/mpeg")) {
    return `cough-${timestamp}.mp3`;
  }
  if (mimeType.includes("audio/wav")) {
    return `cough-${timestamp}.wav`;
  }
  if (mimeType.includes("audio/ogg")) {
    return `cough-${timestamp}.ogg`;
  }

  // Default to WebM
  return `cough-${timestamp}.webm`;
}

// ============================================================================
// Export API Client Instance
// ============================================================================

export const apiClient = new ApiClient("/api");
