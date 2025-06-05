/**
 * URL generation utilities for consistent service URLs
 */

import type { EnvConfig } from './environment-validation.js';

/**
 * Get the base URL for the service
 * Priority order:
 * 1. PUBLIC_URL if set (full URL including protocol and port)
 * 2. SERVICE_HOSTNAME + PORT if SERVICE_HOSTNAME is set
 * 3. Default to localhost:PORT
 */
export function getServiceBaseUrl(config: EnvConfig): string {
  // If PUBLIC_URL is set, use it directly
  if (config.PUBLIC_URL) {
    return config.PUBLIC_URL.replace(/\/$/, ''); // Remove trailing slash
  }
  
  // Use SERVICE_HOSTNAME if set, otherwise use localhost
  const hostname = config.SERVICE_HOSTNAME || 'localhost';
  
  // For standard ports, omit them from the URL
  const port = config.PORT;
  const portSuffix = (port === 80 || port === 443) ? '' : `:${port}`;
  
  // Determine protocol based on port or default to http
  const protocol = port === 443 ? 'https' : 'http';
  
  return `${protocol}://${hostname}${portSuffix}`;
}

/**
 * Get the MCP endpoint URL
 */
export function getMcpEndpointUrl(config: EnvConfig): string {
  return `${getServiceBaseUrl(config)}/mcp`;
}

/**
 * Get the health check URL
 */
export function getHealthEndpointUrl(config: EnvConfig): string {
  return `${getServiceBaseUrl(config)}/health`;
}