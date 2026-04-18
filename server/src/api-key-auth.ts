/**
 * API Key Authentication Middleware
 * 
 * Provides optional API key verification for protected endpoints.
 * Supports multiple API keys with different permission levels.
 * 
 * Usage:
 * - Set API_KEYS environment variable as comma-separated list
 * - Example: API_KEYS="admin-key-123,read-only-key-456"
 * - Or use API_KEY_FILE to load keys from a file (one per line)
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import { existsSync, readFileSync } from 'node:fs';

export interface ApiKeyConfig {
  key: string;
  permissions: Array<'read' | 'write' | 'admin'>;
  description?: string;
  createdAt?: string;
  expiresAt?: string;
}

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
  apiKeyPermissions?: Array<'read' | 'write' | 'admin'>;
}

interface AuthMiddlewareOptions {
  required?: boolean; // If true, all requests must have valid API key
  defaultPermissions?: Array<'read' | 'write' | 'admin'>; // Permissions if no API key provided but not required
}

class ApiKeyStore {
  private keys: Map<string, ApiKeyConfig> = new Map();
  private filePath?: string;
  private lastLoadTime = 0;
  private readonly RELOAD_INTERVAL_MS = 60000; // Reload every minute

  constructor() {
    this.loadFromEnv();
  }

  /**
   * Load API keys from environment variable
   */
  private loadFromEnv(): void {
    const envKeys = process.env.API_KEYS;
    const keyFile = process.env.API_KEY_FILE;

    if (keyFile && existsSync(keyFile)) {
      this.filePath = keyFile;
      this.loadFromFile();
      return;
    }

    if (envKeys) {
      const keysList = envKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
      
      // Clear existing keys
      this.keys.clear();

      for (const key of keysList) {
        // Simple key format: just the key string with admin permissions
        this.keys.set(key, {
          key,
          permissions: ['read', 'write', 'admin'],
          description: 'Environment variable key',
          createdAt: new Date().toISOString(),
        });
      }

      logger.info('Loaded API keys from environment', { count: this.keys.size });
    }
  }

  /**
   * Load API keys from file (one key per line)
   * Supports JSON format for advanced configuration
   */
  private loadFromFile(): void {
    if (!this.filePath || !existsSync(this.filePath)) {
      return;
    }

    try {
      const content = readFileSync(this.filePath, 'utf-8').trim();
      
      // Try parsing as JSON first
      try {
        const config = JSON.parse(content) as ApiKeyConfig[];
        if (Array.isArray(config)) {
          this.keys.clear();
          for (const keyConfig of config) {
            if (keyConfig.key) {
              // Check expiration
              if (keyConfig.expiresAt && new Date(keyConfig.expiresAt) < new Date()) {
                logger.warn('Skipping expired API key', { key: keyConfig.key.substring(0, 8) + '...' });
                continue;
              }
              this.keys.set(keyConfig.key, keyConfig);
            }
          }
          logger.info('Loaded API keys from JSON file', { count: this.keys.size });
          this.lastLoadTime = Date.now();
          return;
        }
      } catch {
        // Not JSON, treat as plain text (one key per line)
      }

      // Plain text format: one key per line
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
      
      this.keys.clear();
      for (const key of lines) {
        this.keys.set(key, {
          key,
          permissions: ['read', 'write', 'admin'],
          description: 'File-based key',
          createdAt: new Date().toISOString(),
        });
      }

      logger.info('Loaded API keys from text file', { count: this.keys.size });
      this.lastLoadTime = Date.now();
    } catch (error) {
      logger.error('Failed to load API keys from file', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate an API key
   */
  validate(key: string | undefined): ApiKeyConfig | null {
    if (!key) {
      return null;
    }

    // Reload from file periodically if using file-based config
    if (this.filePath && Date.now() - this.lastLoadTime > this.RELOAD_INTERVAL_MS) {
      this.loadFromFile();
    }

    const keyConfig = this.keys.get(key);
    
    if (!keyConfig) {
      return null;
    }

    // Check expiration
    if (keyConfig.expiresAt && new Date(keyConfig.expiresAt) < new Date()) {
      this.keys.delete(key);
      return null;
    }

    return keyConfig;
  }

  /**
   * Check if any keys are configured
   */
  hasKeys(): boolean {
    return this.keys.size > 0;
  }

  /**
   * Get count of active keys
   */
  getKeyCount(): number {
    return this.keys.size;
  }
}

const apiKeyStore = new ApiKeyStore();

/**
 * Create API key authentication middleware
 */
export function createApiKeyAuth(options: AuthMiddlewareOptions = {}) {
  return function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    let apiKey: string | undefined;

    // Extract API key from Authorization header
    // Supports: "Bearer <key>" or "Apikey <key>" or query param "api_key"
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2) {
        const [scheme, credentials] = parts;
        if (['bearer', 'apikey'].includes(scheme.toLowerCase())) {
          apiKey = credentials;
        }
      }
    }

    // Also check query parameter (less secure, but useful for some clients)
    if (!apiKey && typeof req.query.api_key === 'string') {
      apiKey = req.query.api_key;
    }

    // Check if API keys are configured
    if (!apiKeyStore.hasKeys()) {
      // No keys configured, authentication is effectively disabled
      if (options.required) {
        logger.warn('API key authentication is required but no keys are configured');
        res.status(503).json({
          error: 'Authentication unavailable',
          details: 'No API keys configured on server',
        });
        return;
      }
      
      // Apply default permissions if provided
      const authenticatedReq = req as AuthenticatedRequest;
      if (options.defaultPermissions) {
        authenticatedReq.apiKeyPermissions = options.defaultPermissions;
      }
      next();
      return;
    }

    // Validate the API key
    const keyConfig = apiKeyStore.validate(apiKey);

    if (!keyConfig) {
      if (options.required) {
        logger.warn('Invalid API key attempt', { 
          ip: req.ip, 
          path: req.path,
          keyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'none' 
        });
        res.status(401).json({
          error: 'Invalid API key',
          details: 'A valid API key is required to access this endpoint',
        });
        return;
      }
      
      // Key is invalid but not required, continue without auth
      next();
      return;
    }

    // Attach authentication info to request
    const authenticatedReq = req as AuthenticatedRequest;
    authenticatedReq.apiKey = apiKey;
    authenticatedReq.apiKeyPermissions = keyConfig.permissions;

    logger.debug('API key authenticated', {
      keyPrefix: apiKey?.substring(0, 8) + '...',
      permissions: keyConfig.permissions,
      path: req.path,
    });

    next();
  };
}

