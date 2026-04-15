import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

    assert.equal(canAnalyze(notReady), false);
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
    assert.equal(uploading.phase, "uploading");
    assert.equal(isBusy(uploading.phase), true);

    const analyzing = homeFlowReducer(
      homeFlowReducer(uploading, { type: "UPLOAD_PROGRESS", progress: 100 }),
      { type: "ANALYZING_STARTED" }
    );
    assert.equal(analyzing.phase, "analyzing");

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

    assert.equal(success.phase, "success");
    assert.equal(success.uploadProgress, 100);
    assert.equal(success.error, null);
    assert.equal(success.prediction?.confidenceText, "93%");
  });

  it("allows reset and retry after error", () => {
    const initial = createInitialHomeFlowState();
    const withError = homeFlowReducer(initial, {
      type: "ANALYSIS_FAILED",
      message: "Model service not ready",
    });
    assert.equal(withError.phase, "error");

    const reset = homeFlowReducer(withError, { type: "RESET_FLOW" });
    assert.equal(reset.phase, "idle");
    assert.equal(reset.error, null);
    assert.equal(reset.recordingData, null);
    assert.equal(reset.uploadProgress, 0);

    const retry = homeFlowReducer(reset, { type: "RECORDING_STARTED" });
    assert.equal(retry.phase, "recording");
    assert.equal(retry.error, null);
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

    assert.match(positive.title, /Possible Positive Signal/);
    assert.match(positive.toneTextClass, /text-red/);
    assert.match(positive.toneBarClass, /bg-red/);
    assert.match(negative.title, /Possible Negative Signal/);
    assert.match(negative.toneTextClass, /text-green/);
    assert.match(negative.toneBarClass, /bg-green/);
  });
});
