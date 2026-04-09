import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPrediction } from "./api";

describe("formatPrediction", () => {
  it("maps backend payload to stable UI contract", () => {
    const result = formatPrediction({
      label: "positive",
      prob: 0.83,
      model_version: "trained-1.0",
      processing_time_ms: 123.4,
    });

    assert.equal(result.rawLabel, "positive");
    assert.equal(result.confidenceText, "83%");
    assert.equal(result.modelVersion, "trained-1.0");
    assert.equal(result.processingTimeMs, 123.4);
    assert.ok(result.timestamp instanceof Date);
  });
});
