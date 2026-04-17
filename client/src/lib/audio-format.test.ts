import { describe, expect, it } from "vitest";
import { getAudioFileName } from "./api";
import {
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_BACKEND_MIME_PREFIXES,
  ALL_SUPPORTED_MIME_TYPES,
} from "@/const";

describe("Audio Format Contract", () => {
  it("supports all documented MIME types for WAV variants", () => {
    expect(SUPPORTED_AUDIO_FORMATS.wav).toEqual(["audio/wav", "audio/x-wav", "audio/wave"]);
    
    for (const mimeType of SUPPORTED_AUDIO_FORMATS.wav) {
      expect(
        SUPPORTED_BACKEND_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix.replace("/*", "")))
      ).toBe(true);
    }
  });

  it("supports all documented MIME types for MP3 variants", () => {
    expect(SUPPORTED_AUDIO_FORMATS.mp3).toEqual(["audio/mpeg", "audio/mp3"]);
    
    for (const mimeType of SUPPORTED_AUDIO_FORMATS.mp3) {
      expect(
        SUPPORTED_BACKEND_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix.replace("/*", "")))
      ).toBe(true);
    }
  });

  it("supports OGG and WebM formats", () => {
    expect(SUPPORTED_AUDIO_FORMATS.ogg.length).toBeGreaterThan(0);
    expect(SUPPORTED_AUDIO_FORMATS.webm.length).toBeGreaterThan(0);
    expect(SUPPORTED_BACKEND_MIME_PREFIXES.includes("audio/ogg")).toBe(true);
    expect(SUPPORTED_BACKEND_MIME_PREFIXES.includes("audio/webm")).toBe(true);
  });

  it("getAudioFileName handles WAV variants correctly", () => {
    expect(getAudioFileName("audio/wav").endsWith(".wav")).toBe(true);
    expect(getAudioFileName("audio/x-wav").endsWith(".wav")).toBe(true);
    expect(getAudioFileName("audio/wave").endsWith(".wav")).toBe(true);
  });

  it("getAudioFileName handles MP3 variants correctly", () => {
    expect(getAudioFileName("audio/mpeg").endsWith(".mp3")).toBe(true);
    expect(getAudioFileName("audio/mp3").endsWith(".mp3")).toBe(true);
  });

  it("getAudioFileName defaults to WebM for unknown types", () => {
    expect(getAudioFileName("").endsWith(".webm")).toBe(true);
    expect(getAudioFileName("application/octet-stream").endsWith(".webm")).toBe(true);
  });

  it("all supported MIME types are consistent", () => {
    const allMimeTypes = ALL_SUPPORTED_MIME_TYPES;
    expect(allMimeTypes.length).toBeGreaterThan(0);
    
    // Verify all MIME types are also in backend prefixes
    for (const mimeType of allMimeTypes) {
      expect(
        SUPPORTED_BACKEND_MIME_PREFIXES.some((prefix) =>
          mimeType.startsWith(prefix.replace("/*", ""))
        )
      ).toBe(true);
    }
  });
});
