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
    assert.equal(result.displayLabel, "Possible Positive Signal");
    assert.ok(!result.displayLabel.includes("COVID-19 Positive"));
    assert.equal(result.modelVersion, "trained-1.0");
    assert.equal(result.processingTimeMs, 123.4);
    assert.ok(result.timestamp instanceof Date);
  });

  it("uses signal wording for negative predictions", () => {
    const result = formatPrediction({
      label: "negative",
      prob: 0.12,
      model_version: "trained-1.0",
      processing_time_ms: 98.1,
    });

    assert.equal(result.rawLabel, "negative");
    assert.equal(result.displayLabel, "Possible Negative Signal");
    assert.ok(!result.displayLabel.includes("COVID-19 Negative"));
  });
});
