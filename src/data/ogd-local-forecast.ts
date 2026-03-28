/**
 * Data layer for the getLocalForecast tool.
 * Fetches forecast CSVs from MeteoSwiss OGD, filters by location, and aggregates into daily summaries.
 *
 * Daily parameters (tre200dx, tre200dn, jp2000d0) only contain station data (point_type=1).
 * Postal codes and mountain points use hourly parameters (tre200h0) which we aggregate to daily.
 */

import { getLatestItem, resolveAssetUrl } from './ogd-stac-client.js';
import { getCsvData } from './ogd-data-store.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { resolveForecastPoint } from './ogd-station-resolver.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS, pointTypeFromId, SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  GetLocalForecastParams,
  LocalForecastResponse,
  DailyForecast,
} from '../schemas/ogd-local-forecast.js';
import type { StacItem } from '../schemas/ogd-shared.js';

/** Daily params — only available for stations (point_type_id=1) */
const DAILY_PARAMS = ['tre200dx', 'tre200dn', 'rka150d0', 'jp2000d0'] as const;

/** Hourly params — available for all point types */
const HOURLY_PARAMS = ['tre200h0'] as const;

/**
 * Find the latest asset key for a parameter (picks the most recent forecast run).
 */
function findLatestAssetKey(item: StacItem, param: string): string | null {
  const suffix = `.${param}.csv`;
  const keys = Object.keys(item.assets)
    .filter((k) => k.endsWith(suffix))
    .sort();
  return keys.length > 0 ? keys[keys.length - 1]! : null;
}

/**
 * Convert a MeteoSwiss timestamp (YYYYMMDDhhmm) to a date string (YYYY-MM-DD).
 */
function timestampToDate(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/**
 * Build a daily forecast from station data (has daily min/max directly).
 */
function buildStationForecast(
  paramData: Map<string, Map<string, number | null>>,
  days: number
): DailyForecast[] {
  const tempMaxData = paramData.get('tre200dx') ?? new Map<string, number | null>();
  const dates = [...new Set([...tempMaxData.keys()].map(timestampToDate))].sort().slice(0, days);

  const dateKeyed = new Map(
    [...paramData.entries()].map(([param, tsMap]) => [
      param,
      new Map([...tsMap.entries()].map(([ts, val]) => [timestampToDate(ts), val])),
    ])
  );

  return dates.map((date) => ({
    date,
    temperature: {
      min: dateKeyed.get('tre200dn')?.get(date) ?? null,
      max: dateKeyed.get('tre200dx')?.get(date) ?? null,
      unit: '\u00B0C',
    },
    precipitation: {
      total: dateKeyed.get('rka150d0')?.get(date) ?? null,
      unit: 'mm',
    },
    weather_icon: dateKeyed.get('jp2000d0')?.get(date) ?? null,
  }));
}

/**
 * Build a daily forecast from hourly data (aggregate to daily min/max).
 */
function buildHourlyAggregatedForecast(
  hourlyTemp: Map<string, number | null>,
  days: number
): DailyForecast[] {
  // Group hourly values by date
  const byDate = new Map<string, number[]>();
  for (const [ts, val] of hourlyTemp.entries()) {
    if (val === null) continue;
    const date = timestampToDate(ts);
    const existing = byDate.get(date) ?? [];
    existing.push(val);
    byDate.set(date, existing);
  }

  const dates = [...byDate.keys()].sort().slice(0, days);
  return dates.map((date) => {
    const temps = byDate.get(date) ?? [];
    return {
      date,
      temperature: {
        min: temps.length > 0 ? Math.min(...temps) : null,
        max: temps.length > 0 ? Math.max(...temps) : null,
        unit: '\u00B0C',
      },
      precipitation: { total: null, unit: 'mm' },
      weather_icon: null,
    };
  });
}

/**
 * Fetch and assemble the local forecast for a given location.
 */
export async function getLocalForecast(
  params: GetLocalForecastParams
): Promise<LocalForecastResponse> {
  const { location, days } = params;

  // Resolve location and get latest STAC item concurrently
  debugData('[ogd-forecast] Resolving location: %s', location);
  const [resolved, item] = await Promise.all([
    resolveForecastPoint(location),
    getLatestItem(OGD_COLLECTIONS.LOCAL_FORECASTING),
  ]);

  const point = resolved.match;
  const isStation = point.point_type_id === 1;
  debugData(
    '[ogd-forecast] Resolved to: %s (point_id=%d, type=%d/%s, confidence=%s)',
    point.name,
    point.point_id,
    point.point_type_id,
    isStation ? 'station' : 'non-station',
    resolved.confidence
  );

  const generated = String(item.properties.datetime ?? item.properties.updated ?? item.id);
  const pointIdStr = String(point.point_id);
  const pointTypeStr = String(point.point_type_id);

  const rowFilter = (row: Record<string, string | null>): boolean =>
    row.point_id === pointIdStr && row.point_type_id === pointTypeStr;

  // Choose params based on point type
  const paramsToFetch = isStation ? DAILY_PARAMS : HOURLY_PARAMS;

  // Download all parameter CSVs concurrently
  const paramEntries = await Promise.all(
    paramsToFetch.map(async (param) => {
      const assetKey = findLatestAssetKey(item, param);
      if (!assetKey) {
        debugData('[ogd-forecast] No asset found for param: %s', param);
        return [param, new Map<string, number | null>()] as const;
      }

      const url = resolveAssetUrl(item, assetKey);
      const cacheKey = `forecasts/${item.id}/${assetKey}`;
      debugData('[ogd-forecast] Downloading %s...', param);
      const rows = await getCsvData(url, cacheKey, 'forecast', rowFilter);

      const dateValues = new Map<string, number | null>();
      for (const row of rows) {
        const date = row.Date ?? '';
        dateValues.set(date, parseNumeric(row[param] ?? null));
      }
      debugData('[ogd-forecast] Got %d values for %s', dateValues.size, param);
      return [param, dateValues] as const;
    })
  );

  const paramData = new Map(paramEntries);

  // Build daily forecast from the appropriate data source
  const forecast = isStation
    ? buildStationForecast(paramData, days)
    : buildHourlyAggregatedForecast(paramData.get('tre200h0') ?? new Map(), days);

  return {
    location: {
      name: point.name,
      type: pointTypeFromId(point.point_type_id),
      elevation: point.elevation,
      coordinates: point.coordinates,
    },
    generated,
    forecast,
    source: SOURCE_ATTRIBUTION,
  };
}
