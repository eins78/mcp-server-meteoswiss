import { debugHttp } from './logging.js';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T;
  etag?: string;
  lastModified?: string;
  expiresAt: number;
  cachedAt: number;
}

/**
 * Simple in-memory cache with TTL and ETag support
 */
export class HttpCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly minCacheDuration = 60 * 1000; // 1 minute minimum cache

  /**
   * Get a cached response if valid
   *
   * @param key Cache key (usually URL)
   * @returns Cached data or undefined if not found/expired
   */
  get<T>(key: string): { data: T; etag?: string; lastModified?: string } | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      debugHttp('Cache miss for key: %s', key);
      return undefined;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt) {
      debugHttp('Cache expired for key: %s', key);
      this.cache.delete(key);
      return undefined;
    }

    debugHttp('Cache hit for key: %s', key);
    return {
      data: entry.data as T,
      etag: entry.etag,
      lastModified: entry.lastModified,
    };
  }

  /**
   * Store a response in cache
   *
   * @param key Cache key
   * @param data Data to cache
   * @param headers Response headers for cache control
   */
  set<T>(key: string, data: T, headers: Record<string, string | string[] | undefined>): void {
    const now = Date.now();
    let ttl = this.minCacheDuration;

    // Parse cache control headers
    const cacheControl = this.getCacheControlHeader(headers);
    if (cacheControl) {
      const maxAge = this.parseMaxAge(cacheControl);
      if (maxAge) {
        ttl = Math.max(maxAge * 1000, this.minCacheDuration);
      }
    }

    // Check expires header
    const expires = this.getHeader(headers, 'expires');
    if (expires) {
      const expiresDate = new Date(expires);
      if (!isNaN(expiresDate.getTime())) {
        const expiresIn = expiresDate.getTime() - now;
        if (expiresIn > 0) {
          ttl = Math.max(expiresIn, this.minCacheDuration);
        }
      }
    }

    const entry: CacheEntry<T> = {
      data,
      etag: this.getHeader(headers, 'etag'),
      lastModified: this.getHeader(headers, 'last-modified'),
      expiresAt: now + ttl,
      cachedAt: now,
    };

    this.cache.set(key, entry);
    debugHttp('Cached response for key: %s, TTL: %dms', key, ttl);
  }

  /**
   * Check if we have a potentially stale cache entry (for conditional requests)
   *
   * @param key Cache key
   * @returns ETag and Last-Modified if available
   */
  getStaleEntry(key: string): { etag?: string; lastModified?: string } | undefined {
    const entry = this.cache.get(key);

    if (!entry || (!entry.etag && !entry.lastModified)) {
      return undefined;
    }

    return {
      etag: entry.etag,
      lastModified: entry.lastModified,
    };
  }

  /**
   * Update cache entry if server returned 304 Not Modified
   *
   * @param key Cache key
   * @param headers New response headers
   */
  updateNotModified(key: string, headers: Record<string, string | string[] | undefined>): void {
    const entry = this.cache.get(key);
    if (!entry) return;

    // Update cache expiry based on new headers
    this.set(key, entry.data, headers);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    debugHttp('Cache cleared');
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    if (expiredKeys.length > 0) {
      debugHttp('Cleaned up %d expired cache entries', expiredKeys.length);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Get header value from headers object
   */
  private getHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined {
    const value = headers[name] || headers[name.toLowerCase()];

    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }

  /**
   * Get cache control header
   */
  private getCacheControlHeader(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    return this.getHeader(headers, 'cache-control');
  }

  /**
   * Parse max-age from cache control
   */
  private parseMaxAge(cacheControl: string): number | undefined {
    const match = cacheControl.match(/max-age=(\d+)/i);
    return match && match[1] ? parseInt(match[1], 10) : undefined;
  }
}

// Global cache instance
export const httpCache = new HttpCache();

// Cleanup expired entries periodically
const cleanupInterval = setInterval(
  () => {
    httpCache.cleanup();
  },
  5 * 60 * 1000
); // Every 5 minutes

// Prevent the interval from keeping the process alive
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}
