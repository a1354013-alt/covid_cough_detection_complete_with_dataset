/**
 * AUTO-GENERATED FILE.
 * Source of truth: root package.json version.
 * Run `corepack pnpm run sync:version` after version bumps.
 */

export const APP_VERSION = "1.0.13";
export const API_VERSION = "1.0.13";

export function getVersionInfo() {
  return {
    version: APP_VERSION,
    api_version: API_VERSION,
    timestamp: new Date().toISOString(),
  };
}
