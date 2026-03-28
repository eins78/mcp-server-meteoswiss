/**
 * Station and location resolver for MeteoSwiss OGD data.
 * Resolves natural language queries (place names, postal codes, station abbreviations)
 * to specific forecast points or weather stations.
 */

import { getCollection } from './ogd-stac-client.js';
import { getLatin1CsvData } from './ogd-data-store.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS } from '../schemas/ogd-shared.js';
import type { ForecastPoint } from '../schemas/ogd-shared.js';
import { normalize } from '../support/normalize.js';
import { findNearest } from '../support/haversine.js';
import { geocodeSwissLocation } from '../support/geocode.js';

/** Indexed forecast point data for fast lookups */
type ForecastIndex = {
  points: ForecastPoint[];
  byPostalCode: Map<string, ForecastPoint>;
  byAbbr: Map<string, ForecastPoint>;
};

let indexCache: ForecastIndex | null = null;

/**
 * Load forecast point metadata from the OGD STAC API and build lookup indexes.
 * Cached in memory after first load.
 */
async function loadForecastIndex(): Promise<ForecastIndex> {
  if (indexCache) {
    return indexCache;
  }

  debugData('[ogd-resolver] Loading forecast point metadata...');
  const collection = await getCollection(OGD_COLLECTIONS.LOCAL_FORECASTING);
  const metaAsset =
    collection.assets?.['ogd-local-forecasting_meta_point.csv'] ??
    collection.assets?.['ogd-local-forcasting_meta_point.csv']; // typo in official data

  if (!metaAsset) {
    throw new Error('Forecast point metadata asset not found in collection');
  }

  const rows = await getLatin1CsvData(metaAsset.href, 'metadata/forecast-points.csv', 'metadata');
  debugData('[ogd-resolver] Loaded %d forecast point rows', rows.length);

  const points: ForecastPoint[] = rows.map((row) => ({
    point_id: parseNumeric(row.point_id ?? null) ?? 0,
    point_type_id: parseNumeric(row.point_type_id ?? null) ?? 0,
    station_abbr: row.station_abbr ?? null,
    postal_code: row.postal_code ?? null,
    name: row.point_name ?? '',
    elevation: parseNumeric(row.point_height_masl ?? null) ?? 0,
    coordinates: {
      lat: parseNumeric(row.point_coordinates_wgs84_lat ?? null) ?? 0,
      lon: parseNumeric(row.point_coordinates_wgs84_lon ?? null) ?? 0,
    },
  }));

  const byPostalCode = new Map<string, ForecastPoint>();
  const byAbbr = new Map<string, ForecastPoint>();
  for (const p of points) {
    if (p.point_type_id === 2 && p.postal_code) {
      byPostalCode.set(p.postal_code.toLowerCase(), p);
    }
    if (p.point_type_id === 1 && p.station_abbr) {
      byAbbr.set(p.station_abbr.toLowerCase(), p);
    }
  }

  debugData('[ogd-resolver] Indexed %d postal codes, %d stations', byPostalCode.size, byAbbr.size);
  indexCache = { points, byPostalCode, byAbbr };
  return indexCache;
}

/** Result of a station/location resolution */
export type ResolveResult = {
  match: ForecastPoint;
  alternatives: ForecastPoint[];
  confidence: 'exact' | 'fuzzy';
};

/**
 * Resolve a query string to a forecast point.
 * Matches against station abbreviations, postal codes, and place names.
 *
 * @param query - Station name, abbreviation, postal code, or place name
 * @returns Best match and alternatives
 */
export async function resolveForecastPoint(query: string): Promise<ResolveResult> {
  const { points, byPostalCode, byAbbr } = await loadForecastIndex();
  const q = normalize(query.trim());

  // O(1) exact match on postal code
  const postalMatch = byPostalCode.get(q);
  if (postalMatch) {
    return { match: postalMatch, alternatives: [], confidence: 'exact' };
  }

  // O(1) exact match on station abbreviation
  const abbrMatch = byAbbr.get(q);
  if (abbrMatch) {
    return { match: abbrMatch, alternatives: [], confidence: 'exact' };
  }

  // Fuzzy match on name (case-insensitive, diacritic-insensitive substring)
  const nameMatches = points.filter((p) => normalize(p.name).includes(q));
  if (nameMatches.length > 0) {
    const sorted = nameMatches.sort((a, b) => {
      // Exact name match first
      if (normalize(a.name) === q && normalize(b.name) !== q) return -1;
      if (normalize(b.name) === q && normalize(a.name) !== q) return 1;
      // Postal codes before stations for city names
      if (a.point_type_id === 2 && b.point_type_id !== 2) return -1;
      if (b.point_type_id === 2 && a.point_type_id !== 2) return 1;
      return 0;
    });

    const best = sorted[0];
    if (!best) {
      throw new Error(`Unexpected empty match array for "${query}"`);
    }
    return {
      match: best,
      alternatives: sorted.slice(1, 4),
      confidence: normalize(best.name) === q ? 'exact' : 'fuzzy',
    };
  }

  // Geocoding fallback: resolve query to coordinates, find nearest forecast point
  debugData('[ogd-resolver] No direct match for "%s", trying geocoding...', query);
  const geocoded = await geocodeSwissLocation(query);
  if (geocoded) {
    // Prefer postal code points for geocoded locations
    const candidates = points.filter((p) => p.point_type_id === 2);
    const pool = candidates.length > 0 ? candidates : points;
    const result = findNearest(
      pool,
      (p) => p.coordinates.lat,
      (p) => p.coordinates.lon,
      geocoded.lat,
      geocoded.lon
    );
    if (result) {
      debugData(
        '[ogd-resolver] Geocoded "%s" → %s, nearest point: %s (%.1f km)',
        query,
        geocoded.name,
        result.item.name,
        result.distance_km
      );
      return { match: result.item, alternatives: [], confidence: 'fuzzy' };
    }
  }

  throw new Error(
    `No forecast point found for "${query}". Try a Swiss postal code (e.g., "8001"), ` +
      `station abbreviation (e.g., "ZUE"), or place name (e.g., "Zurich").`
  );
}

/**
 * Clear the in-memory forecast points cache. Useful for testing.
 */
export function clearResolverCache(): void {
  indexCache = null;
}
