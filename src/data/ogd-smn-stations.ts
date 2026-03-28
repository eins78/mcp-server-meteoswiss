/**
 * Shared station metadata loader for MeteoSwiss SMN (SwissMetNet) stations.
 * Loads and caches station metadata from the OGD STAC API.
 * Supports resolution by name, abbreviation, geocoding fallback, and coordinates.
 */

import { getCollection } from './ogd-stac-client.js';
import { getLatin1CsvData } from './ogd-data-store.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { normalize } from '../support/normalize.js';
import { findNearest } from '../support/haversine.js';
import { geocodeSwissLocation } from '../support/geocode.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS } from '../schemas/ogd-shared.js';

/** Parsed station metadata */
export type SmnStation = {
  abbr: string;
  name: string;
  canton: string;
  elevation: number;
  lat: number;
  lon: number;
  data_since: string;
};

let stationCache: SmnStation[] | null = null;
let stationByAbbr: Map<string, SmnStation> | null = null;

/**
 * Load SMN station metadata from the OGD STAC API.
 * Cached in memory after first load.
 *
 * @returns Array of all SMN stations
 */
export async function loadSmnStations(): Promise<SmnStation[]> {
  if (stationCache) return stationCache;

  debugData('[ogd-smn] Loading station metadata...');
  const collection = await getCollection(OGD_COLLECTIONS.SMN);
  const metaAsset = collection.assets?.['ogd-smn_meta_stations.csv'];
  if (!metaAsset) {
    throw new Error('Station metadata asset not found in SMN collection');
  }

  const rows = await getLatin1CsvData(metaAsset.href, 'metadata/smn-stations.csv', 'metadata');

  stationCache = rows
    .filter((r) => r.station_abbr)
    .map((row) => ({
      abbr: row.station_abbr ?? '',
      name: row.station_name ?? '',
      canton: row.station_canton ?? '',
      elevation: parseNumeric(row.station_height_masl ?? null) ?? 0,
      lat: parseNumeric(row.station_coordinates_wgs84_lat ?? null) ?? 0,
      lon: parseNumeric(row.station_coordinates_wgs84_lon ?? null) ?? 0,
      data_since: row.station_data_since ?? '',
    }));

  stationByAbbr = new Map(stationCache.map((s) => [s.abbr.toLowerCase(), s]));
  debugData('[ogd-smn] Loaded %d stations', stationCache.length);
  return stationCache;
}

/**
 * Find the nearest station to a given WGS84 coordinate.
 *
 * @param lat - WGS84 latitude
 * @param lon - WGS84 longitude
 * @returns Nearest station and distance in km
 */
export async function findNearestStation(
  lat: number,
  lon: number
): Promise<{ station: SmnStation; distance_km: number }> {
  const stations = await loadSmnStations();
  const result = findNearest(
    stations,
    (s) => s.lat,
    (s) => s.lon,
    lat,
    lon
  );

  if (!result) {
    throw new Error('No stations available');
  }

  debugData(
    '[ogd-smn] Nearest station to (%f, %f): %s (%.1f km)',
    lat,
    lon,
    result.item.abbr,
    result.distance_km
  );
  return { station: result.item, distance_km: result.distance_km };
}

/**
 * Resolve a query to an SMN station.
 * Tries: exact abbreviation → fuzzy name → geocoding fallback (nearest to geocoded point).
 *
 * @param query - Station name, abbreviation, address, or place name
 * @returns Matching station
 * @throws Error if no station matches even after geocoding
 */
export async function resolveSmnStation(query: string): Promise<SmnStation> {
  const stations = await loadSmnStations();
  if (!stationByAbbr) {
    throw new Error('Station index not initialized');
  }

  const q = normalize(query.trim());

  // Exact match on abbreviation
  const exact = stationByAbbr.get(q);
  if (exact) return exact;

  // Fuzzy match on name
  const nameMatch = stations.find((s) => normalize(s.name).includes(q));
  if (nameMatch) return nameMatch;

  // Geocoding fallback: resolve query to coordinates, find nearest station
  debugData('[ogd-smn] No direct match for "%s", trying geocoding...', query);
  const geocoded = await geocodeSwissLocation(query);
  if (geocoded) {
    const { station } = await findNearestStation(geocoded.lat, geocoded.lon);
    debugData(
      '[ogd-smn] Geocoded "%s" → %s, nearest station: %s (%s)',
      query,
      geocoded.name,
      station.abbr,
      station.name
    );
    return station;
  }

  const examples = stations
    .slice(0, 5)
    .map((s) => `${s.abbr} (${s.name})`)
    .join(', ');
  throw new Error(`No weather station found for "${query}". Examples: ${examples}`);
}

/**
 * Clear the in-memory station cache. Useful for testing.
 */
export function clearSmnStationCache(): void {
  stationCache = null;
  stationByAbbr = null;
}
