/**
 * Shared station metadata loader for MeteoSwiss SMN (SwissMetNet) stations.
 * Loads and caches station metadata from the OGD STAC API.
 * Supports resolution by name, abbreviation, geocoding fallback, and coordinates.
 */

import { getCollection } from './ogd-stac-client.js';
import { getLatin1CsvData } from './ogd-data-store.js';
import { parseNumeric, type CsvRow } from '../support/ogd-csv-parser.js';
import { normalize } from '../support/normalize.js';
import { scoreNameMatch } from '../support/name-matcher.js';
import { findNearest } from '../support/haversine.js';
import { geocodeSwissLocation, type GeocodeOrigin } from '../support/geocode.js';
import { classifyQuery } from '../support/query-classifier.js';
import { isBlocklisted } from '../support/location-blocklist.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS } from '../schemas/ogd-shared.js';

/** Max distance (km) for geocoding fallback — rejects queries that geocode far from any station */
const MAX_GEOCODE_DISTANCE_KM = 50;

/**
 * Canonical station aliases for city names that would otherwise be ambiguous
 * among multiple same-city stations. "Zurich"/"Zürich" scores an equal
 * fuzzy-match against both "Zürich / Fluntern" (SMA) and "Zürich / Kloten"
 * (KLO); the shorter-name tie-break in resolveSmnStation would otherwise
 * pick Kloten. SMA is the canonical city-center station (matches how
 * meteoswissClimateData resolves "Zurich" — its NBCN station pool only has
 * SMA) — see issue #110, DECISION-5. Keyed on the normalized query; checked
 * before fuzzy scoring so it only fires on an exact alias match, not on
 * queries that merely contain "zurich" (e.g. "Zurich Kloten" still resolves
 * to KLO via scoring).
 */
const STATION_ALIASES: Record<string, string> = {
  zurich: 'SMA',
};

/** Station network type — SMN (full weather) or SMN-precip (precipitation only) */
export type SmnNetwork = 'smn' | 'smn-precip';

/** Parsed station metadata */
export type SmnStation = {
  abbr: string;
  name: string;
  canton: string;
  elevation: number;
  lat: number;
  lon: number;
  data_since: string;
  network: SmnNetwork;
};

let stationCache: SmnStation[] | null = null;
let stationByAbbr: Map<string, SmnStation> | null = null;

/**
 * Parse station metadata rows into SmnStation objects.
 */
