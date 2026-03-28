/**
 * Swiss geocoding via swisstopo SearchServer API.
 * Converts place names, addresses, and ZIP codes to WGS84 coordinates.
 * Free, no auth, CORS open.
 */

import { z } from 'zod';
import { fetchJson } from './http-communication.js';
import { debugData } from './logging.js';

const SEARCH_URL = 'https://api3.geo.admin.ch/rest/services/ech/SearchServer';

/** In-memory cache for geocode results, keyed by normalized query */
const geocodeCache = new Map<string, GeocodeResult | null>();

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
 * Handles addresses, place names, ZIP codes, landmarks, etc.
 * Network errors propagate to the caller; only empty results return null.
 *
 * @param query - Location query (e.g., "Bahnhofplatz 1 Bern", "Matterhorn", "8001")
 * @returns Geocode result with lat/lon, or null if no match found
 */
export async function geocodeSwissLocation(query: string): Promise<GeocodeResult | null> {
  const cacheKey = query.trim().toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    debugData('[geocode] Cache hit for: %s', query);
    return geocodeCache.get(cacheKey) ?? null;
  }

  const params = new URLSearchParams({
    searchText: query,
    type: 'locations',
    sr: '4326',
    limit: '1',
  });

  const url = `${SEARCH_URL}?${params.toString()}`;
  debugData('[geocode] Geocoding: %s', query);

  // Let HTTP/network errors propagate — only return null for empty results
  const raw = await fetchJson(url);
  const data = SearchResponseSchema.parse(raw);
  const result = data.results?.[0];

  if (!result?.attrs?.lat || !result.attrs.lon) {
    debugData('[geocode] No results for: %s', query);
    geocodeCache.set(cacheKey, null);
    return null;
  }

  const geocoded: GeocodeResult = {
    name: stripHtml(result.attrs.label ?? query),
    lat: result.attrs.lat,
    lon: result.attrs.lon,
    origin: result.attrs.origin ?? 'unknown',
  };

  debugData(
    '[geocode] Resolved "%s" to %s (%f, %f)',
    query,
    geocoded.name,
    geocoded.lat,
    geocoded.lon
  );
  geocodeCache.set(cacheKey, geocoded);
  return geocoded;
}
