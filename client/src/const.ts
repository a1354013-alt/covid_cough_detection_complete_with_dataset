/** Synced via root `pnpm run sync:version` (same source as `server/src/config/version.ts`). */
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

export const SUPPORTED_BACKEND_MIME_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
] as const;

export const PREFERRED_RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg",
] as const;
