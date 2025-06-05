/**
 * Security middleware to protect against DNS rebinding attacks
 * Based on MCP recommendations: https://modelcontextprotocol.io/docs/concepts/transports#security-warning-dns-rebinding-attacks
 */

import type { Request, Response, NextFunction } from 'express';
import { debugTransport } from './logging.js';

/**
 * List of allowed origins for SSE connections
 * Only local origins are allowed to prevent DNS rebinding attacks
 */
const ALLOWED_ORIGINS = [
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
  'http://[::1]',
  'https://[::1]',
];

/**
 * List of allowed host headers
 * Only local hosts are allowed to prevent DNS rebinding attacks
 */
const ALLOWED_HOSTS: readonly string[] = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  '::1',
];

/**
 * Check if an origin is allowed (includes port matching)
 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    // No origin header is OK for direct access
    return true;
  }

  try {
    const url = new URL(origin);
    const baseOrigin = `${url.protocol}//${url.hostname}`;
    
    // Check if base origin is in allowed list
    if (ALLOWED_ORIGINS.includes(baseOrigin)) {
      return true;
    }
    
    // Also allow with any port number for local origins
    if (url.hostname === 'localhost' || 
        url.hostname === '127.0.0.1' || 
        url.hostname === '[::1]' || 
        url.hostname === '::1') {
      return true;
    }
    
    return false;
  } catch {
    // Invalid origin format
    return false;
  }
}

/**
 * Check if a host header is allowed
 */
function isHostAllowed(host: string | undefined): boolean {
  if (!host) {
    // No host header should not happen in HTTP/1.1
    return false;
  }

  // Extract hostname (remove port)
  const parts = host.split(':');
  const hostname = parts[0];
  
  if (!hostname) {
    return false;
  }
  
  return ALLOWED_HOSTS.includes(hostname);
}

/**
 * Middleware to validate Origin headers on SSE connections
 * Prevents malicious websites from connecting to local MCP server
 */
export function validateOriginHeader(req: Request, res: Response, next: NextFunction): void {
  // Only check Origin on SSE endpoint
  if (req.path !== '/mcp') {
    return next();
  }

  const origin = req.get('Origin');
  
  if (!isOriginAllowed(origin)) {
    debugTransport('Rejected SSE connection from suspicious origin: %s', origin || 'undefined');
    res.status(403).send('Forbidden: Invalid origin');
    return;
  }

  debugTransport('Accepted SSE connection from origin: %s', origin || 'no-origin');
  next();
}

/**
 * Middleware to validate Host headers
 * Prevents DNS rebinding attacks by ensuring requests are for local hosts only
 */
export function validateHostHeader(req: Request, res: Response, next: NextFunction): void {
  const host = req.get('Host');
  
  if (!isHostAllowed(host)) {
    debugTransport('Rejected request with suspicious host header: %s', host || 'undefined');
    res.status(403).send('Forbidden: Invalid host');
    return;
  }

  next();
}

/**
 * Configure CORS to be restrictive by default
 * Only allow local origins unless explicitly configured
 */
export function getCorsOptions(configuredOrigin?: string) {
  if (configuredOrigin === '*') {
    // User explicitly wants to allow all origins (not recommended)
    debugTransport('WARNING: CORS configured to allow all origins. This is not recommended for production.');
    return {
      origin: true,
      credentials: true,
    };
  }

  if (configuredOrigin) {
    // User specified a specific origin
    return {
      origin: configuredOrigin,
      credentials: true,
    };
  }

  // Default: Only allow local origins
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  };
}