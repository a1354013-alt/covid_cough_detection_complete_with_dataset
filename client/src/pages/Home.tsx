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
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { apiClient, formatPrediction, getAudioFileName } from "@/lib/api";
import type { UIPredictionResult } from "@/lib/api";

export default function Home() {
  // ========================================================================
  // State
  // ========================================================================

  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "recorded" | "uploading" | "analyzing">("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingData, setRecordingData] = useState<{
    blob: Blob;
    duration: number;
    timestamp: Date;
  } | null>(null);
  const [prediction, setPrediction] = useState<UIPredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

        // ✅ 使用實際的 mediaRecorder.mimeType，而不是預設值
        // mediaRecorder.mimeType 是 MediaRecorder 實際使用的格式
        const actualMimeType = mediaRecorder.mimeType || recordedMimeTypeRef.current || "audio/webm";

        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, {
          type: actualMimeType,
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
      const message = err instanceof Error ? err.message : "Failed to start recording";
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
    // ✅ 清空錄音數據
    audioChunksRef.current = [];

    // ✅ 重置狀態
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
      const filename = getAudioFileName(recordingData.blob.type);

      // ✅ 分段式進度顯示
      // 先顯示上傳進度
      setUploadProgress(0);
      const result = await apiClient.predict(recordingData.blob, filename, (progress) => {
        // 上傳進度：0-50%
        setUploadProgress(Math.round(progress * 50));
      });

      // 上傳完成，開始分析
      setUploadProgress(50);

      // 格式化結果
      const formattedResult = formatPrediction(result);
      setPrediction(formattedResult);

      // 分析完成
      setUploadProgress(100);
      setRecordingState("recorded");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setRecordingState("recorded");
    }
  };

  // ========================================================================
  // UI Rendering
  // ========================================================================

  const isRecording = recordingState === "recording";
  const isUploading = recordingState === "uploading" || recordingState === "analyzing";
  const hasRecording = recordingData !== null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">COVID-19 Cough Detection</h1>
          <p className="text-gray-600">AI-powered detection from cough audio</p>
        </div>

        {/* Main Card */}
        <Card className="shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
            <CardTitle>Record Your Cough</CardTitle>
          </CardHeader>

          <CardContent className="pt-6">
            {/* Error Alert */}
            {error && (
              <Alert className="mb-6 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">{error}</AlertDescription>
              </Alert>
            )}

            {/* Recording Controls */}
            <div className="space-y-6">
              {/* Recording Timer */}
              {isRecording && (
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{recordingTime}s</div>
                  <div className="text-sm text-gray-600">Recording in progress...</div>
                </div>
              )}

              {/* Recording Buttons */}
              <div className="flex gap-4 justify-center">
                {!isRecording && !hasRecording && (
                  <button
                    onClick={startRecording}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
                  >
                    <Mic className="w-5 h-5" />
                    Start Recording
                  </button>
                )}

                {isRecording && (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                  >
                    <Square className="w-5 h-5" />
                    Stop Recording
                  </button>
                )}

                {hasRecording && !isUploading && (
                  <>
                    <button
                      onClick={uploadRecording}
                      className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      <Upload className="w-5 h-5" />
                      Analyze
                    </button>

                    <button
                      onClick={resetRecording}
                      className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                    >
                      <RotateCcw className="w-5 h-5" />
                      Reset
                    </button>
                  </>
                )}

                {isUploading && (
                  <button disabled className="flex items-center gap-2 px-6 py-3 bg-gray-400 text-white rounded-lg cursor-not-allowed">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{uploadProgress < 50 ? "Uploading..." : "Analyzing..."}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Recording Info */}
              {hasRecording && recordingData && (
                <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
                  <div>Duration: {recordingData.duration}s</div>
                  <div>Size: {(recordingData.blob.size / 1024).toFixed(1)} KB</div>
                  <div>Type: {recordingData.blob.type}</div>
                </div>
              )}
            </div>

            {/* Prediction Result */}
            {prediction && (
              <div className="mt-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Analysis Result</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-gray-600">Prediction</div>
                    <div className={`text-2xl font-bold ${prediction.rawLabel === "positive" ? "text-red-600" : "text-green-600"}`}>
                      {prediction.rawLabel === "positive" ? "COVID-19 Positive" : "COVID-19 Negative"}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-600">Confidence</div>
                    <div className="text-xl font-semibold text-gray-900">{prediction.confidenceText}</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className={`h-2 rounded-full transition-all ${prediction.confidenceValue > 70 ? "bg-red-600" : "bg-green-600"}`}
                        style={{ width: `${prediction.confidenceText}` }}
                      />
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 pt-2">
                    Analysis completed at {prediction.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>⚠️ This tool is for demonstration purposes only and should not be used for medical diagnosis.</p>
        </div>
      </div>
    </div>
  );
}