function parseStationRows(rows: CsvRow[], network: SmnNetwork): SmnStation[] {
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
 * Load SMN + SMN-precip station metadata from the OGD STAC API.
 * Merges both networks into a single list. Cached in memory after first load.
 *
 * @returns Array of all SMN and SMN-precip stations
 */
export async function loadSmnStations(): Promise<SmnStation[]> {
  if (stationCache) return stationCache;

  debugData('[ogd-smn] Loading station metadata (SMN + SMN-precip)...');

  // Load both collections in parallel
  const [smnCollection, precipCollection] = await Promise.all([
    getCollection(OGD_COLLECTIONS.SMN),
    getCollection(OGD_COLLECTIONS.SMN_PRECIP),
  ]);

  const smnAsset = smnCollection.assets?.['ogd-smn_meta_stations.csv'];
  if (!smnAsset) {
    throw new Error('Station metadata asset not found in SMN collection');
  }

  const precipAsset = precipCollection.assets?.['ogd-smn-precip_meta_stations.csv'];
  if (!precipAsset) {
    throw new Error('Station metadata asset not found in SMN-precip collection');
  }

  // Fetch both metadata CSVs in parallel
  const [smnRows, precipRows] = await Promise.all([
    getLatin1CsvData(smnAsset.href, 'metadata/smn-stations.csv', 'metadata'),
    getLatin1CsvData(precipAsset.href, 'metadata/smn-precip-stations.csv', 'metadata'),
  ]);

  const smnStations = parseStationRows(smnRows, 'smn');
  const precipStations = parseStationRows(precipRows, 'smn-precip');

  stationCache = [...smnStations, ...precipStations];
  stationByAbbr = new Map(stationCache.map((s) => [s.abbr.toLowerCase(), s]));
  debugData(
    '[ogd-smn] Loaded %d stations (%d SMN + %d precip)',
    stationCache.length,
    smnStations.length,
    precipStations.length
  );
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
 * Returns true if the user's query has at least one token (≥3 chars) that
 * appears as a substring in the geocoded place name, or vice versa.
 * Guards against gibberish queries (e.g., "NOTASTATION") that the live
 * swisstopo API fuzzy-matches to an unrelated Swiss coordinate.
 */
function geocodedNameMatchesQuery(query: string, geocodedName: string): boolean {
  const queryNorm = normalize(query.trim());
  const nameNorm = normalize(geocodedName);

  const queryTokens = queryNorm.split(/\s+/).filter((t) => t.length >= 3);
  for (const token of queryTokens) {
    if (nameNorm.includes(token)) return true;
  }

  const nameTokens = nameNorm.split(/\s+/).filter((t) => t.length >= 3);
  for (const token of nameTokens) {
    if (queryNorm.includes(token)) return true;
  }

  return false;
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
  if (q === '') {
    throw new Error(
      'Station query must not be empty. Provide a station name (e.g., "Zurich"), ' +
        'abbreviation (e.g., "SMA"), or address (e.g., "Bahnhofplatz 1 Bern").'
    );
  }

  // Reject well-known international city names before any lookup.
  // Switzerland has hamlets named after major cities (e.g., "Paris" in Vaud near Payerne)
  // which the geocoder would otherwise silently accept.
  if (isBlocklisted(query.trim())) {
    throw new Error(
      `"${query}" is a well-known international city name, not a Swiss weather station. ` +
        `Use a specific Swiss location instead (postal code, canton, or place name). ` +
        `Use meteoswissStations to discover available stations.`
    );
  }

  // Exact match on abbreviation
  const exact = stationByAbbr.get(q);
  if (exact) return exact;

  // Canonical alias — resolves ambiguous city names to one station before
  // fuzzy scoring can pick an unintended same-city station (see
  // STATION_ALIASES doc comment).
  const aliasAbbr = STATION_ALIASES[q];
  if (aliasAbbr) {
    const aliased = stationByAbbr.get(aliasAbbr.toLowerCase());
    if (aliased) return aliased;
  }

  // Scored name match — word-boundary matches beat substring matches
  // This prevents "Bern" matching "Passo del Bernina" over "Bern / Zollikofen"
  let bestStation: SmnStation | undefined;
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

  // Geocoding fallback: resolve query to coordinates, find nearest station.
  // Use origins='place' for plain names/postal codes so "Paris" can't match
  // a Swiss street label; widen to 'all' only for address-shaped queries.
  const kind = classifyQuery(query.trim());
  const origins: GeocodeOrigin = kind === 'address' ? 'all' : 'place';
  debugData('[ogd-smn] No direct match for "%s", geocoding (origins=%s)...', query, origins);
  const geocoded = await geocodeSwissLocation(query, { origins });
  if (geocoded) {
    // Reject geocoding hits where the query bears no textual resemblance to the
    // geocoded place name. Prevents gibberish queries ("NOTASTATION") from
    // resolving to whatever the swisstopo API happens to return.
    if (!geocodedNameMatchesQuery(query, geocoded.name)) {
      debugData(
        '[ogd-smn] Geocoded name "%s" does not match query "%s" — rejected',
        geocoded.name,
        query
      );
    } else {
      const { station, distance_km } = await findNearestStation(geocoded.lat, geocoded.lon);
      if (distance_km > MAX_GEOCODE_DISTANCE_KM) {
        debugData(
          '[ogd-smn] Geocoded "%s" too far from nearest station: %.1f km (limit: %d km)',
          query,
          distance_km,
          MAX_GEOCODE_DISTANCE_KM
        );
      } else {
        debugData(
          '[ogd-smn] Geocoded "%s" → %s, nearest station: %s (%s, %.1f km)',
          query,
          geocoded.name,
          station.abbr,
          station.name,
          distance_km
        );
        return station;
      }
    }
  }

  const examples = stations
    .filter((s) => s.network === 'smn')
    .slice(0, 5)
    .map((s) => `${s.abbr} (${s.name})`)
    .join(', ');
  throw new Error(
    `No weather station found for "${query}". ` +
      `Is this a Swiss location? Examples: ${examples}. ` +
      `Use meteoswissStations to search by name, canton, or coordinates.`
  );
}

/**
 * Clear the in-memory station cache. Useful for testing.
 */
export function clearSmnStationCache(): void {
  stationCache = null;
  stationByAbbr = null;
}
