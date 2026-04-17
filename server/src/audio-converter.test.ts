import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWavFormat, getTargetMimeType, needsConversion, getConversionStatus } from "./audio-converter.js";

describe("audio-converter", () => {
  describe("isWavFormat", () => {
    it("should identify WAV MIME types", () => {
      assert.equal(isWavFormat("audio/wav"), true);
      assert.equal(isWavFormat("audio/x-wav"), true);
      assert.equal(isWavFormat("audio/wave"), true);
      assert.equal(isWavFormat("AUDIO/WAV"), true);
    });

    it("should reject non-WAV MIME types", () => {
      assert.equal(isWavFormat("audio/mp3"), false);
      assert.equal(isWavFormat("audio/ogg"), false);
      assert.equal(isWavFormat("audio/webm"), false);
      assert.equal(isWavFormat("video/mp4"), false);
    });
  });

  describe("getTargetMimeType", () => {
    it("should return audio/wav for WAV source", () => {
      assert.equal(getTargetMimeType("audio/wav"), "audio/wav");
      assert.equal(getTargetMimeType("audio/x-wav"), "audio/wav");
    });

    it("should return audio/wav after successful conversion", () => {
      assert.equal(getTargetMimeType("audio/mp3", true), "audio/wav");
      assert.equal(getTargetMimeType("audio/ogg", true), "audio/wav");
    });

    it("should return original MIME type if conversion failed", () => {
      assert.equal(getTargetMimeType("audio/mp3", false), "audio/mp3");
      assert.equal(getTargetMimeType("audio/ogg", false), "audio/ogg");
    });
  });

  describe("needsConversion", () => {
    it("should return false for WAV format", () => {
      assert.equal(needsConversion("audio/wav"), false);
      assert.equal(needsConversion("audio/x-wav"), false);
    });

    it("should return true for non-WAV formats", () => {
      assert.equal(needsConversion("audio/mp3"), true);
      assert.equal(needsConversion("audio/ogg"), true);
      assert.equal(needsConversion("audio/webm"), true);
    });
  });

  describe("getConversionStatus", () => {
    it("should return no-conversion-needed for same MIME types", () => {
      assert.equal(getConversionStatus("audio/wav", "audio/wav"), "no-conversion-needed");
    });

    it("should return conversion status string", () => {
      assert.equal(
        getConversionStatus("audio/mp3", "audio/wav"),
        "convert-audio/mp3-to-audio/wav"
      );
      assert.equal(
        getConversionStatus("audio/ogg", "audio/wav"),
        "convert-audio/ogg-to-audio/wav"
      );
    });
  });
});
