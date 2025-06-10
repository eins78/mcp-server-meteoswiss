/**
 * HTTP client utility for fetching data from external APIs
 * Provides methods for making HTTP requests with error handling and retries
 */

import { debugHttp } from './logging.js';
import { httpCache } from './http-cache.js';

/**
 * Options for HTTP requests
 */
export type HttpRequestOptions = {
  /** Number of retry attempts */
  retries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Request headers */
  headers?: Record<string, string>;
  /** Whether to use cache (default: true) */
  useCache?: boolean;
};

/**
 * Error thrown when an HTTP request fails
 */
export class HttpRequestError extends Error {
  /** HTTP status code */
  public statusCode?: number;
  /** Original URL that was requested */
  public url: string;

  constructor(message: string, url: string, statusCode?: number) {
    super(message);
    this.name = 'HttpRequestError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * Default options for HTTP requests
 */
const DEFAULT_OPTIONS: HttpRequestOptions = {
  retries: 3,
  retryDelay: 1000,
  timeout: 5000,
  headers: {
    Accept: 'application/json, text/html',
    'User-Agent': 'MeteoSwiss-MCP-Server/1.0',
  },
};

/**
 * Fetches data from a URL with retry logic and error handling
 *
 * @param url - The URL to fetch data from
 * @param options - Request options
 * @returns The response text
 * @throws {HttpRequestError} If the request fails after all retries
 */
export async function fetchWithRetry(
  url: string,
  options: HttpRequestOptions = {}
): Promise<string> {
  const { retries = DEFAULT_OPTIONS.retries, retryDelay = DEFAULT_OPTIONS.retryDelay, useCache = true } = options;
  debugHttp('Fetching URL: %s with options: %O', url, options);

  // Check cache first
  if (useCache) {
    const cached = httpCache.get<string>(url);
    if (cached) {
      return cached.data;
    }
  }

  let lastError: Error | null = null;
  let responseHeaders: Record<string, string> = {};

  for (let attempt = 0; attempt <= retries!; attempt++) {
    debugHttp('Attempt %d/%d for URL: %s', attempt + 1, retries! + 1, url);
    try {
      // Prepare headers with conditional request support
      const requestHeaders = { ...DEFAULT_OPTIONS.headers, ...options.headers };
      
      if (useCache) {
        const staleEntry = httpCache.getStaleEntry(url);
        if (staleEntry?.etag) {
          requestHeaders['If-None-Match'] = staleEntry.etag;
        }
        if (staleEntry?.lastModified) {
          requestHeaders['If-Modified-Since'] = staleEntry.lastModified;
        }
      }

      const startTime = Date.now();
      const response = await fetch(url, {
        headers: requestHeaders,
        signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
      });
      const duration = Date.now() - startTime;

      debugHttp('Response received in %dms: %d %s', duration, response.status, response.statusText);

      // Store response headers
      responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Handle 304 Not Modified
      if (response.status === 304 && useCache) {
        debugHttp('Content not modified, using cached version');
        httpCache.updateNotModified(url, responseHeaders);
        const cached = httpCache.get<string>(url);
        if (cached) {
          return cached.data;
        }
      }

      if (!response.ok) {
        const error = new HttpRequestError(
          `HTTP error ${response.status}: ${response.statusText}`,
          url,
          response.status
        );
        debugHttp('HTTP error: %O', error);
        throw error;
      }

      const text = await response.text();
      debugHttp('Successfully fetched %d bytes from %s', text.length, url);
      
      // Cache the response
      if (useCache) {
        httpCache.set(url, text, responseHeaders);
      }
      
      return text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      debugHttp('Request failed on attempt %d: %O', attempt + 1, error);

      // Don't retry on the last attempt
      if (attempt === retries) {
        debugHttp('All retry attempts exhausted for URL: %s', url);
        break;
      }

      // Add some jitter to retry delay
      const jitteredDelay = retryDelay! + Math.random() * 200;
      debugHttp('Retrying in %dms...', Math.round(jitteredDelay));
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }

  const finalError =
    lastError instanceof HttpRequestError
      ? lastError
      : new HttpRequestError(`Failed to fetch data from ${url}: ${lastError?.message}`, url);

  debugHttp('Final failure for URL %s: %O', url, finalError);
  throw finalError;
}

/**
 * Fetches JSON data from a URL and parses it
 *
 * @param url - The URL to fetch JSON from
 * @param options - Request options
 * @returns The parsed JSON data
 * @throws {HttpRequestError} If the request fails or JSON parsing fails
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<T> {
  debugHttp('Fetching JSON from URL: %s', url);

  const text = await fetchWithRetry(url, {
    ...options,
    headers: {
      ...options.headers,
      Accept: 'application/json',
    },
  });

  try {
    const data = JSON.parse(text) as T;
    debugHttp('Successfully parsed JSON from %s: %O', url, data);
    return data;
  } catch (error) {
    debugHttp('Failed to parse JSON from %s: %O', url, error);
    throw new HttpRequestError(
      `Failed to parse JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`,
      url
    );
  }
}

/**
 * Fetches HTML data from a URL
 *
 * @param url - The URL to fetch HTML from
 * @param options - Request options
 * @returns The HTML text
 * @throws {HttpRequestError} If the request fails
 */
export async function fetchHtml(url: string, options: HttpRequestOptions = {}): Promise<string> {
  debugHttp('Fetching HTML from URL: %s', url);

  const html = await fetchWithRetry(url, {
    ...options,
    headers: {
      ...options.headers,
      Accept: 'text/html',
    },
  });

  debugHttp('Successfully fetched HTML from %s (%d bytes)', url, html.length);
  return html;
}
