/**
 * Data layer for the getCurrentWeather tool.
 * Fetches real-time measurements from the consolidated VQHA80.csv.
 */

import { getCsvData } from './ogd-data-store.js';
import { getLatin1CsvData } from './ogd-data-store.js';
import { getCollection } from './ogd-stac-client.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS, SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  GetCurrentWeatherParams,
  CurrentWeatherResponse,
  MeasurementValue,
} from '../schemas/ogd-current-weather.js';
import type { CsvRow } from '../support/ogd-csv-parser.js';

const REALTIME_CSV_URL = 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv';

/** Station metadata cache */
type StationMeta = {
  abbr: string;
  name: string;
  canton: string;
  elevation: number;
  lat: number;
  lon: number;
};

let stationMetaCache: Map<string, StationMeta> | null = null;

/**
 * Normalize a string for fuzzy matching: lowercase, strip diacritics.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Load station metadata from the SMN collection.
 */
async function loadStationMeta(): Promise<Map<string, StationMeta>> {
  if (stationMetaCache) return stationMetaCache;

  debugData('[ogd-weather] Loading station metadata...');
  const collection = await getCollection(OGD_COLLECTIONS.SMN);
  const metaAsset = collection.assets?.['ogd-smn_meta_stations.csv'];
  if (!metaAsset) {
    throw new Error('Station metadata asset not found');
  }

  const rows = await getLatin1CsvData(metaAsset.href, 'metadata/smn-stations.csv', 'metadata');
  stationMetaCache = new Map<string, StationMeta>();

  for (const row of rows) {
    const abbr = row.station_abbr ?? '';
    if (!abbr) continue;
    stationMetaCache.set(abbr.toLowerCase(), {
      abbr,
      name: row.station_name ?? abbr,
      canton: row.station_canton ?? '',
      elevation: parseNumeric(row.station_height_masl ?? null) ?? 0,
      lat: parseNumeric(row.station_coordinates_wgs84_lat ?? null) ?? 0,
      lon: parseNumeric(row.station_coordinates_wgs84_lon ?? null) ?? 0,
    });
  }

  debugData('[ogd-weather] Loaded %d station metadata entries', stationMetaCache.size);
  return stationMetaCache;
}

/**
 * Resolve a station query to an abbreviation.
 */
async function resolveStation(query: string): Promise<StationMeta> {
  const meta = await loadStationMeta();
  const q = normalize(query.trim());

  // Exact match on abbreviation
  const exact = meta.get(q);
  if (exact) return exact;

  // Fuzzy match on name
  for (const station of meta.values()) {
    if (normalize(station.name).includes(q)) {
      return station;
    }
  }

  const suggestions = [...meta.values()]
    .slice(0, 5)
    .map((s) => `${s.abbr} (${s.name})`)
    .join(', ');
  throw new Error(
    `No weather station found for "${query}". Try a station abbreviation or name. Examples: ${suggestions}`
  );
}

/**
 * Helper to create a measurement value if the raw data is present.
 */
function measurement(row: CsvRow, key: string, unit: string): MeasurementValue | undefined {
  const val = parseNumeric(row[key] ?? null);
  if (val === null) return undefined;
  return { value: val, unit };
}

/**
 * Fetch current weather measurements for a station.
 *
 * @param params - Tool parameters with station query
 * @returns Structured current weather response
 */
export async function getCurrentWeather(
  params: GetCurrentWeatherParams
): Promise<CurrentWeatherResponse> {
  const station = await resolveStation(params.station);
  debugData('[ogd-weather] Resolved station: %s (%s)', station.abbr, station.name);

  const filter = (row: CsvRow): boolean => row['Station/Location'] === station.abbr;

  const rows = await getCsvData(REALTIME_CSV_URL, 'measurements/VQHA80.csv', 'realtime', filter);

  if (rows.length === 0) {
    throw new Error(`No current data available for station ${station.abbr} (${station.name})`);
  }

  const row = rows[0];
  if (!row) {
    throw new Error(`No data row for station ${station.abbr}`);
  }

  return {
    station: {
      name: station.name,
      abbreviation: station.abbr,
      elevation: station.elevation,
      coordinates: { lat: station.lat, lon: station.lon },
    },
    timestamp: row.Date ?? '',
    measurements: {
      temperature: measurement(row, 'tre200s0', '\u00B0C'),
      humidity: measurement(row, 'ure200s0', '%'),
      dew_point: measurement(row, 'tde200s0', '\u00B0C'),
      precipitation: measurement(row, 'rre150z0', 'mm'),
      wind_speed: measurement(row, 'fu3010z0', 'km/h'),
      wind_gust: measurement(row, 'fu3010z1', 'km/h'),
      wind_direction: measurement(row, 'dkl010z0', '\u00B0'),
      sunshine: measurement(row, 'sre000z0', 'min'),
      radiation: measurement(row, 'gre000z0', 'W/m\u00B2'),
      pressure_station: measurement(row, 'prestas0', 'hPa'),
      pressure_sea_level: measurement(row, 'pp0qffs0', 'hPa'),
      snow_depth: measurement(row, 'htoauts0', 'cm'),
    },
    source: SOURCE_ATTRIBUTION,
  };
}
