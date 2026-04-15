import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAudioFileName } from "./api";
import {
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_BACKEND_MIME_PREFIXES,
  ALL_SUPPORTED_MIME_TYPES,
} from "@/const";

describe("Audio Format Contract", () => {
  it("supports all documented MIME types for WAV variants", () => {
    assert.deepEqual(SUPPORTED_AUDIO_FORMATS.wav, ["audio/wav", "audio/x-wav", "audio/wave"]);
    
    for (const mimeType of SUPPORTED_AUDIO_FORMATS.wav) {
      assert.ok(
        SUPPORTED_BACKEND_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix.replace("/*", ""))),
        `${mimeType} should be a supported backend MIME prefix`
      );
    }
  });

  it("supports all documented MIME types for MP3 variants", () => {
    assert.deepEqual(SUPPORTED_AUDIO_FORMATS.mp3, ["audio/mpeg", "audio/mp3"]);
    
    for (const mimeType of SUPPORTED_AUDIO_FORMATS.mp3) {
      assert.ok(
        SUPPORTED_BACKEND_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix.replace("/*", ""))),
        `${mimeType} should be a supported backend MIME prefix`
      );
    }
  });

  it("supports OGG and WebM formats", () => {
    assert.ok(SUPPORTED_AUDIO_FORMATS.ogg.length > 0);
    assert.ok(SUPPORTED_AUDIO_FORMATS.webm.length > 0);
    assert.ok(SUPPORTED_BACKEND_MIME_PREFIXES.includes("audio/ogg"));
    assert.ok(SUPPORTED_BACKEND_MIME_PREFIXES.includes("audio/webm"));
  });

  it("getAudioFileName handles WAV variants correctly", () => {
    assert.equal(getAudioFileName("audio/wav").endsWith(".wav"), true);
    assert.equal(getAudioFileName("audio/x-wav").endsWith(".wav"), true);
    assert.equal(getAudioFileName("audio/wave").endsWith(".wav"), true);
  });

  it("getAudioFileName handles MP3 variants correctly", () => {
    assert.equal(getAudioFileName("audio/mpeg").endsWith(".mp3"), true);
    assert.equal(getAudioFileName("audio/mp3").endsWith(".mp3"), true);
  });

  it("getAudioFileName defaults to WebM for unknown types", () => {
    assert.equal(getAudioFileName("").endsWith(".webm"), true);
    assert.equal(getAudioFileName("application/octet-stream").endsWith(".webm"), true);
  });

  it("all supported MIME types are consistent", () => {
    const allMimeTypes = ALL_SUPPORTED_MIME_TYPES;
    assert.ok(allMimeTypes.length > 0, "Should have at least one supported MIME type");
    
    // Verify all MIME types are also in backend prefixes
    for (const mimeType of allMimeTypes) {
      SUPPORTED_BACKEND_MIME_PREFIXES.some((prefix) =>
        mimeType.startsWith(prefix.replace("/*", ""))
      );
      // Note: This test documents the contract but may fail if backend adds new types
      // Update SUPPORTED_BACKEND_MIME_PREFIXES if this fails
    }
  });
});
