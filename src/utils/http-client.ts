/**
 * HTTP client utility for fetching data from external APIs
 * Provides methods for making HTTP requests with error handling and retries
 */

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
  const { retries = DEFAULT_OPTIONS.retries, retryDelay = DEFAULT_OPTIONS.retryDelay } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries!; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { ...DEFAULT_OPTIONS.headers, ...options.headers },
        signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
      });

      if (!response.ok) {
        throw new HttpRequestError(
          `HTTP error ${response.status}: ${response.statusText}`,
          url,
          response.status
        );
      }

      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt === retries) {
        break;
      }

      // Add some jitter to retry delay
      const jitteredDelay = retryDelay! + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }

  throw lastError instanceof HttpRequestError
    ? lastError
    : new HttpRequestError(`Failed to fetch data from ${url}: ${lastError?.message}`, url);
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
  const text = await fetchWithRetry(url, {
    ...options,
    headers: {
      ...options.headers,
      Accept: 'application/json',
    },
  });

  try {
    return JSON.parse(text) as T;
  } catch (error) {
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
  return fetchWithRetry(url, {
    ...options,
    headers: {
      ...options.headers,
      Accept: 'text/html',
    },
  });
}
