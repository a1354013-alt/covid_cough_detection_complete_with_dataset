// App configuration
export const APP_NAME = "COVID-19 Cough Detection";
// APP_VERSION is injected at build time from shared/version.ts

// Shared constants
export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

// API configuration
export const API_BASE_URL = "/api";

// Audio recording configuration
export const AUDIO_CONFIG = {
  MAX_RECORDING_TIME: 30, // seconds
  MIN_RECORDING_TIME: 2, // seconds
  SAMPLE_RATE: 44100,
  CHANNELS: 1,
} as const;
