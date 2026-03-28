/**
 * Data layer for the getCurrentWeather tool.
 * Fetches real-time measurements from the consolidated VQHA80.csv.
 */

import { getCsvData } from './ogd-data-store.js';
import { resolveSmnStation } from './ogd-smn-stations.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';
import { SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  GetCurrentWeatherParams,
  CurrentWeatherResponse,
  MeasurementValue,
} from '../schemas/ogd-current-weather.js';
import type { CsvRow } from '../support/ogd-csv-parser.js';

const REALTIME_CSV_URL = 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv';

/**
 * Create a measurement value if the raw data is present.
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
  const station = await resolveSmnStation(params.station);
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
