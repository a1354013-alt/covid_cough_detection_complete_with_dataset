import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectAudioFormat,
  estimateAudioDuration,
  getFormatFromFilename,
  validateAudioFile,
} from "./audio-validator.js";

describe("audio-validator", () => {
  describe("detectAudioFormat", () => {
    it("should detect WAV format from RIFF magic bytes", () => {
      // RIFF....WAVE header
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      assert.equal(detectAudioFormat(wavBuffer), "wav");
    });

    it("should detect MP3 format from ID3 tag", () => {
      // ID3v2 header
      const mp3Id3Buffer = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
      assert.equal(detectAudioFormat(mp3Id3Buffer), "mp3");
    });

    it("should detect MP3 format from frame sync", () => {
      // MP3 frame sync (0xFF 0xFB)
      const mp3SyncBuffer = Buffer.from([0xff, 0xfb, 0x00, 0x00]);
      assert.equal(detectAudioFormat(mp3SyncBuffer), "mp3");
    });

    it("should detect OGG format from OggS magic bytes", () => {
      const oggBuffer = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x00]);
      assert.equal(detectAudioFormat(oggBuffer), "ogg");
    });

    it("should detect WebM format from magic bytes", () => {
      const webmBuffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);
      assert.equal(detectAudioFormat(webmBuffer), "webm");
    });

    it("should return null for unknown format", () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      assert.equal(detectAudioFormat(unknownBuffer), null);
    });

    it("should return null for buffer too short", () => {
      const shortBuffer = Buffer.from([0x52, 0x49, 0x46]);
      assert.equal(detectAudioFormat(shortBuffer), null);
    });
  });

  describe("validateAudioFile", () => {
    it("should reject empty file", () => {
      const result = validateAudioFile(Buffer.from([]));
      assert.equal(result.valid, false);
      assert.ok((result.error || "").toLowerCase().includes("empty"));
    });

    it("should reject file exceeding max size", () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      const result = validateAudioFile(largeBuffer, "test.wav", 10 * 1024 * 1024);
      assert.equal(result.valid, false);
      assert.ok((result.error || "").toLowerCase().includes("too large"));
    });

    it("should reject unsupported format", () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);
      const result = validateAudioFile(unknownBuffer);
      assert.equal(result.valid, false);
      assert.ok((result.error || "").includes("Unsupported"));
    });

    it("should accept valid WAV file", () => {
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      const result = validateAudioFile(wavBuffer, "test.wav");
      assert.equal(result.valid, true);
      assert.equal(result.format, "wav");
    });

    it("should reject mismatched extension", () => {
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      const result = validateAudioFile(wavBuffer, "test.mp3");
      assert.equal(result.valid, false);
      assert.ok((result.error || "").includes("does not match"));
    });

    it("should reject invalid extension", () => {
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      const result = validateAudioFile(wavBuffer, "test.xyz");
      assert.equal(result.valid, false);
      assert.ok((result.error || "").includes("Invalid file extension"));
    });
  });

  describe("getFormatFromFilename", () => {
    it("should extract format from filename", () => {
      assert.equal(getFormatFromFilename("test.wav"), "wav");
      assert.equal(getFormatFromFilename("TEST.MP3"), "mp3");
      assert.equal(getFormatFromFilename("audio.ogg"), "ogg");
      assert.equal(getFormatFromFilename("recording.webm"), "webm");
    });

    it("should return null for unsupported extension", () => {
      assert.equal(getFormatFromFilename("test.xyz"), null);
      assert.equal(getFormatFromFilename("test"), null);
    });
  });

  describe("estimateAudioDuration", () => {
    it("should estimate duration for WAV format", () => {
      // 1 second of WAV at 1411 kbps ≈ 176 KB
      const wavBuffer = Buffer.alloc(180 * 1024);
      const duration = estimateAudioDuration(wavBuffer, "wav");
      assert.ok(duration !== null);
      assert.ok(duration >= 0.9);
      assert.ok(duration <= 1.5);
    });

    it("should estimate duration for MP3 format", () => {
      // 1 second of MP3 at 128 kbps ≈ 16 KB
      const mp3Buffer = Buffer.alloc(16 * 1024);
      const duration = estimateAudioDuration(mp3Buffer, "mp3");
      assert.ok(duration !== null);
      assert.ok(duration >= 0.9);
      assert.ok(duration <= 1.5);
    });

    it("should return null for unrealistic duration", () => {
      const tinyBuffer = Buffer.alloc(1);
      assert.equal(estimateAudioDuration(tinyBuffer, "wav"), null);
      
      const hugeBuffer = Buffer.alloc(1000 * 1024 * 1024);
      assert.equal(estimateAudioDuration(hugeBuffer, "wav"), null);
    });
  });
});
