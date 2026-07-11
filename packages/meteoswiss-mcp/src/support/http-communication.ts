/**
 * HTTP client utility for fetching data from external APIs
 * Provides methods for making HTTP requests with error handling and retries
 */

import { debugHttp } from './logging.js';
import { httpCache } from './http-cache.js';
import { getVersion } from './version.js';

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
  /** Hard cap on the response body size in bytes (defaults to {@link MAX_RESPONSE_BYTES}) */
  maxBytes?: number;
  /**
   * When provided, redirects are followed manually and this callback is invoked
   * for the initial URL and every redirect `Location`. Throw to reject a hop.
   * Without it, native fetch's default `redirect: 'follow'` is used unchanged.
   */
  validateUrl?: (url: string) => void;
  /** Maximum redirect hops to follow when {@link validateUrl} is set (default 5) */
  maxRedirects?: number;
};

/**
 * Error thrown when an HTTP request fails
 */
export class HttpRequestError extends Error {
  /** HTTP status code */
  public statusCode?: number;
  /** Original URL that was requested */
  public url: string;
  /** Whether retrying the request could plausibly succeed (false for e.g. oversized bodies, 4xx) */
  public retryable: boolean;

  constructor(message: string, url: string, statusCode?: number, retryable = true) {
    super(message);
    this.name = 'HttpRequestError';
    this.url = url;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Default options for HTTP requests
 */
const USER_AGENT = `MeteoSwiss-MCP-Server/${getVersion()}`;

/** Default request timeout in ms (bounds *time*, applied on every path). */
const DEFAULT_TIMEOUT_MS = 30000; // Increased from 5s to 30s for complex pages

/**
 * Hard ceiling on any single upstream response body, in bytes (bounds *bytes*).
 * `AbortSignal.timeout` only bounds time; without a byte cap, undici buffers the
 * entire body into the heap regardless. Configurable via `MAX_RESPONSE_BYTES`;
 * mirrors the default validated in environment-validation.ts (50 MiB).
 */
export const MAX_RESPONSE_BYTES = ((): number => {
  const parsed = parseInt(process.env.MAX_RESPONSE_BYTES ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 52428800;
})();

/**
 * Default options for HTTP requests
 */
const DEFAULT_OPTIONS: HttpRequestOptions = {
  retries: 3,
  retryDelay: 1000,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    Accept: 'application/json, text/html',
    'User-Agent': USER_AGENT,
  },
};

/**
 * Reads a {@link Response} body into a Buffer, aborting once `maxBytes` is exceeded.
 *
 * Checks the declared `Content-Length` first (cheap rejection), then enforces the
 * cap while streaming in case the header lies or is absent. The overflow error is
 * marked non-retryable so the retry loop does not re-stream the same oversized body.
 *
 * @param response - The fetch response to drain
 * @param maxBytes - Maximum allowed body size in bytes
 * @param url - Request URL (for error context)
 * @returns The full body as a Buffer (never larger than `maxBytes`)
 * @throws {HttpRequestError} If the body exceeds `maxBytes`
 */
async function readBodyCapped(response: Response, maxBytes: number, url: string): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new HttpRequestError(
        `Response body too large: Content-Length ${declaredBytes} exceeds cap of ${maxBytes} bytes`,
        url,
        response.status,
        false
      );
    }
  }

  const body = response.body;
  if (!body) {
    return Buffer.alloc(0);
  }

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new HttpRequestError(
          `Response body too large: exceeded cap of ${maxBytes} bytes`,
          url,
          response.status,
          false
        );
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}

/** HTTP status codes that carry a redirect `Location`. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Performs a fetch, following redirects manually when `validateUrl` is supplied
 * so the caller can re-run its allowlist on every hop (defends against an
 * upstream open redirect escaping the domain allowlist — SEC-4). When
 * `validateUrl` is absent, native `redirect: 'follow'` is used unchanged.
 *
 * @throws {HttpRequestError} If a hop is rejected by `validateUrl` (non-retryable)
 *   or the redirect chain exceeds `maxRedirects`.
 */
async function fetchMaybeFollowingRedirects(
  url: string,
  init: NonNullable<Parameters<typeof fetch>[1]>,
  validateUrl: ((url: string) => void) | undefined,
  maxRedirects: number
): Promise<Response> {
  if (!validateUrl) {
    return fetch(url, init);
  }

  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    try {
      validateUrl(current);
    } catch (error) {
      // Rejection is a permanent property of the URL — do not retry.
      throw new HttpRequestError(
        error instanceof Error ? error.message : String(error),
        current,
        undefined,
        false
      );
    }

    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    if (location === null) {
      return response; // 3xx without Location — let the caller handle the status
    }
    await response.body?.cancel();
    current = new URL(location, current).toString();
  }

  throw new HttpRequestError(
    `Too many redirects (exceeded ${maxRedirects}) starting from ${url}`,
    url,
    undefined,
    false
  );
}

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
  const {
    retries = DEFAULT_OPTIONS.retries,
    retryDelay = DEFAULT_OPTIONS.retryDelay,
    useCache = true,
    timeout = DEFAULT_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
  } = options;
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
      const response = await fetchMaybeFollowingRedirects(
        url,
        {
          headers: requestHeaders,
          // Always bound time — the content-fetch path previously passed no timeout,
          // leaving the signal undefined and the request unbounded in time.
          signal: AbortSignal.timeout(timeout),
        },
        options.validateUrl,
        options.maxRedirects ?? 5
      );
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

      // Bound *bytes*: stream into a capped buffer. `new TextDecoder().decode`
      // strips a leading UTF-8 BOM exactly as `response.text()` does, so JSON
      // parsing downstream is unaffected.
      const buffer = await readBodyCapped(response, maxBytes, url);
      const text = new TextDecoder().decode(buffer);
      debugHttp('Successfully fetched %d bytes from %s', buffer.length, url);

      // Cache the response
      if (useCache) {
        httpCache.set(url, text, responseHeaders);
      }

      return text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      debugHttp('Request failed on attempt %d: %O', attempt + 1, error);

      // Don't retry errors flagged non-retryable (e.g. oversized body) — retrying
      // would only re-stream the same failure.
      if (error instanceof HttpRequestError && !error.retryable) {
        debugHttp('Non-retryable error, aborting retries for URL: %s', url);
        break;
      }

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

/**
 * Fetches binary data from a URL with retry logic.
 * Used for CSVs served without charset (defaults to Latin1/Windows-1252).
 *
 * @param url - The URL to fetch from
 * @param options - Request options
 * @returns The raw response as a Buffer
 * @throws {HttpRequestError} If the request fails after all retries
 */
export async function fetchBinary(url: string, options: HttpRequestOptions = {}): Promise<Buffer> {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = DEFAULT_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
  } = options;
  debugHttp('Fetching binary from URL: %s', url);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          ...options.headers,
        },
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        throw new HttpRequestError(
          `HTTP error ${response.status}: ${response.statusText}`,
          url,
          response.status
        );
      }

      // Bound bytes: stream into a capped buffer instead of arrayBuffer()'ing the
      // whole (potentially oversized) response into the heap.
      const buffer = await readBodyCapped(response, maxBytes, url);
      debugHttp('Successfully fetched %d bytes (binary) from %s', buffer.length, url);
      return buffer;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof HttpRequestError && !error.retryable) break;
      if (attempt === retries) break;
      const jitteredDelay = retryDelay + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }

  throw lastError instanceof HttpRequestError
    ? lastError
    : new HttpRequestError(`Failed to fetch binary from ${url}: ${lastError?.message}`, url);
}
