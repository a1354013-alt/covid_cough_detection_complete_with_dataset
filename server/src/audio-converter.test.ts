import { describe, it, expect } from "vitest";
import { isWavFormat, getTargetMimeType, needsConversion, getConversionStatus } from "./audio-converter.js";

describe("audio-converter", () => {
  describe("isWavFormat", () => {
    it("should identify WAV MIME types", () => {
      expect(isWavFormat("audio/wav")).toBe(true);
      expect(isWavFormat("audio/x-wav")).toBe(true);
      expect(isWavFormat("audio/wave")).toBe(true);
      expect(isWavFormat("AUDIO/WAV")).toBe(true);
    });

    it("should reject non-WAV MIME types", () => {
      expect(isWavFormat("audio/mp3")).toBe(false);
      expect(isWavFormat("audio/ogg")).toBe(false);
      expect(isWavFormat("audio/webm")).toBe(false);
      expect(isWavFormat("video/mp4")).toBe(false);
    });
  });

  describe("getTargetMimeType", () => {
    it("should return audio/wav for WAV source", () => {
      expect(getTargetMimeType("audio/wav")).toBe("audio/wav");
      expect(getTargetMimeType("audio/x-wav")).toBe("audio/wav");
    });

    it("should return audio/wav after successful conversion", () => {
      expect(getTargetMimeType("audio/mp3", true)).toBe("audio/wav");
      expect(getTargetMimeType("audio/ogg", true)).toBe("audio/wav");
    });

    it("should return original MIME type if conversion failed", () => {
      expect(getTargetMimeType("audio/mp3", false)).toBe("audio/mp3");
      expect(getTargetMimeType("audio/ogg", false)).toBe("audio/ogg");
    });
  });

  describe("needsConversion", () => {
    it("should return false for WAV format", () => {
      expect(needsConversion("audio/wav")).toBe(false);
      expect(needsConversion("audio/x-wav")).toBe(false);
    });

    it("should return true for non-WAV formats", () => {
      expect(needsConversion("audio/mp3")).toBe(true);
      expect(needsConversion("audio/ogg")).toBe(true);
      expect(needsConversion("audio/webm")).toBe(true);
    });
  });

  describe("getConversionStatus", () => {
    it("should return no-conversion-needed for same MIME types", () => {
      expect(getConversionStatus("audio/wav", "audio/wav")).toBe("no-conversion-needed");
    });

    it("should return conversion status string", () => {
      expect(getConversionStatus("audio/mp3", "audio/wav")).toBe("convert-audio/mp3-to-audio/wav");
      expect(getConversionStatus("audio/ogg", "audio/wav")).toBe("convert-audio/ogg-to-audio/wav");
    });
  });
});
