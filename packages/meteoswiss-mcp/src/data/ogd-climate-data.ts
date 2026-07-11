/**
 * Data layer for the meteoswissClimateData tool.
 * Fetches homogeneous climate measurement series from NBCN stations.
 */

import { getLatin1CsvData } from './ogd-data-store.js';
import { resolveNbcnStation, findNearestNbcnStation } from './ogd-nbcn-stations.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';
import { SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type { CsvRow } from '../support/ogd-csv-parser.js';
import type { NbcnStation } from './ogd-nbcn-stations.js';
import type {
  GetClimateDataParams,
  ClimateDataResponse,
  ClimateMeasurement,
  ClimateResolution,
} from '../schemas/ogd-climate-data.js';

/**
 * Map resolution names to URL suffixes.
 * Monthly and yearly files contain all history (no _recent suffix).
 * Daily has _recent (last ~2 years) and _historical variants.
 */
const RESOLUTION_SUFFIX: Record<ClimateResolution, string> = {
  daily: 'd_recent',
  monthly: 'm',
  yearly: 'y',
};

/**
 * Build the download URL for a station's climate data.
 */
function buildDataUrl(station: NbcnStation, resolution: ClimateResolution): string {
  const collection = station.network === 'nbcn-precip' ? 'ogd-nbcn-precip' : 'ogd-nbcn';
  const abbrLower = station.abbr.toLowerCase();
  const suffix = RESOLUTION_SUFFIX[resolution];
  return `https://data.geo.admin.ch/ch.meteoschweiz.${collection}/${abbrLower}/${collection}_${abbrLower}_${suffix}.csv`;
}

/**
 * Parse a MeteoSwiss timestamp (DD.MM.YYYY HH:MM) into an ISO-ish YYYY-MM-DD string.
 */
function parseTimestamp(ts: string): string {
  const match = ts.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return ts;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Map CSV columns to structured measurements.
 * Daily, monthly, and yearly CSVs have different column sets.
 */
function mapMeasurement(row: CsvRow): ClimateMeasurement {
  return {
    date: parseTimestamp(row.reference_timestamp ?? ''),
    // Temperature (available at all resolutions)
    temperature_mean:
      parseNumeric(row.ths200d0 ?? row.ths200m0 ?? row.ths200y0 ?? null) ?? undefined,
    temperature_max:
      parseNumeric(row.ths200dx ?? row.ths2dymx ?? row.ths2dyyx ?? null) ?? undefined,
    temperature_min:
      parseNumeric(row.ths200dn ?? row.ths2dymn ?? row.ths2dyyn ?? null) ?? undefined,
    // Precipitation (monthly/yearly)
    precipitation: parseNumeric(row.rhs150m0 ?? row.rhs150y0 ?? null) ?? undefined,
    // Sunshine (monthly/yearly)
    sunshine_duration_min: parseNumeric(row.shs000m0 ?? row.shs000y0 ?? null) ?? undefined,
    // Radiation (monthly/yearly)
    radiation_w_m2: parseNumeric(row.ghs000m0 ?? row.ghs000y0 ?? null) ?? undefined,
    // Wind (monthly/yearly)
    wind_speed_m_s: parseNumeric(row.fhs010m0 ?? row.fhs010y0 ?? null) ?? undefined,
    // Pressure (monthly/yearly)
    pressure_hpa: parseNumeric(row.phsstam0 ?? row.phsstay0 ?? null) ?? undefined,
    // Day counts (monthly/yearly)
    frost_days: parseNumeric(row.ths00nm0 ?? row.ths00ny0 ?? null) ?? undefined,
    summer_days: parseNumeric(row.ths25xm0 ?? row.ths25xy0 ?? null) ?? undefined,
    heat_days: parseNumeric(row.ths30xm0 ?? row.ths30xy0 ?? null) ?? undefined,
    ice_days: parseNumeric(row.ths00xm0 ?? row.ths00xy0 ?? null) ?? undefined,
    tropical_nights: parseNumeric(row.ths20nm0 ?? row.ths20ny0 ?? null) ?? undefined,
    rain_days: parseNumeric(row.rhs001m0 ?? row.rhs001y0 ?? null) ?? undefined,
  };
}

/**
 * Strip undefined values from a measurement to keep the response clean.
 */
function stripUndefined(m: ClimateMeasurement): ClimateMeasurement {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(m)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as ClimateMeasurement;
}

/**
 * Fetch climate data from MeteoSwiss NBCN stations.
 */
export async function getClimateData(params: GetClimateDataParams): Promise<ClimateDataResponse> {
  let station: NbcnStation;
  let distance_km: number | undefined;

  if (params.coordinates) {
    const result = await findNearestNbcnStation(params.coordinates.lat, params.coordinates.lon);
    station = result.station;
    distance_km = result.distance_km;
    debugData('[ogd-nbcn] Nearest station to coordinates: %s (%.1f km)', station.abbr, distance_km);
  } else if (params.station) {
    station = await resolveNbcnStation(params.station);
    debugData('[ogd-nbcn] Resolved station: %s (%s)', station.abbr, station.name);
  } else {
    throw new Error('Either "station" or "coordinates" must be provided');
  }

  const resolution = params.resolution ?? 'monthly';
  const url = buildDataUrl(station, resolution);
  const abbrLower = station.abbr.toLowerCase();
  const cacheKey = `climate/${station.network}-${abbrLower}-${RESOLUTION_SUFFIX[resolution]}.csv`;

  const rows = await getLatin1CsvData(url, cacheKey, 'climate');
  debugData('[ogd-nbcn] Fetched %d rows for %s (%s)', rows.length, station.abbr, resolution);

  // Apply date filtering
  let filtered = rows;
  if (params.start_date) {
    const start = params.start_date;
    filtered = filtered.filter((row) => {
      const date = parseTimestamp(row.reference_timestamp ?? '');
      return date >= start;
    });
  }
  if (params.end_date) {
    const end = params.end_date;
    filtered = filtered.filter((row) => {
      const date = parseTimestamp(row.reference_timestamp ?? '');
      return date <= end;
    });
  }

  // Take the most recent rows (from the end), limited by params.limit
  const limit = params.limit ?? 30;
  const sliced = filtered.slice(-limit);

  const data = sliced.map((row) => stripUndefined(mapMeasurement(row)));

  // If a date filter zeroed out the results, tell the caller why instead of
  // returning a bare empty array (issue #110, BUG-5). The most common cause
  // is a daily request predating the `_recent` (~2-year) window; derive the
  // actually-available range from the unfiltered rows so the hint is honest
  // even when the series is empty for other reasons.
  let note: string | undefined;
  if (data.length === 0 && (params.start_date || params.end_date) && rows.length > 0) {
    const firstRow = rows[0];
    const lastRow = rows[rows.length - 1];
    const availableFrom = parseTimestamp(firstRow?.reference_timestamp ?? '');
    const availableTo = parseTimestamp(lastRow?.reference_timestamp ?? '');
    note =
      `No ${resolution} data for the requested date range. ` +
      `This series covers ${availableFrom} to ${availableTo}.` +
      (resolution === 'daily'
        ? ' Daily data only covers roughly the last 2 years; use resolution="monthly" or "yearly" for older dates.'
        : '');
  }

  return {
    station: {
      name: station.name,
      abbreviation: station.abbr,
      elevation: station.elevation,
      coordinates: { lat: station.lat, lon: station.lon },
      canton: station.canton,
      distance_km,
      network: station.network,
    },
    resolution,
    data,
    ...(note ? { note } : {}),
    source: SOURCE_ATTRIBUTION,
  };
}
