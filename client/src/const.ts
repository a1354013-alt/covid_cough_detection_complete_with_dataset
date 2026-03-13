// Shared constants
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// App configuration
export const APP_NAME = "COVID-19 Cough Detection";
export const APP_VERSION = "1.0.0";

// API configuration
export const API_BASE_URL = "/api";

// Audio recording configuration
export const AUDIO_CONFIG = {
  MAX_RECORDING_TIME: 30, // seconds
  MIN_RECORDING_TIME: 2, // seconds
  SAMPLE_RATE: 44100,
  CHANNELS: 1,
} as const;
