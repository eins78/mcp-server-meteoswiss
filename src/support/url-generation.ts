/**
 * URL generation utilities for consistent service URLs
 */

import type { EnvConfig } from './environment-validation.js';

/**
 * Get the base URL for the service
 * Uses PUBLIC_URL if set, otherwise defaults to localhost:PORT
 */
export function getServiceBaseUrl(config: EnvConfig): string {
  // If PUBLIC_URL is set, use it directly
  if (config.PUBLIC_URL) {
    return config.PUBLIC_URL.replace(/\/$/, ''); // Remove trailing slash
  }

  // Default to localhost with configured port
  const port = config.PORT;
  const portSuffix = port === 80 || port === 443 ? '' : `:${port}`;

  // Determine protocol based on port or default to http
  const protocol = port === 443 ? 'https' : 'http';

  return `${protocol}://localhost${portSuffix}`;
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
