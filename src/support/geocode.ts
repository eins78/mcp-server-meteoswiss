/**
 * Swiss geocoding via swisstopo SearchServer API.
 * Converts place names, addresses, and ZIP codes to WGS84 coordinates.
 * Free, no auth, CORS open.
 */

import { fetchJson } from './http-communication.js';
import { debugData } from './logging.js';

const SEARCH_URL = 'https://api3.geo.admin.ch/rest/services/ech/SearchServer';

/** Result from the swisstopo geocoding API */
export type GeocodeResult = {
  name: string;
  lat: number;
  lon: number;
  origin: string;
};

/** Raw API response shape */
type SearchResponse = {
  results?: Array<{
    attrs?: {
      label?: string;
      lat?: number;
      lon?: number;
      origin?: string;
    };
  }>;
};

/**
 * Strip HTML tags from swisstopo labels.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Geocode a Swiss location using the swisstopo SearchServer API.
 * Handles addresses, place names, ZIP codes, landmarks, etc.
 *
 * @param query - Location query (e.g., "Bahnhofplatz 1 Bern", "Matterhorn", "8001")
 * @returns Geocode result with lat/lon, or null if no match
 */
export async function geocodeSwissLocation(query: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    searchText: query,
    type: 'locations',
    sr: '4326',
    limit: '1',
  });

  const url = `${SEARCH_URL}?${params.toString()}`;
  debugData('[geocode] Geocoding: %s', query);

  try {
    const data = await fetchJson<SearchResponse>(url);
    const result = data.results?.[0];
    if (!result?.attrs?.lat || !result.attrs.lon) {
      debugData('[geocode] No results for: %s', query);
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
    return geocoded;
  } catch (error) {
    debugData('[geocode] Geocoding failed for "%s": %O', query, error);
    return null;
  }
}
