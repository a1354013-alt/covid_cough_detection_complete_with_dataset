import { describe, expect, it } from "vitest";
import { formatPrediction } from "./api";

describe("formatPrediction", () => {
  it("maps backend payload to stable UI contract", () => {
    const result = formatPrediction({
      label: "positive",
      prob: 0.83,
      model_version: "trained-1.0",
      processing_time_ms: 123.4,
    });

    expect(result.rawLabel).toBe("positive");
    expect(result.confidenceText).toBe("83%");
    expect(result.displayLabel).toBe("Possible Positive Signal");
    expect(result.displayLabel.includes("COVID-19 Positive")).toBe(false);
    expect(result.modelVersion).toBe("trained-1.0");
    expect(result.processingTimeMs).toBe(123.4);
    expect(result.timestamp instanceof Date).toBe(true);
  });

  it("uses signal wording for negative predictions", () => {
    const result = formatPrediction({
      label: "negative",
      prob: 0.12,
      model_version: "trained-1.0",
      processing_time_ms: 98.1,
    });

    expect(result.rawLabel).toBe("negative");
    expect(result.displayLabel).toBe("Possible Negative Signal");
    expect(result.displayLabel.includes("COVID-19 Negative")).toBe(false);
  });
});
