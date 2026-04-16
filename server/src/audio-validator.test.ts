import { describe, it, expect } from "vitest";
import { detectAudioFormat, validateAudioFile, getFormatFromFilename, estimateAudioDuration } from "./audio-validator.js";

describe("audio-validator", () => {
  describe("detectAudioFormat", () => {
    it("should detect WAV format from RIFF magic bytes", () => {
      // RIFF....WAVE header
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      expect(detectAudioFormat(wavBuffer)).toBe("wav");
    });

    it("should detect MP3 format from ID3 tag", () => {
      // ID3v2 header
      const mp3Id3Buffer = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
      expect(detectAudioFormat(mp3Id3Buffer)).toBe("mp3");
    });

    it("should detect MP3 format from frame sync", () => {
      // MP3 frame sync (0xFF 0xFB)
      const mp3SyncBuffer = Buffer.from([0xff, 0xfb, 0x00, 0x00]);
      expect(detectAudioFormat(mp3SyncBuffer)).toBe("mp3");
    });

    it("should detect OGG format from OggS magic bytes", () => {
      const oggBuffer = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x00]);
      expect(detectAudioFormat(oggBuffer)).toBe("ogg");
    });

    it("should detect WebM format from magic bytes", () => {
      const webmBuffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);
      expect(detectAudioFormat(webmBuffer)).toBe("webm");
    });

    it("should return null for unknown format", () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(detectAudioFormat(unknownBuffer)).toBeNull();
    });

    it("should return null for buffer too short", () => {
      const shortBuffer = Buffer.from([0x52, 0x49, 0x46]);
      expect(detectAudioFormat(shortBuffer)).toBeNull();
    });
  });

  describe("validateAudioFile", () => {
    it("should reject empty file", () => {
      const result = validateAudioFile(Buffer.from([]));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should reject file exceeding max size", () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      const result = validateAudioFile(largeBuffer, "test.wav", 10 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too large");
    });

    it("should reject unsupported format", () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);
      const result = validateAudioFile(unknownBuffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported");
    });

    it("should accept valid WAV file", () => {
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      const result = validateAudioFile(wavBuffer, "test.wav");
      expect(result.valid).toBe(true);
      expect(result.format).toBe("wav");
    });

    it("should reject mismatched extension", () => {
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      const result = validateAudioFile(wavBuffer, "test.mp3");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not match");
    });

    it("should reject invalid extension", () => {
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      const result = validateAudioFile(wavBuffer, "test.xyz");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid file extension");
    });
  });

  describe("getFormatFromFilename", () => {
    it("should extract format from filename", () => {
      expect(getFormatFromFilename("test.wav")).toBe("wav");
      expect(getFormatFromFilename("TEST.MP3")).toBe("mp3");
      expect(getFormatFromFilename("audio.ogg")).toBe("ogg");
      expect(getFormatFromFilename("recording.webm")).toBe("webm");
    });

    it("should return null for unsupported extension", () => {
      expect(getFormatFromFilename("test.xyz")).toBeNull();
      expect(getFormatFromFilename("test")).toBeNull();
    });
  });

  describe("estimateAudioDuration", () => {
    it("should estimate duration for WAV format", () => {
      // 1 second of WAV at 1411 kbps ≈ 176 KB
      const wavBuffer = Buffer.alloc(176 * 1024);
      const duration = estimateAudioDuration(wavBuffer, "wav");
      expect(duration).toBeGreaterThan(0.5);
      expect(duration).toBeLessThan(1.5);
    });

    it("should estimate duration for MP3 format", () => {
      // 1 second of MP3 at 128 kbps ≈ 16 KB
      const mp3Buffer = Buffer.alloc(16 * 1024);
      const duration = estimateAudioDuration(mp3Buffer, "mp3");
      expect(duration).toBeGreaterThan(0.5);
      expect(duration).toBeLessThan(1.5);
    });

    it("should return null for unrealistic duration", () => {
      const tinyBuffer = Buffer.alloc(1);
      expect(estimateAudioDuration(tinyBuffer, "wav")).toBeNull();
      
      const hugeBuffer = Buffer.alloc(1000 * 1024 * 1024);
      expect(estimateAudioDuration(hugeBuffer, "wav")).toBeNull();
    });
  });
});
