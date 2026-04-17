import { describe, expect, it } from "vitest";
import {
  canAnalyze,
  createInitialHomeFlowState,
  getSignalPresentation,
  homeFlowReducer,
  isBusy,
} from "./home-state";

function makeRecordingBlob(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
}

describe("home-flow reducer", () => {
  it("disables analyze when backend is not ready", () => {
    const initial = createInitialHomeFlowState();
    const withRecording = homeFlowReducer(initial, {
      type: "RECORDING_CAPTURED",
      data: {
        blob: makeRecordingBlob(),
        duration: 3,
        timestamp: new Date("2026-04-09T00:00:00.000Z"),
      },
    });
    const notReady = homeFlowReducer(withRecording, {
      type: "BACKEND_DEGRADED",
      message: "Model warming up",
    });

    expect(canAnalyze(notReady)).toBe(false);
  });

  it("supports uploading to analyzing to success transition", () => {
    const initial = createInitialHomeFlowState();
    const ready = homeFlowReducer(initial, { type: "BACKEND_READY", message: "Backend is ready" });
    const recorded = homeFlowReducer(ready, {
      type: "RECORDING_CAPTURED",
      data: {
        blob: makeRecordingBlob(),
        duration: 4,
        timestamp: new Date("2026-04-09T00:00:00.000Z"),
      },
    });

    const uploading = homeFlowReducer(recorded, { type: "UPLOAD_STARTED" });
    expect(uploading.phase).toBe("uploading");
    expect(isBusy(uploading.phase)).toBe(true);

    const analyzing = homeFlowReducer(
      homeFlowReducer(uploading, { type: "UPLOAD_PROGRESS", progress: 100 }),
      { type: "ANALYZING_STARTED" }
    );
    expect(analyzing.phase).toBe("analyzing");

    const success = homeFlowReducer(analyzing, {
      type: "ANALYSIS_SUCCEEDED",
      prediction: {
        rawLabel: "negative",
        confidenceValue: 93,
        displayLabel: "Possible Negative Signal",
        confidenceText: "93%",
        modelVersion: "trained-1.0",
        timestamp: new Date("2026-04-09T00:00:01.000Z"),
        processingTimeMs: 123,
      },
    });

    expect(success.phase).toBe("success");
    expect(success.uploadProgress).toBe(100);
    expect(success.error).toBeNull();
    expect(success.prediction?.confidenceText).toBe("93%");
  });

  it("allows reset and retry after error", () => {
    const initial = createInitialHomeFlowState();
    const withError = homeFlowReducer(initial, {
      type: "ANALYSIS_FAILED",
      message: "Model service not ready",
    });
    expect(withError.phase).toBe("error");

    const reset = homeFlowReducer(withError, { type: "RESET_FLOW" });
    expect(reset.phase).toBe("idle");
    expect(reset.error).toBeNull();
    expect(reset.recordingData).toBeNull();
    expect(reset.uploadProgress).toBe(0);

    const retry = homeFlowReducer(reset, { type: "RECORDING_STARTED" });
    expect(retry.phase).toBe("recording");
    expect(retry.error).toBeNull();
  });

  it("maps positive and negative results to stable semantic colors", () => {
    const positive = getSignalPresentation({
      rawLabel: "positive",
      confidenceValue: 81,
      displayLabel: "Possible Positive Signal",
      confidenceText: "81%",
      modelVersion: "trained-1.0",
      timestamp: new Date("2026-04-09T00:00:00.000Z"),
      processingTimeMs: 100,
    });
    const negative = getSignalPresentation({
      rawLabel: "negative",
      confidenceValue: 64,
      displayLabel: "Possible Negative Signal",
      confidenceText: "64%",
      modelVersion: "trained-1.0",
      timestamp: new Date("2026-04-09T00:00:01.000Z"),
      processingTimeMs: 120,
    });

    expect(positive.title).toMatch(/Possible Positive Signal/);
    expect(positive.toneTextClass).toMatch(/text-red/);
    expect(positive.toneBarClass).toMatch(/bg-red/);
    expect(negative.title).toMatch(/Possible Negative Signal/);
    expect(negative.toneTextClass).toMatch(/text-green/);
    expect(negative.toneBarClass).toMatch(/bg-green/);
  });
});
