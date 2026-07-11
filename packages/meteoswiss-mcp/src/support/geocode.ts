/**
 * Swiss geocoding via swisstopo SearchServer API.
 * Converts place names, addresses, and ZIP codes to WGS84 coordinates.
 * Free, no auth, CORS open.
 */

import { z } from 'zod';
import { fetchJson } from './http-communication.js';
import { debugData } from './logging.js';
import { USE_TEST_FIXTURES } from './test-fixtures.js';

const SEARCH_URL = 'https://api3.geo.admin.ch/rest/services/ech/SearchServer';

/** Approximate WGS84 bounding box for Switzerland (slightly padded for border areas) */
const SWISS_BOUNDS = {
  latMin: 45.7,
  latMax: 47.9,
  lonMin: 5.8,
  lonMax: 10.6,
} as const;

/**
 * Check whether a WGS84 coordinate falls within Switzerland's approximate bounding box.
 * Slightly padded to include border regions and Liechtenstein.
 */
export function isInsideSwitzerland(lat: number, lon: number): boolean {
  return (
    lat >= SWISS_BOUNDS.latMin &&
    lat <= SWISS_BOUNDS.latMax &&
    lon >= SWISS_BOUNDS.lonMin &&
    lon <= SWISS_BOUNDS.lonMax
  );
}

/**
 * Swisstopo SearchServer origin presets.
 * - `place`:   municipalities, districts, cantons, and postal codes (admin/place-name lookups)
 * - `address`: street-address lookups
 * - `all`:     every origin the API supports (default behaviour — widest)
 *
 * Non-`all` presets narrow the API response so non-Swiss queries ("Paris")
 * cannot match arbitrary Swiss street/business labels.
 */
export const GEOCODE_ORIGINS = ['place', 'address', 'all'] as const;
export type GeocodeOrigin = (typeof GEOCODE_ORIGINS)[number];

/** Map origin presets to swisstopo `origins=` query-param values */
const ORIGIN_PARAMS: Record<GeocodeOrigin, string | undefined> = {
  place: 'zipcode,gg25,district,kantone',
  address: 'address',
  all: undefined,
};

/**
 * Build the swisstopo SearchServer URL for a query. Exported as a pure
 * helper so unit tests can verify origin-param assembly without mocking
 * `fetch`.
 */
export function buildGeocodeUrl(query: string, origins: GeocodeOrigin = 'all'): string {
  const params = new URLSearchParams({
    searchText: query,
    type: 'locations',
    sr: '4326',
    limit: '1',
  });
  const originsParam = ORIGIN_PARAMS[origins];
  if (originsParam) {
    params.set('origins', originsParam);
  }
  return `${SEARCH_URL}?${params.toString()}`;
}

/** Options accepted by geocodeSwissLocation */
export type GeocodeOptions = {
  /** Restrict swisstopo match origins. Defaults to `'all'`. */
  origins?: GeocodeOrigin;
};

/** In-memory cache for geocode results, keyed by normalized query + origins */
const geocodeCache = new Map<string, GeocodeResult | null>();

/**
 * Entry cap for {@link geocodeCache}. It caches null misses too, so distinct
 * query strings (including junk) would otherwise grow it without bound (SEC-6).
 */
const GEOCODE_CACHE_MAX = Number(process.env.GEOCODE_CACHE_MAX_ENTRIES) || 2000;

/** Insert/refresh a geocode cache entry, evicting the oldest while over the cap. */
function cacheGeocode(key: string, value: GeocodeResult | null): void {
  geocodeCache.delete(key);
  geocodeCache.set(key, value);
  while (geocodeCache.size > GEOCODE_CACHE_MAX) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest === undefined) break;
    geocodeCache.delete(oldest);
  }
}

/** Result from the swisstopo geocoding API */
export type GeocodeResult = {
  name: string;
  lat: number;
  lon: number;
  origin: string;
};

/** Zod schema for the swisstopo SearchServer response */
const SearchResponseSchema = z.object({
  results: z
    .array(
      z.object({
        attrs: z
          .object({
            label: z.string().optional(),
            lat: z.number().optional(),
            lon: z.number().optional(),
            origin: z.string().optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

/**
 * Strip HTML tags from swisstopo labels.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Geocode a Swiss location using the swisstopo SearchServer API.
 *
 * The optional `origins` option restricts which kinds of swisstopo records
 * the API will match. Callers should pass `'place'` for plain place-name
 * lookups so international city names ("Paris") don't match Swiss street
 * labels, and `'all'` (or omit) only when the query is clearly an address.
 *
 * Network errors propagate to the caller; only empty results return null.
 *
 * @param query - Location query (e.g., "Bahnhofplatz 1 Bern", "Matterhorn", "8001")
 * @param options - Optional match restrictions
 * @returns Geocode result with lat/lon, or null if no match found
 */
export async function geocodeSwissLocation(
  query: string,
  options: GeocodeOptions = {}
): Promise<GeocodeResult | null> {
  const originsPreset: GeocodeOrigin = options.origins ?? 'all';

  const cacheKey = `${originsPreset}:${query.trim().toLowerCase()}`;
  if (geocodeCache.has(cacheKey)) {
    debugData('[geocode] Cache hit for: %s (origins=%s)', query, originsPreset);
    const cached = geocodeCache.get(cacheKey) ?? null;
    cacheGeocode(cacheKey, cached); // promote to most-recently-used
    return cached;
  }

  const url = buildGeocodeUrl(query, originsPreset);
  debugData('[geocode] Geocoding: %s (origins=%s)', query, originsPreset);

  // In test mode, return null (geocoding requires live API)
  if (USE_TEST_FIXTURES) {
    debugData('[geocode] Test mode — skipping geocode for: %s', query);
    cacheGeocode(cacheKey, null);
    return null;
  }

  // Let HTTP/network errors propagate — only return null for empty results
  const raw = await fetchJson(url);
  const data = SearchResponseSchema.parse(raw);
  const result = data.results?.[0];

  if (!result?.attrs?.lat || !result.attrs.lon) {
    debugData('[geocode] No results for: %s', query);
    cacheGeocode(cacheKey, null);
    return null;
  }

  const geocoded: GeocodeResult = {
    name: stripHtml(result.attrs.label ?? query),
    lat: result.attrs.lat,
    lon: result.attrs.lon,
    origin: result.attrs.origin ?? 'unknown',
  };

  // Reject results outside Switzerland to prevent non-Swiss queries (e.g., "Paris")
  // from returning coordinates that would resolve to a random Swiss station
  if (!isInsideSwitzerland(geocoded.lat, geocoded.lon)) {
    debugData(
      '[geocode] Result outside Switzerland for "%s": %s (%f, %f) — rejected',
      query,
      geocoded.name,
      geocoded.lat,
      geocoded.lon
    );
    cacheGeocode(cacheKey, null);
    return null;
  }

  debugData(
    '[geocode] Resolved "%s" to %s (%f, %f)',
    query,
    geocoded.name,
    geocoded.lat,
    geocoded.lon
  );
  cacheGeocode(cacheKey, geocoded);
  return geocoded;
}
