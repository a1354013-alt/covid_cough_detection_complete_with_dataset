/** Synced via root `pnpm run sync:version` (same source as server). */
export { API_VERSION, APP_VERSION } from "@shared/version";

export const APP_NAME = "COVID-19 Cough Signal Analysis";
export const APP_SUBTITLE = "AI-powered cough risk signal analysis";

export const API_BASE_URL = "/api";

export const AUDIO_CONFIG = {
  maxRecordingTimeSeconds: 30,
  minRecordingTimeSeconds: 2,
  maxFileSizeBytes: 10 * 1024 * 1024,
  sampleRate: 44100,
  channels: 1,
} as const;

/**
 * Audio MIME types supported by the backend.
 * Frontend must validate MIME type against this list.
 * Supports WAV (RIFF), MP3 (ID3/frame sync), OGG, WebM formats.
 * Multiple MIME variations (e.g., audio/wav, audio/x-wav) map to same format.
 */
export const SUPPORTED_AUDIO_FORMATS = {
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  mp3: ["audio/mpeg", "audio/mp3"],
  ogg: ["audio/ogg"],
  webm: ["audio/webm"],
} as const;

/** Backend MIME type prefixes for validation */
export const SUPPORTED_BACKEND_MIME_PREFIXES = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/webm",
] as const;

export const ALL_SUPPORTED_MIME_TYPES = Object.values(SUPPORTED_AUDIO_FORMATS).flat() as ReadonlyArray<string>;

export const SUPPORTED_AUDIO_EXTENSIONS = ["wav", "mp3", "ogg", "webm"] as const;

export const PREFERRED_RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg",
] as const;
