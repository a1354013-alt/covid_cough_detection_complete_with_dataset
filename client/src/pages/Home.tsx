import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, formatPrediction, getAudioFileName } from "@/lib/api";
import type { UIPredictionResult } from "@/lib/api";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mic,
  RotateCcw,
  ServerCrash,
  Square,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type RecordingState = "idle" | "recording" | "recorded";
type SubmitState = "idle" | "uploading" | "analyzing";
type BackendState = "checking" | "ready" | "not_ready" | "unreachable";

interface RecordingData {
  blob: Blob;
  duration: number;
  timestamp: Date;
}

const MAX_RECORDING_TIME = 30;
const MIN_RECORDING_TIME = 2;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_BACKEND_MIME_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
];
const PREFERRED_RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg",
];

export default function Home() {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingData, setRecordingData] = useState<RecordingData | null>(null);
  const [prediction, setPrediction] = useState<UIPredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [backendState, setBackendState] = useState<BackendState>("checking");
  const [backendMessage, setBackendMessage] = useState<string>("Checking backend readiness...");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeRef = useRef(0);
  const recordedMimeTypeRef = useRef<string>("audio/webm");

  useEffect(() => {
    void refreshBackendReadiness();

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const refreshBackendReadiness = async () => {
    setBackendState("checking");
    setBackendMessage("Checking backend readiness...");

    try {
      const readiness = await apiClient.getReadiness();
      if (readiness.status === "ready") {
        setBackendState("ready");
        setBackendMessage("Backend is ready.");
      } else {
        setBackendState("not_ready");
        setBackendMessage(readiness.reason || "Model is not ready.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Backend is unreachable.";
      if (message.toLowerCase().includes("not ready")) {
        setBackendState("not_ready");
      } else {
        setBackendState("unreachable");
      }
      setBackendMessage(message);
    }
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const resetUiState = () => {
    setRecordingState("idle");
    setSubmitState("idle");
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    setRecordingData(null);
    setPrediction(null);
    setError(null);
    setUploadProgress(0);
    audioChunksRef.current = [];
  };

  const startRecording = async () => {
    try {
      setError(null);
      setPrediction(null);
      setRecordingData(null);
      setSubmitState("idle");
      audioChunksRef.current = [];
      setRecordingTime(0);
      recordingTimeRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      });

      const chosenMimeType =
        PREFERRED_RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      recordedMimeTypeRef.current = chosenMimeType;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: chosenMimeType || undefined,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());

        const actualMimeType =
          mediaRecorder.mimeType || recordedMimeTypeRef.current || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        const finalDuration = recordingTimeRef.current;

        if (audioBlob.size > MAX_FILE_SIZE) {
          setError(
            `Recording too large (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`
          );
          setRecordingState("idle");
          return;
        }

        if (finalDuration < MIN_RECORDING_TIME) {
          setError(
            `Recording too short (${finalDuration}s). Minimum is ${MIN_RECORDING_TIME}s.`
          );
          setRecordingState("idle");
          return;
        }

        const supported = SUPPORTED_BACKEND_MIME_PREFIXES.some((prefix) =>
          actualMimeType.startsWith(prefix)
        );
        if (!supported) {
          setError(`Unsupported audio format: ${actualMimeType}. Please try again.`);
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

      timerIntervalRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);

        if (recordingTimeRef.current >= MAX_RECORDING_TIME) {
          mediaRecorder.stop();
          stopTimer();
        }
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start recording");
      setRecordingState("idle");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      stopTimer();
    }
  };

  const uploadRecording = async () => {
    if (!recordingData) return;

    if (backendState !== "ready") {
      setError(`Backend is not ready: ${backendMessage}`);
      return;
    }

    setError(null);
    setSubmitState("uploading");
    setUploadProgress(0);

    try {
      const filename = getAudioFileName(recordingData.blob.type);
      const result = await apiClient.predict(recordingData.blob, filename, (progress) => {
        setUploadProgress(progress);
        if (progress >= 100) {
          setSubmitState((current) => (current === "uploading" ? "analyzing" : current));
        }
      });

      setSubmitState("analyzing");
      setPrediction(formatPrediction(result));
      setSubmitState("idle");
      setUploadProgress(100);
    } catch (err) {
      setSubmitState("idle");
      setUploadProgress(0);
      setError(err instanceof Error ? err.message : "Upload failed");
      if (String(err).includes("503")) {
        setBackendState("not_ready");
      }
    }
  };

  const isRecording = recordingState === "recording";
  const hasRecording = recordingData !== null;
  const isBusy = submitState !== "idle";
  const canAnalyze = hasRecording && backendState === "ready" && !isBusy;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">COVID-19 Cough Detection</h1>
          <p className="text-gray-600">AI-powered detection from cough audio</p>
        </div>

        {(backendState === "not_ready" || backendState === "unreachable" || backendState === "checking") && (
          <Alert className="mb-4 border-amber-200 bg-amber-50">
            <ServerCrash className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-900">
              {backendMessage}
              <button
                className="ml-2 underline"
                type="button"
                onClick={() => {
                  void refreshBackendReadiness();
                }}
              >
                Retry
              </button>
            </AlertDescription>
          </Alert>
        )}

        <Card className="shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
            <CardTitle>Record Your Cough</CardTitle>
          </CardHeader>

          <CardContent className="pt-6">
            {error && (
              <Alert className="mb-6 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              {isRecording && (
                <div className="rounded-lg bg-blue-50 p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600">{recordingTime}s</div>
                  <div className="text-sm text-gray-600">Recording in progress...</div>
                </div>
              )}

              <div className="flex justify-center gap-4">
                {!isRecording && !hasRecording && (
                  <button
                    onClick={startRecording}
                    disabled={isBusy}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    <Mic className="h-5 w-5" />
                    Start Recording
                  </button>
                )}

                {isRecording && (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-white transition hover:bg-red-700"
                  >
                    <Square className="h-5 w-5" />
                    Stop Recording
                  </button>
                )}

                {hasRecording && !isBusy && (
                  <>
                    <button
                      onClick={uploadRecording}
                      disabled={!canAnalyze}
                      className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-white transition hover:bg-green-700 disabled:bg-gray-400"
                    >
                      <Upload className="h-5 w-5" />
                      Analyze
                    </button>

                    <button
                      onClick={resetUiState}
                      className="flex items-center gap-2 rounded-lg bg-gray-600 px-6 py-3 text-white transition hover:bg-gray-700"
                    >
                      <RotateCcw className="h-5 w-5" />
                      Reset
                    </button>
                  </>
                )}

                {isBusy && (
                  <button
                    disabled
                    className="cursor-not-allowed rounded-lg bg-gray-400 px-6 py-3 text-white"
                  >
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {submitState === "uploading" ? "Uploading..." : "Analyzing..."}
                    </span>
                  </button>
                )}
              </div>

              {isBusy && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>
                      {submitState === "uploading"
                        ? "Uploading audio..."
                        : "Upload complete. Running inference..."}
                    </span>
                    <span>{submitState === "uploading" ? `${uploadProgress}%` : "100%"}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-600 transition-all"
                      style={{ width: `${submitState === "uploading" ? uploadProgress : 100}%` }}
                    />
                  </div>
                </div>
              )}

              {hasRecording && recordingData && (
                <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                  <div>Duration: {recordingData.duration}s</div>
                  <div>Size: {(recordingData.blob.size / 1024).toFixed(1)} KB</div>
                  <div>Type: {recordingData.blob.type}</div>
                  <div>Recorded at: {recordingData.timestamp.toLocaleTimeString()}</div>
                </div>
              )}
            </div>

            {prediction && (
              <div className="mt-8 rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Analysis Result</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-gray-600">Prediction</div>
                    <div
                      className={`text-2xl font-bold ${
                        prediction.rawLabel === "positive" ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {prediction.rawLabel === "positive"
                        ? "COVID-19 Positive"
                        : "COVID-19 Negative"}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-600">Confidence</div>
                    <div className="text-xl font-semibold text-gray-900">
                      {prediction.confidenceText}
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          prediction.confidenceValue > 70 ? "bg-red-600" : "bg-green-600"
                        }`}
                        style={{ width: prediction.confidenceText }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 text-xs text-gray-500">
                    Analysis completed at {prediction.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>This tool is for demonstration only and is not for medical diagnosis.</p>
        </div>
      </div>
    </div>
  );
}
