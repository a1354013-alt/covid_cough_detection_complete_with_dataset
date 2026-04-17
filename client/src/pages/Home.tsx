import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  APP_NAME,
  APP_SUBTITLE,
  AUDIO_CONFIG,
  PREFERRED_RECORDER_MIME_TYPES,
  SUPPORTED_BACKEND_MIME_PREFIXES,
} from "@/const";
import { ApiRequestError, apiClient, formatPrediction, getAudioFileName } from "@/lib/api";
import {
  canAnalyze,
  createInitialHomeFlowState,
  getSignalPresentation,
  homeFlowReducer,
  isBusy,
  type RecordingData,
} from "@/pages/home-state";
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
import type { ChangeEvent } from "react";
import { useEffect, useReducer, useRef } from "react";

export default function Home() {
  const [state, dispatch] = useReducer(homeFlowReducer, undefined, createInitialHomeFlowState);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeRef = useRef(0);
  const recordedMimeTypeRef = useRef<string>("audio/webm");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const clearRecordingBuffers = () => {
    recordingTimeRef.current = 0;
    audioChunksRef.current = [];
  };

  const captureAudioBlob = (audioBlob: Blob, durationSeconds: number, timestamp = new Date()) => {
    if (audioBlob.size > AUDIO_CONFIG.maxFileSizeBytes) {
      clearRecordingBuffers();
      dispatch({
        type: "RECORDING_FAILED",
        message: `Audio too large (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`,
      });
      return;
    }

    if (durationSeconds > 0 && durationSeconds < AUDIO_CONFIG.minRecordingTimeSeconds) {
      clearRecordingBuffers();
      dispatch({
        type: "RECORDING_FAILED",
        message: `Audio too short (${durationSeconds}s). Minimum is ${AUDIO_CONFIG.minRecordingTimeSeconds}s.`,
      });
      return;
    }

    const supported = SUPPORTED_BACKEND_MIME_PREFIXES.some((prefix) =>
      audioBlob.type.startsWith(prefix)
    );
    if (!supported) {
      clearRecordingBuffers();
      dispatch({
        type: "RECORDING_FAILED",
        message: `Unsupported audio type: ${audioBlob.type || "unknown"}. Supported formats: WAV, MP3, OGG, WebM.`,
      });
      return;
    }

    const recordingData: RecordingData = {
      blob: audioBlob,
      duration: durationSeconds,
      timestamp,
    };

    dispatch({ type: "RECORDING_CAPTURED", data: recordingData });
  };

  const getAudioDurationSeconds = async (file: File): Promise<number> => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const duration = await new Promise<number>((resolve, reject) => {
        audio.preload = "metadata";
        audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
        audio.onerror = () => reject(new Error("Failed to read audio metadata"));
        audio.src = url;
      });
      URL.revokeObjectURL(url);
      return Math.max(0, Math.round(duration));
    } catch {
      return 0;
    }
  };

  useEffect(() => {
    void refreshBackendReadiness();

    return () => {
      stopTimer();
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const refreshBackendReadiness = async () => {
    dispatch({ type: "BACKEND_CHECKING", message: "Checking backend readiness..." });

    try {
      const readiness = await apiClient.getReadiness();
      if (readiness.status === "ready") {
        const model = readiness.python_backend.model_version;
        const device = readiness.python_backend.device;
        const suffix = model ? ` (model: ${model}${device ? `, device: ${device}` : ""})` : "";
        dispatch({ type: "BACKEND_READY", message: `Backend is ready.${suffix}` });
      } else {
        const model = readiness.python_backend.model_version;
        const device = readiness.python_backend.device;
        const suffix = model ? ` (model: ${model}${device ? `, device: ${device}` : ""})` : "";
        dispatch({
          type: "BACKEND_DEGRADED",
          message: `${readiness.python_backend.error || "Backend is degraded."}${suffix}`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Backend connection failed.";
      dispatch({ type: "BACKEND_DEGRADED", message });
    }
  };

  const resetUiState = () => {
    stopTimer();
    clearRecordingBuffers();
    dispatch({ type: "RESET_FLOW" });
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        dispatch({
          type: "RECORDING_FAILED",
          message:
            "Microphone recording is not supported in this browser. Please upload an audio file instead.",
        });
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        dispatch({
          type: "RECORDING_FAILED",
          message: "MediaRecorder is not available in this browser. Please upload an audio file instead.",
        });
        return;
      }

      stopTimer();
      clearRecordingBuffers();
      dispatch({ type: "RECORDING_STARTED" });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channels,
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

      mediaRecorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        stopTimer();
        clearRecordingBuffers();
        dispatch({ type: "RECORDING_FAILED", message: "Recording failed. Please try again." });
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        stopTimer();

        const actualMimeType = mediaRecorder.mimeType || recordedMimeTypeRef.current || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        const finalDuration = recordingTimeRef.current;
        captureAudioBlob(audioBlob, finalDuration, new Date());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

      timerIntervalRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        dispatch({ type: "RECORDING_TICK", seconds: recordingTimeRef.current });

        if (recordingTimeRef.current >= AUDIO_CONFIG.maxRecordingTimeSeconds) {
          mediaRecorder.stop();
        }
      }, 1000);
    } catch (err) {
      stopTimer();
      clearRecordingBuffers();

      const errorName = err instanceof Error ? err.name : "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        dispatch({
          type: "RECORDING_FAILED",
          message: "Microphone permission was denied. You can upload an audio file instead.",
        });
        return;
      }

      if (errorName === "NotFoundError") {
        dispatch({
          type: "RECORDING_FAILED",
          message: "No microphone device was found. You can upload an audio file instead.",
        });
        return;
      }

      dispatch({
        type: "RECORDING_FAILED",
        message: err instanceof Error ? err.message : "Failed to start recording",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    stopTimer();
    clearRecordingBuffers();

    const durationSeconds = await getAudioDurationSeconds(file);
    captureAudioBlob(file, durationSeconds, new Date());
  };

  const uploadRecording = async () => {
    if (!state.recordingData) {
      return;
    }

    if (state.backend.status !== "ready") {
      dispatch({
        type: "ANALYSIS_FAILED",
        message: `Backend is not ready: ${state.backend.message}`,
      });
      return;
    }

    dispatch({ type: "UPLOAD_STARTED" });

    try {
      const filename = getAudioFileName(state.recordingData.blob.type);
      const result = await apiClient.predict(state.recordingData.blob, filename, (progress) => {
        dispatch({ type: "UPLOAD_PROGRESS", progress });
        if (progress >= 100) {
          dispatch({ type: "ANALYZING_STARTED" });
        }
      });

      dispatch({ type: "ANALYSIS_SUCCEEDED", prediction: formatPrediction(result) });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 503) {
        dispatch({ type: "BACKEND_DEGRADED", message: err.message });
      }

      dispatch({
        type: "ANALYSIS_FAILED",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  };

  const busy = isBusy(state.phase);
  const recording = state.phase === "recording";
  const hasRecording = state.recordingData !== null;
  const signalPresentation = state.prediction ? getSignalPresentation(state.prediction) : null;
  const confidenceOpacity = state.prediction
    ? Math.max(0.35, Math.min(1, state.prediction.confidenceValue / 100))
    : 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">{APP_NAME}</h1>
          <p className="text-gray-600">{APP_SUBTITLE}</p>
        </div>

        {(state.backend.status === "degraded" || state.backend.status === "checking") && (
          <Alert className="mb-4 border-amber-200 bg-amber-50">
            <ServerCrash className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-900">
              {state.backend.message}
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

        {state.backend.status === "ready" && (
          <Alert className="mb-4 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            <AlertDescription className="text-emerald-900">
              {state.backend.message}
              <button
                className="ml-2 underline"
                type="button"
                onClick={() => {
                  void refreshBackendReadiness();
                }}
              >
                Refresh
              </button>
            </AlertDescription>
          </Alert>
        )}

        <Card className="shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
            <CardTitle>Record Your Cough</CardTitle>
          </CardHeader>

          <CardContent className="pt-6">
            {state.error && (
              <Alert className="mb-6 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">{state.error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              {recording && (
                <div className="rounded-lg bg-blue-50 p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600">{state.recordingTime}s</div>
                  <div className="text-sm text-gray-600">Recording in progress...</div>
                </div>
              )}

              <div className="flex justify-center gap-4">
                {!recording && !hasRecording && (
                  <>
                    <button
                      onClick={startRecording}
                      disabled={busy}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      <Mic className="h-5 w-5" />
                      Start Recording
                    </button>

                    <button
                      onClick={openFilePicker}
                      disabled={busy}
                      className="flex items-center gap-2 rounded-lg bg-slate-700 px-6 py-3 text-white transition hover:bg-slate-800 disabled:bg-gray-400"
                    >
                      <Upload className="h-5 w-5" />
                      Upload File
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleFileSelected}
                    />
                  </>
                )}

                {recording && (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-white transition hover:bg-red-700"
                  >
                    <Square className="h-5 w-5" />
                    Stop Recording
                  </button>
                )}

                {hasRecording && !busy && (
                  <>
                    <button
                      onClick={uploadRecording}
                      disabled={!canAnalyze(state)}
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

                {busy && (
                  <button
                    disabled
                    className="cursor-not-allowed rounded-lg bg-gray-400 px-6 py-3 text-white"
                  >
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {state.phase === "uploading" ? "Uploading..." : "Analyzing..."}
                    </span>
                  </button>
                )}
              </div>

              {busy && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>
                      {state.phase === "uploading"
                        ? "Uploading audio..."
                        : "Upload complete. Running inference..."}
                    </span>
                    <span>{state.phase === "uploading" ? `${state.uploadProgress}%` : "100%"}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-600 transition-all"
                      style={{ width: `${state.phase === "uploading" ? state.uploadProgress : 100}%` }}
                    />
                  </div>
                </div>
              )}

              {hasRecording && state.recordingData && (
                <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                  <div>Duration: {state.recordingData.duration}s</div>
                  <div>Size: {(state.recordingData.blob.size / 1024).toFixed(1)} KB</div>
                  <div>Type: {state.recordingData.blob.type}</div>
                  <div>Recorded at: {state.recordingData.timestamp.toLocaleTimeString()}</div>
                </div>
              )}
            </div>

            {state.prediction && signalPresentation && (
              <div className={`mt-8 rounded-lg border p-6 ${signalPresentation.toneContainerClass}`}>
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2 className={`h-6 w-6 ${signalPresentation.toneIconClass}`} />
                  <h3 className="text-lg font-semibold text-gray-900">Analysis Result</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-gray-600">Risk Signal</div>
                    <div className={`text-2xl font-bold ${signalPresentation.toneTextClass}`}>
                      {signalPresentation.title}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-600">Confidence</div>
                    <div className="text-xl font-semibold text-gray-900">
                      {state.prediction.confidenceText}
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                      <div
                        className={`h-2 rounded-full transition-all ${signalPresentation.toneBarClass}`}
                        style={{
                          width: `${state.prediction.confidenceValue}%`,
                          opacity: confidenceOpacity,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1 border-t border-gray-200 pt-3">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Model Version:</span>
                      <span className="font-mono">{state.prediction.modelVersion}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Processing Time:</span>
                      <span className="font-mono">{state.prediction.processingTimeMs.toFixed(1)}ms</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Completed:</span>
                      <span>{state.prediction.timestamp.toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            This research demo provides cough risk signal estimates only and is not a medical
            diagnosis tool.
          </p>
        </div>
      </div>
    </div>
  );
}