/**
 * Create a middleware that requires specific permissions
 */
export function requirePermissions(...requiredPermissions: Array<'read' | 'write' | 'admin'>) {
  return function permissionsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authenticatedReq = req as AuthenticatedRequest;
    const permissions = authenticatedReq.apiKeyPermissions || [];

    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some(perm => permissions.includes(perm));

    if (!hasPermission) {
      logger.warn('Permission denied', {
        required: requiredPermissions,
        has: permissions,
        path: req.path,
        ip: req.ip,
      });
      res.status(403).json({
        error: 'Insufficient permissions',
        details: `This endpoint requires one of: ${requiredPermissions.join(', ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Optional API key authentication (doesn't require key but validates if provided)
 */
export const optionalApiKeyAuth = createApiKeyAuth({ required: false });

/**
 * Required API key authentication (rejects requests without valid key)
 */
export const requiredApiKeyAuth = createApiKeyAuth({ required: true });

/**
 * Read-only access middleware (requires valid key with read permission)
 */
export const readOnlyAccess = [
  createApiKeyAuth({ required: true }),
  requirePermissions('read', 'write', 'admin'),
];

/**
 * Write access middleware (requires valid key with write or admin permission)
 */
export const writeAccess = [
  createApiKeyAuth({ required: true }),
  requirePermissions('write', 'admin'),
];

/**
 * Admin access middleware (requires valid key with admin permission)
 */
export const adminAccess = [
  createApiKeyAuth({ required: true }),
  requirePermissions('admin'),
];

/**
 * Get API key statistics for monitoring
 */
export function getApiKeyStats(): {
  totalKeys: number;
  keysConfigured: boolean;
} {
  return {
    totalKeys: apiKeyStore.getKeyCount(),
    keysConfigured: apiKeyStore.hasKeys(),
  };
}
