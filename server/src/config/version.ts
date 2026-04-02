/**
 * Centralized Version Management
 * 
 * Single source of truth for application version.
 * Used by Node.js, Python, and client to ensure consistency.
 */

export const APP_VERSION = "1.0.13";
export const API_VERSION = "1.0.13";

/**
 * Get version information with current timestamp
 * Timestamp is generated dynamically whenever getVersionInfo() is called,
 * not at deployment time or module load time.
 */
export function getVersionInfo() {
  return {
    version: APP_VERSION,
    api_version: API_VERSION,
    timestamp: new Date().toISOString(),
  };
}
