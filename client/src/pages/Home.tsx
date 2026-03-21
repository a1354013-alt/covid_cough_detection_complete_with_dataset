import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mic,
  Square,
  RotateCcw,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Volume2,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { apiClient, formatPrediction, getAudioFileName } from "@/lib/api";
import type { UIPredictionResult } from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

type RecordingState = "idle" | "recording" | "recorded" | "uploading";

interface RecordingData {
  blob: Blob;
  duration: number;
  timestamp: Date;
}

// ============================================================================
// Component
// ============================================================================

export default function Home() {
  // State
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingData, setRecordingData] = useState<RecordingData | null>(null);
  const [prediction, setPrediction] = useState<UIPredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimeRef = useRef(0); // ✅ 即時錄音時間，不受 React state 閉包影響
  const recordedMimeTypeRef = useRef<string>("audio/webm"); // ✅ 存儲實際錄製的 MIME 類型

  // Constants
  const MAX_RECORDING_TIME = 30; // seconds
  const MIN_RECORDING_TIME = 2; // seconds
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // ========================================================================
  // Effects
  // ========================================================================

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      // Clean up audio element
      if (audioElementRef.current?.src && audioElementRef.current.src.startsWith("blob:")) {
        URL.revokeObjectURL(audioElementRef.current.src);
      }
    };
  }, []);

  // ========================================================================
  // Recording Functions
  // ========================================================================

  const startRecording = async () => {
    try {
      setError(null);
      setPrediction(null);
      audioChunksRef.current = [];
      setRecordingTime(0);
      recordingTimeRef.current = 0; // ✅ 重置 ref

      // Request microphone access with specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      });

      // ✅ 改進的 MIME 類型選擇邏輯
      // 優先順序：WebM > MP4 > WAV
      // 不再假設 WAV 一定支援
      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/wav",
      ];

      let mimeType = "";
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      // 如果都不支援，使用預設
      if (!mimeType) {
        mimeType = ""; // 使用瀏覽器預設
      }

      recordedMimeTypeRef.current = mimeType; // ✅ 存儲實際使用的 MIME 類型

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recordedMimeTypeRef.current || "audio/webm",
        });

        // Validate file size
        if (audioBlob.size > MAX_FILE_SIZE) {
          setError(`Recording too large (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
          setRecordingState("idle");
          return;
        }

        // ✅ 使用 ref 中的即時值，而不是 state 中的舊值
        const finalDuration = recordingTimeRef.current;

        // ✅ 驗證錄音時間
        if (finalDuration < MIN_RECORDING_TIME) {
          setError(`Recording too short (${finalDuration}s). Minimum is ${MIN_RECORDING_TIME}s.`);
          setRecordingState("idle");
          return;
        }

        setRecordingData({
          blob: audioBlob,
          duration: finalDuration,
          timestamp: new Date(),
        });

        setRecordingState("recorded");
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecordingState("recording");

      // ✅ 改進的計時器邏輯
      // 同時更新 state（用於 UI 顯示）和 ref（用於 onstop 讀取）
      timerIntervalRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);

        if (recordingTimeRef.current >= MAX_RECORDING_TIME) {
          mediaRecorder.stop();
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
          }
        }
      }, 1000);
    } catch (err) {
      let message = "Failed to access microphone";
      
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          message = "Microphone permission denied. Please allow access to your microphone.";
        } else if (err.name === "NotFoundError") {
          message = "No microphone found. Please connect a microphone and try again.";
        } else if (err.name === "NotReadableError") {
          message = "Microphone is in use by another application. Please close other apps and try again.";
        }
      } else if (err instanceof Error) {
        message = err.message;
      }

      setError(message);
      setRecordingState("idle");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const resetRecording = () => {
    // ✅ 改進：完整的資源釋放
    // 1. 停止音訊播放
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      
      // 2. 釋放 blob URL
      if (audioElementRef.current.src && audioElementRef.current.src.startsWith("blob:")) {
        URL.revokeObjectURL(audioElementRef.current.src);
      }
      audioElementRef.current.src = "";
    }
    
    // 3. 清空錄音數據
    audioChunksRef.current = [];
    
    // 4. 重置狀態
    setRecordingState("idle");
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    setRecordingData(null);
    setPrediction(null);
    setError(null);
    setUploadProgress(0);
  };

  // ========================================================================
  // Upload & Prediction
  // ========================================================================

  const uploadRecording = async () => {
    if (!recordingData) return;

    setRecordingState("uploading");
    setError(null);
    setUploadProgress(0);

    try {
      // Get filename based on actual recorded format
      const filename = getAudioFileName(recordedMimeTypeRef.current);

      const result = await apiClient.predict(
        recordingData.blob,
        filename,
        (progress) => setUploadProgress(progress)
      );

      const formatted = formatPrediction(result);
      setPrediction(formatted);
      setRecordingState("recorded");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setRecordingState("recorded");
    }
  };

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            COVID-19 Cough Detection
          </h1>
          <p className="text-gray-600">
            Record a cough sample for AI-powered analysis
          </p>
        </div>

        {/* Main Card */}
        <Card className="shadow-lg mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5" />
              Record Your Cough
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Recording Timer */}
            {recordingState === "recording" && (
              <div className="text-center">
                <div className="text-5xl font-bold text-red-600 mb-2">
                  {recordingTime}s
                </div>
                <p className="text-sm text-gray-600">
                  Recording in progress... (max {MAX_RECORDING_TIME}s)
                </p>
              </div>
            )}

            {/* Recording Controls */}
            <div className="flex gap-3 justify-center">
              {recordingState === "idle" && (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  <Mic className="w-5 h-5" />
                  Start Recording
                </button>
              )}

              {recordingState === "recording" && (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                >
                  <Square className="w-5 h-5" />
                  Stop Recording
                </button>
              )}

              {(recordingState === "recorded" || recordingState === "uploading") && (
                <>
                  <button
                    onClick={resetRecording}
                    disabled={recordingState === "uploading"}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition disabled:opacity-50"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Reset
                  </button>
                  <button
                    onClick={uploadRecording}
                    disabled={recordingState === "uploading"}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {recordingState === "uploading" ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Analyze
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* ✅ 改進：分段式進度顯示，不誤導使用者 */}
            {recordingState === "uploading" && (
              <div className="space-y-2">
                {uploadProgress < 100 ? (
                  <>
                    <p className="text-sm text-gray-600">Uploading... {uploadProgress}%</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Analyzing...</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full w-full animate-pulse" />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Recording Info */}
            {recordingData && recordingState !== "uploading" && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Duration:</strong> {recordingData.duration}s
                </p>
                <p className="text-sm text-gray-700">
                  <strong>File Size:</strong> {(recordingData.blob.size / 1024).toFixed(1)} KB
                </p>
                <p className="text-sm text-gray-700">
                  <strong>Format:</strong> {recordedMimeTypeRef.current || "default"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Prediction Result */}
        {prediction && (
          <Card className="shadow-lg bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-900">
                <CheckCircle2 className="w-5 h-5" />
                Analysis Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Prediction</p>
                  <p className="text-xl font-bold text-gray-900">
                    {prediction.label}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Confidence</p>
                  <p className="text-xl font-bold text-gray-900">
                    {prediction.confidence}
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-green-200">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Medical Advice:</strong>
                </p>
                <p className="text-sm text-gray-600">
                  {prediction.label === "COVID-19 Positive"
                    ? "This result suggests a possible COVID-19 infection. Please consult a healthcare professional for proper diagnosis and testing."
                    : "This result suggests no COVID-19 infection detected. However, if you have symptoms, please consult a healthcare professional."}
                </p>
              </div>

              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  ⚠️ MEDICAL DISCLAIMER: This tool is for reference only and should not be used as a substitute for professional medical diagnosis. Always consult with a qualified healthcare provider for accurate diagnosis and treatment.
                </AlertDescription>
              </Alert>

              <p className="text-xs text-gray-500 text-center">
                Model Version: {prediction.modelVersion} | {prediction.timestamp}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
