import type { UIPredictionResult } from "@/lib/api";

export type BackendStatus = "checking" | "ready" | "degraded";
export type FlowPhase =
  | "idle"
  | "recording"
  | "recorded"
  | "uploading"
  | "analyzing"
  | "success"
  | "error";

export interface RecordingData {
  blob: Blob;
  duration: number;
  timestamp: Date;
}

export interface HomeFlowState {
  phase: FlowPhase;
  recordingTime: number;
  recordingData: RecordingData | null;
  prediction: UIPredictionResult | null;
  uploadProgress: number;
  error: string | null;
  backend: {
    status: BackendStatus;
    message: string;
  };
}

export interface SignalPresentation {
  title: string;
  toneIconClass: string;
  toneTextClass: string;
  toneBarClass: string;
  toneContainerClass: string;
}

export type HomeFlowAction =
  | { type: "BACKEND_CHECKING"; message: string }
  | { type: "BACKEND_READY"; message: string }
  | { type: "BACKEND_DEGRADED"; message: string }
  | { type: "RESET_FLOW" }
  | { type: "RECORDING_STARTED" }
  | { type: "RECORDING_TICK"; seconds: number }
  | { type: "RECORDING_CAPTURED"; data: RecordingData }
  | { type: "RECORDING_FAILED"; message: string }
  | { type: "UPLOAD_STARTED" }
  | { type: "UPLOAD_PROGRESS"; progress: number }
  | { type: "ANALYZING_STARTED" }
  | { type: "ANALYSIS_SUCCEEDED"; prediction: UIPredictionResult }
  | { type: "ANALYSIS_FAILED"; message: string };

export const INITIAL_BACKEND_MESSAGE = "Checking backend readiness...";

export function createInitialHomeFlowState(): HomeFlowState {
  return {
    phase: "idle",
    recordingTime: 0,
    recordingData: null,
    prediction: null,
    uploadProgress: 0,
    error: null,
    backend: {
      status: "checking",
      message: INITIAL_BACKEND_MESSAGE,
    },
  };
}

function applyBackendState(
  state: HomeFlowState,
  status: BackendStatus,
  message: string
): HomeFlowState {
  return {
    ...state,
    backend: {
      status,
      message,
    },
  };
}

export function homeFlowReducer(state: HomeFlowState, action: HomeFlowAction): HomeFlowState {
  switch (action.type) {
    case "BACKEND_CHECKING":
      return applyBackendState(state, "checking", action.message);
    case "BACKEND_READY":
      return applyBackendState(state, "ready", action.message);
    case "BACKEND_DEGRADED":
      return applyBackendState(state, "degraded", action.message);

    case "RESET_FLOW":
      return {
        ...state,
        phase: "idle",
        recordingTime: 0,
        recordingData: null,
        prediction: null,
        uploadProgress: 0,
        error: null,
      };

    case "RECORDING_STARTED":
      return {
        ...state,
        phase: "recording",
        recordingTime: 0,
        recordingData: null,
        prediction: null,
        uploadProgress: 0,
        error: null,
      };

    case "RECORDING_TICK":
      if (state.phase !== "recording") return state;
      return {
        ...state,
        recordingTime: action.seconds,
      };

    case "RECORDING_CAPTURED":
      return {
        ...state,
        phase: "recorded",
        recordingData: action.data,
        recordingTime: action.data.duration,
        uploadProgress: 0,
        error: null,
      };

    case "RECORDING_FAILED":
      return {
        ...state,
        phase: "error",
        recordingTime: 0,
        recordingData: null,
        prediction: null,
        uploadProgress: 0,
        error: action.message,
      };

    case "UPLOAD_STARTED":
      return {
        ...state,
        phase: "uploading",
        uploadProgress: 0,
        prediction: null,
        error: null,
      };

    case "UPLOAD_PROGRESS":
      if (state.phase !== "uploading") return state;
      return {
        ...state,
        uploadProgress: Math.max(0, Math.min(100, action.progress)),
      };

    case "ANALYZING_STARTED":
      return {
        ...state,
        phase: "analyzing",
        uploadProgress: 100,
      };

    case "ANALYSIS_SUCCEEDED":
      return {
        ...state,
        phase: "success",
        prediction: action.prediction,
        uploadProgress: 100,
        error: null,
      };

    case "ANALYSIS_FAILED":
      return {
        ...state,
        phase: "error",
        uploadProgress: 0,
        prediction: null,
        error: action.message,
      };

    default:
      return state;
  }
}

export function isBusy(phase: FlowPhase): boolean {
  return phase === "uploading" || phase === "analyzing";
}

export function canAnalyze(state: HomeFlowState): boolean {
  return Boolean(
    state.recordingData &&
      state.backend.status === "ready" &&
      !isBusy(state.phase)
  );
}

export function getSignalPresentation(prediction: UIPredictionResult): SignalPresentation {
  const isPositive = prediction.rawLabel === "positive";

  return {
    title: prediction.displayLabel,
    toneIconClass: isPositive ? "text-red-600" : "text-green-600",
    toneTextClass: isPositive ? "text-red-700" : "text-green-700",
    toneBarClass: isPositive ? "bg-red-600" : "bg-green-600",
    toneContainerClass: isPositive
      ? "border-red-200 bg-gradient-to-r from-red-50 to-rose-50"
      : "border-green-200 bg-gradient-to-r from-green-50 to-emerald-50",
  };
}
