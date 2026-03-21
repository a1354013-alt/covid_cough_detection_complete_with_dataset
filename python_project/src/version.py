"""
Centralized Version Management for Python Backend

Single source of truth for application version.
Used by FastAPI endpoints to ensure consistency with Node.js and client.
"""

APP_VERSION = "1.0.13"
API_VERSION = "1.0.13"

# Version information object
VERSION_INFO = {
    "version": APP_VERSION,
    "api_version": API_VERSION,
}
