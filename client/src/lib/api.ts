/**
 * API Client for COVID-19 Cough Detection
 * 
 * Handles communication with the backend API for:
 * - Audio file upload and prediction
 * - Health checks
 * - Version information
 */

// ============================================================================
// Types
// ============================================================================

export interface PredictionResponse {
  label: "positive" | "negative";
  prob: number;
  model_version: string;
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
  model_version: string;
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
  ): Promise<PredictionResponse> {
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
          reject(
            new Error(
              "Request timeout (120s). The server took too long to respond. Please try again."
            )
          );
        }, this.REQUEST_TIMEOUT);

        xhr.addEventListener("load", () => {
          if (timeoutId) clearTimeout(timeoutId);

          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText) as PredictionResponse;
              resolve(response);
            } catch (err) {
              reject(new Error("Invalid response format from server"));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText) as ApiError;
              reject(
                new Error(errorData.error || `Server error: HTTP ${xhr.status}`)
              );
            } catch {
              reject(new Error(`Server error: HTTP ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(
            new Error(
              "Network error. Please check your connection and try again."
            )
          );
        });

        xhr.addEventListener("abort", () => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new Error("Request was aborted"));
        });

        xhr.open("POST", `${this.baseUrl}/predict`);
        xhr.send(formData);
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get prediction";
      throw new Error(message);
    }
  }

  /**
   * Check if API is healthy
   * 
   * @returns Health status
   * @throws Error if health check fails
   */
  async health(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as HealthResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Health check failed";
      throw new Error(message);
    }
  }

  /**
   * Get API and model version information
   * 
   * @returns Version information
   * @throws Error if version check fails
   */
  async version(): Promise<VersionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/version`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as VersionResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get version";
      throw new Error(message);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const apiClient = new ApiClient();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate audio filename with timestamp
 * 
 * @param mimeType - Audio MIME type (determines extension)
 * @param timestamp - Optional timestamp (default: current time)
 * @returns Filename in format: cough_YYYYMMDD_HHMMSS.ext
 */
export function getAudioFileName(
  mimeType: string = "audio/webm",
  timestamp: Date = new Date()
): string {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const date = String(timestamp.getDate()).padStart(2, "0");
  const hours = String(timestamp.getHours()).padStart(2, "0");
  const minutes = String(timestamp.getMinutes()).padStart(2, "0");
  const seconds = String(timestamp.getSeconds()).padStart(2, "0");

  let extension = "webm";
  if (mimeType.includes("mp4") || mimeType.includes("mpeg")) {
    extension = "mp4";
  } else if (mimeType.includes("wav")) {
    extension = "wav";
  } else if (mimeType.includes("ogg")) {
    extension = "ogg";
  } else if (mimeType.includes("flac")) {
    extension = "flac";
  }

  return `cough_${year}${month}${date}_${hours}${minutes}${seconds}.${extension}`;
}

/**
 * Format prediction result for display
 * 
 * @param result - Raw prediction response
 * @returns Formatted prediction for UI display
 */
export function formatPrediction(result: PredictionResponse) {
  const isPositive = result.label === "positive";
  const probability = Math.round(result.prob * 100);
  const confidence = Math.round((1 - Math.abs(result.prob - 0.5) * 2) * 100);

  return {
    label: isPositive ? "COVID-19 Positive" : "COVID-19 Negative",
    probability: `${probability}%`,
    confidence: `${confidence}%`,
    modelVersion: result.model_version,
    timestamp: new Date().toLocaleString(),
  };
}

/**
 * Get medical advice based on prediction result
 * 
 * @param label - Prediction label
 * @returns Medical advice text
 */
export function getMedicalAdvice(label: "positive" | "negative"): string {
  if (label === "positive") {
    return "This result suggests a possible COVID-19 infection. Please consult a healthcare professional for proper diagnosis and testing.";
  } else {
    return "This result suggests no COVID-19 infection detected. However, if you have symptoms, please consult a healthcare professional.";
  }
}

/**
 * Get medical disclaimer text
 * 
 * @returns Disclaimer message
 */
export function getDisclaimer(): string {
  return "⚠️ MEDICAL DISCLAIMER: This tool is for reference only and should not be used as a substitute for professional medical diagnosis. Always consult with a qualified healthcare provider for accurate diagnosis and treatment.";
}
