/**
 * Station metadata loader for MeteoSwiss NBCN (National Basic Climatic Network) stations.
 * Loads and caches station metadata from the OGD STAC API.
 * Merges NBCN (29 climate stations) and NBCN-precip (46 precipitation stations).
 */

import { getCollection } from './ogd-stac-client.js';
import { getLatin1CsvData } from './ogd-data-store.js';
import { parseNumeric, type CsvRow } from '../support/ogd-csv-parser.js';
import { normalize } from '../support/normalize.js';
import { scoreNameMatch } from '../support/name-matcher.js';
import { findNearest } from '../support/haversine.js';
import { geocodeSwissLocation, type GeocodeOrigin } from '../support/geocode.js';
import { classifyQuery } from '../support/query-classifier.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS } from '../schemas/ogd-shared.js';

/** Max distance (km) for geocoding fallback — NBCN is sparser than SMN */
const MAX_GEOCODE_DISTANCE_KM = 80;

/** NBCN network type */
export type NbcnNetwork = 'nbcn' | 'nbcn-precip';

/** Parsed NBCN station metadata */
export type NbcnStation = {
  abbr: string;
  name: string;
  canton: string;
  elevation: number;
  lat: number;
  lon: number;
  data_since: string;
  network: NbcnNetwork;
};

let stationCache: NbcnStation[] | null = null;
let stationByAbbr: Map<string, NbcnStation> | null = null;

/**
 * Parse station metadata rows into NbcnStation objects.
 */
function parseStationRows(rows: CsvRow[], network: NbcnNetwork): NbcnStation[] {
  return rows
    .filter((r) => r.station_abbr)
    .map((row) => ({
      abbr: row.station_abbr ?? '',
      name: row.station_name ?? '',
      canton: row.station_canton ?? '',
      elevation: parseNumeric(row.station_height_masl ?? null) ?? 0,
      lat: parseNumeric(row.station_coordinates_wgs84_lat ?? null) ?? 0,
      lon: parseNumeric(row.station_coordinates_wgs84_lon ?? null) ?? 0,
      data_since: row.station_data_since ?? '',
      network,
    }));
}

/**
 * Load NBCN + NBCN-precip station metadata from the OGD STAC API.
 * Cached in memory after first load.
 *
 * @returns Array of all NBCN and NBCN-precip stations
 */
export async function loadNbcnStations(): Promise<NbcnStation[]> {
  if (stationCache) return stationCache;

  debugData('[ogd-nbcn] Loading station metadata (NBCN + NBCN-precip)...');

  const [nbcnCollection, precipCollection] = await Promise.all([
    getCollection(OGD_COLLECTIONS.NBCN),
    getCollection(OGD_COLLECTIONS.NBCN_PRECIP),
  ]);

  const nbcnAsset = nbcnCollection.assets?.['ogd-nbcn_meta_stations.csv'];
  if (!nbcnAsset) {
    throw new Error('Station metadata asset not found in NBCN collection');
  }

  const precipAsset = precipCollection.assets?.['ogd-nbcn-precip_meta_stations.csv'];
  if (!precipAsset) {
    throw new Error('Station metadata asset not found in NBCN-precip collection');
  }

  const [nbcnRows, precipRows] = await Promise.all([
    getLatin1CsvData(nbcnAsset.href, 'metadata/nbcn-stations.csv', 'metadata'),
    getLatin1CsvData(precipAsset.href, 'metadata/nbcn-precip-stations.csv', 'metadata'),
  ]);

  const nbcnStations = parseStationRows(nbcnRows, 'nbcn');
  const precipStations = parseStationRows(precipRows, 'nbcn-precip');

  stationCache = [...nbcnStations, ...precipStations];
  stationByAbbr = new Map(stationCache.map((s) => [s.abbr.toLowerCase(), s]));
  debugData(
    '[ogd-nbcn] Loaded %d stations (%d NBCN + %d precip)',
    stationCache.length,
    nbcnStations.length,
    precipStations.length
  );
  return stationCache;
}

/**
 * Find the nearest NBCN station to a given WGS84 coordinate.
 */
export async function findNearestNbcnStation(
  lat: number,
  lon: number
): Promise<{ station: NbcnStation; distance_km: number }> {
  const stations = await loadNbcnStations();
  const result = findNearest(
    stations,
    (s) => s.lat,
    (s) => s.lon,
    lat,
    lon
  );
  if (!result) {
    throw new Error('No NBCN stations available');
  }
  return { station: result.item, distance_km: result.distance_km };
}

/**
 * Resolve a query to an NBCN station.
 * Tries: exact abbreviation → fuzzy name → geocoding fallback.
 */
export async function resolveNbcnStation(query: string): Promise<NbcnStation> {
  const stations = await loadNbcnStations();
  if (!stationByAbbr) {
    throw new Error('NBCN station index not initialized');
  }

  const q = normalize(query.trim());
  if (q === '') {
    throw new Error(
      'Station query must not be empty. Provide a station name (e.g., "Zurich"), ' +
        'abbreviation (e.g., "SMA"), or address (e.g., "Bahnhofplatz 1 Bern").'
    );
  }

  const exact = stationByAbbr.get(q);
  if (exact) return exact;

  // Scored name match — word-boundary matches beat substring matches
  let bestStation: NbcnStation | undefined;
  let bestScore = 0;
  for (const s of stations) {
    const score = scoreNameMatch(q, normalize(s.name));
    if (
      score > bestScore ||
      (score === bestScore && bestStation && s.name.length < bestStation.name.length)
    ) {
      bestScore = score;
      bestStation = s;
    }
  }
  if (bestStation) return bestStation;

  // Geocoding fallback with origins restricted by query shape
  // (see ogd-smn-stations.ts for the rationale).
  const kind = classifyQuery(query.trim());
  const origins: GeocodeOrigin = kind === 'address' ? 'all' : 'place';
  debugData('[ogd-nbcn] No direct match for "%s", geocoding (origins=%s)...', query, origins);
  const geocoded = await geocodeSwissLocation(query, { origins });
  if (geocoded) {
    const { station, distance_km } = await findNearestNbcnStation(geocoded.lat, geocoded.lon);
    if (distance_km > MAX_GEOCODE_DISTANCE_KM) {
      debugData(
        '[ogd-nbcn] Geocoded "%s" too far from nearest station: %.1f km (limit: %d km)',
        query,
        distance_km,
        MAX_GEOCODE_DISTANCE_KM
      );
    } else {
      debugData(
        '[ogd-nbcn] Geocoded "%s" → %s, nearest station: %s (%s, %.1f km)',
        query,
        geocoded.name,
        station.abbr,
        station.name,
        distance_km
      );
      return station;
    }
  }

  const examples = stations
    .filter((s) => s.network === 'nbcn')
    .slice(0, 5)
    .map((s) => `${s.abbr} (${s.name})`)
    .join(', ');
  throw new Error(
    `No climate station found for "${query}". ` +
      `Is this a Swiss location? Examples: ${examples}. ` +
      `Use meteoswissStations to browse the ~75 long-term climate stations.`
  );
}

/**
 * Clear the in-memory station cache. Useful for testing.
 */
export function clearNbcnStationCache(): void {
  stationCache = null;
  stationByAbbr = null;
}
