/**
 * Station and location resolver for MeteoSwiss OGD data.
 * Resolves natural language queries (place names, postal codes, station abbreviations)
 * to specific forecast points or weather stations.
 */

import { getCollection } from './ogd-stac-client.js';
import { getRawCsvData } from './ogd-data-store.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';
import type { ForecastPoint } from '../schemas/ogd-shared.js';

const FORECAST_COLLECTION = 'ch.meteoschweiz.ogd-local-forecasting';

let forecastPointsCache: ForecastPoint[] | null = null;

/**
 * Load forecast point metadata from the OGD STAC API.
 * Cached in memory after first load.
 */
async function loadForecastPoints(): Promise<ForecastPoint[]> {
  if (forecastPointsCache) {
    return forecastPointsCache;
  }

  debugData('[ogd-resolver] Loading forecast point metadata...');
  const collection = await getCollection(FORECAST_COLLECTION);
  const metaAsset =
    collection.assets?.['ogd-local-forecasting_meta_point.csv'] ??
    collection.assets?.['ogd-local-forcasting_meta_point.csv']; // note: typo in official data

  if (!metaAsset) {
    throw new Error('Forecast point metadata asset not found in collection');
  }

  const rows = await getRawCsvData(metaAsset.href, 'metadata/forecast-points.csv', 'metadata');
  debugData('[ogd-resolver] Loaded %d forecast point rows', rows.length);

  forecastPointsCache = rows.map((row) => ({
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

  debugData('[ogd-resolver] Parsed %d forecast points', forecastPointsCache.length);
  return forecastPointsCache;
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
  const points = await loadForecastPoints();
  const q = query.trim().toLowerCase();

  // Exact match on postal code
  const postalMatch = points.find((p) => p.point_type_id === 2 && p.postal_code === q);
  if (postalMatch) {
    return { match: postalMatch, alternatives: [], confidence: 'exact' };
  }

  // Exact match on station abbreviation
  const abbrMatch = points.find(
    (p) => p.point_type_id === 1 && p.station_abbr?.toLowerCase() === q
  );
  if (abbrMatch) {
    return { match: abbrMatch, alternatives: [], confidence: 'exact' };
  }

  // Fuzzy match on name (case-insensitive substring)
  const nameMatches = points.filter((p) => p.name.toLowerCase().includes(q));
  if (nameMatches.length > 0) {
    // Prefer postal code type for city names (more granular), then station
    const sorted = nameMatches.sort((a, b) => {
      // Exact name match first
      if (a.name.toLowerCase() === q && b.name.toLowerCase() !== q) return -1;
      if (b.name.toLowerCase() === q && a.name.toLowerCase() !== q) return 1;
      // Postal codes before stations for city names
      if (a.point_type_id === 2 && b.point_type_id !== 2) return -1;
      if (b.point_type_id === 2 && a.point_type_id !== 2) return 1;
      return 0;
    });

    return {
      match: sorted[0]!,
      alternatives: sorted.slice(1, 4),
      confidence: sorted[0]!.name.toLowerCase() === q ? 'exact' : 'fuzzy',
    };
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
  forecastPointsCache = null;
}
