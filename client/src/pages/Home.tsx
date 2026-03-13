import { Button } from "@/components/ui/button";
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
import type { PredictionResponse } from "@/lib/api";

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
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

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

      // Request microphone access with specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      });

      // Create MediaRecorder with appropriate MIME type
      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Fallback to other types if webm not supported
        mimeType = "audio/mp4";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/wav";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ""; // Use default
          }
        }
      }

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
          type: mimeType || "audio/webm",
        });

        // Validate file size
        if (audioBlob.size > MAX_FILE_SIZE) {
          setError(`Recording too large (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
          setRecordingState("idle");
          return;
        }

        setRecordingData({
          blob: audioBlob,
          duration: recordingTime,
          timestamp: new Date(),
        });

        setRecordingState("recorded");
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecordingState("recording");

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          if (newTime >= MAX_RECORDING_TIME) {
            mediaRecorder.stop();
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
            }
            return newTime;
          }
          return newTime;
        });
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
    setRecordingState("idle");
    setRecordingTime(0);
    setRecordingData(null);
    setPrediction(null);
    setError(null);
    setUploadProgress(0);
  };

  // ========================================================================
  // Upload & Prediction
  // ========================================================================

  const uploadAndPredict = async () => {
    if (!recordingData) {
      setError("No recording data available");
      return;
    }

    if (recordingData.duration < MIN_RECORDING_TIME) {
      setError(
        `Recording too short. Minimum ${MIN_RECORDING_TIME} seconds required.`
      );
      return;
    }

    if (recordingData.blob.size > MAX_FILE_SIZE) {
      setError(`Recording too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB allowed.`);
      return;
    }

    try {
      setError(null);
      setRecordingState("uploading");
      setUploadProgress(0);

      // Upload and get prediction with progress tracking
      const filename = getAudioFileName(recordingData.blob.type);
      const result = await apiClient.predict(
        recordingData.blob,
        filename,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      setUploadProgress(100);
      setPrediction(result);
      setRecordingState("recorded");

      // Reset progress after a moment
      setTimeout(() => setUploadProgress(0), 1000);
    } catch (err) {
      let message = "Failed to get prediction";
      
      if (err instanceof Error) {
        message = err.message;
      }

      // Provide helpful error messages based on error type
      if (message.includes("timeout")) {
        message = "Request timed out (120s). The server took too long to respond. Please try again.";
      } else if (message.includes("Network")) {
        message = "Network error. Please check your connection and try again.";
      } else if (message.includes("aborted")) {
        message = "Request was cancelled. Please try again.";
      }

      setError(message);
      setRecordingState("recorded");
      setUploadProgress(0);
    }
  };

  // ========================================================================
  // Playback
  // ========================================================================

  const playRecording = () => {
    if (!recordingData || !audioElementRef.current) return;

    // Revoke old URL if it exists
    if (audioElementRef.current.src && audioElementRef.current.src.startsWith("blob:")) {
      URL.revokeObjectURL(audioElementRef.current.src);
    }

    const url = URL.createObjectURL(recordingData.blob);
    audioElementRef.current.src = url;
    audioElementRef.current.play().catch((err) => {
      setError(`Failed to play recording: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  // ========================================================================
  // Render
  // ========================================================================

  const formattedPrediction = prediction ? formatPrediction(prediction) : null;
  const isRecording = recordingState === "recording";
  const isUploading = recordingState === "uploading";
  const hasRecording = recordingData !== null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-2">
            COVID-19 Cough Detection
          </h1>
          <p className="text-lg text-gray-600">
            Record your cough and get an instant analysis
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Main Recording Card */}
        <Card className="mb-6 shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5" />
              Record Your Cough
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8">
            {/* Recording Timer */}
            {isRecording && (
              <div className="text-center mb-6">
                <div className="text-5xl font-bold text-blue-600 font-mono mb-2">
                  {String(Math.floor(recordingTime / 60)).padStart(2, "0")}:
                  {String(recordingTime % 60).padStart(2, "0")}
                </div>
                <p className="text-gray-600">
                  Recording... (max {MAX_RECORDING_TIME}s)
                </p>
              </div>
            )}

            {/* Recording Status */}
            {!isRecording && hasRecording && (
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <span className="text-lg font-semibold text-green-600">
                    Recording Complete
                  </span>
                </div>
                <p className="text-gray-600">
                  Duration: {recordingData?.duration || 0}s | Size: {(recordingData?.blob.size || 0) / 1024 < 1024 ? `${((recordingData?.blob.size || 0) / 1024).toFixed(1)}KB` : `${((recordingData?.blob.size || 0) / 1024 / 1024).toFixed(1)}MB`}
                </p>
              </div>
            )}

            {/* Idle State */}
            {!isRecording && !hasRecording && (
              <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                    <Mic className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
                <p className="text-gray-600">
                  Click the button below to start recording
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {!isRecording && !hasRecording && (
                <Button
                  onClick={startRecording}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Mic className="w-5 h-5 mr-2" />
                  Start Recording
                </Button>
              )}

              {isRecording && (
                <Button
                  onClick={stopRecording}
                  size="lg"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Square className="w-5 h-5 mr-2" />
                  Stop Recording
                </Button>
              )}

              {hasRecording && (
                <>
                  <Button
                    onClick={playRecording}
                    variant="outline"
                    size="lg"
                    className="border-blue-600 text-blue-600 hover:bg-blue-50"
                  >
                    <Volume2 className="w-5 h-5 mr-2" />
                    Play
                  </Button>
                  <Button
                    onClick={uploadAndPredict}
                    size="lg"
                    disabled={isUploading}
                    className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Analyzing... {uploadProgress}%
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        Analyze
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={resetRecording}
                    variant="outline"
                    size="lg"
                    disabled={isUploading}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-5 h-5 mr-2" />
                    Reset
                  </Button>
                </>
              )}
            </div>

            {/* Upload Progress Bar */}
            {isUploading && uploadProgress > 0 && (
              <div className="mt-6">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 text-center mt-2">
                  Uploading and analyzing... {uploadProgress}%
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Prediction Result Card */}
        {prediction && formattedPrediction && (
          <Card className="shadow-lg border-0 mb-6">
            <CardHeader
              className={`text-white rounded-t-lg ${
                prediction.label === "positive"
                  ? "bg-gradient-to-r from-red-600 to-orange-600"
                  : "bg-gradient-to-r from-green-600 to-emerald-600"
              }`}
            >
              <CardTitle className="flex items-center gap-2">
                {prediction.label === "positive" ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                Analysis Result
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Result</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formattedPrediction.label}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Probability</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formattedPrediction.probability}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Confidence</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formattedPrediction.confidence}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Model</p>
                  <p className="text-lg font-mono text-gray-900">
                    {prediction.model_version}
                  </p>
                </div>
              </div>

              {/* Recommendation */}
              <Alert className="mb-6 border-blue-200 bg-blue-50">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  {prediction.label === "positive"
                    ? "This result suggests a possible COVID-19 infection. Please consult a healthcare professional for proper diagnosis and testing."
                    : "This result suggests no COVID-19 infection detected. However, if you have symptoms, please consult a healthcare professional."}
                </AlertDescription>
              </Alert>

              {/* Disclaimer */}
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 text-sm">
                  <strong>Disclaimer:</strong> This result is for informational
                  purposes only and should not be used as a substitute for
                  professional medical diagnosis. Please consult a healthcare
                  professional for accurate diagnosis and treatment.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Hidden Audio Element */}
        <audio ref={audioElementRef} className="hidden" />

        {/* Info Card */}
        <Card className="shadow-lg border-0 bg-white/50 backdrop-blur">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-gray-900 mb-3">How to Use</h3>
            <ol className="space-y-2 text-sm text-gray-700">
              <li>
                <strong>1. Record:</strong> Click "Start Recording" and cough
                naturally into your microphone
              </li>
              <li>
                <strong>2. Duration:</strong> Record for at least{" "}
                {MIN_RECORDING_TIME} seconds
              </li>
              <li>
                <strong>3. Analyze:</strong> Click "Analyze" to send your
                recording to our AI model
              </li>
              <li>
                <strong>4. Results:</strong> Get instant analysis results with
                confidence scores
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
