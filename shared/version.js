/**
 * Centralized Version Management
 *
 * Single source of truth for application version.
 * Used by Node.js, Python, and client to ensure consistency.
 */
export const APP_VERSION = "1.0.13";
export const API_VERSION = "1.0.13";
/**
 * Version information object
 */
export const VERSION_INFO = {
    version: APP_VERSION,
    api_version: API_VERSION,
    timestamp: new Date().toISOString(),
};
//# sourceMappingURL=version.js.map