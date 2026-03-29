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
import { weatherIconDescription } from '../support/weather-icons.js';
import type {
  GetLocalForecastParams,
  LocalForecastResponse,
  DailyForecast,
} from '../schemas/ogd-local-forecast.js';
import type { StacItem } from '../schemas/ogd-shared.js';

/** Daily params — only available for stations (point_type_id=1) */
const DAILY_PARAMS = ['tre200dx', 'tre200dn', 'rka150d0', 'jp2000d0'] as const;

/** Hourly params — available for all point types */
const HOURLY_PARAMS = ['tre200h0', 'rre150h0', 'jww003i0'] as const;

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

  return dates.map((date) => {
    const iconCode = dateKeyed.get('jp2000d0')?.get(date) ?? null;
    return {
      date,
      weather: iconCode !== null ? weatherIconDescription(iconCode) : null,
      temperature: {
        min: dateKeyed.get('tre200dn')?.get(date) ?? null,
        max: dateKeyed.get('tre200dx')?.get(date) ?? null,
        unit: '\u00B0C',
      },
      precipitation: {
        total: dateKeyed.get('rka150d0')?.get(date) ?? null,
        unit: 'mm',
      },
    };
  });
}

/**
 * Group hourly values by date.
 */
function groupByDate(hourlyMap: Map<string, number | null>): Map<string, number[]> {
  const byDate = new Map<string, number[]>();
  for (const [ts, val] of hourlyMap.entries()) {
    if (val === null) continue;
    const date = timestampToDate(ts);
    const existing = byDate.get(date) ?? [];
    existing.push(val);
    byDate.set(date, existing);
  }
  return byDate;
}

/**
 * Pick the most representative weather icon for a day.
 * Prefers midday hours (09-15 local, ~07-13 UTC) for daytime representation.
 * Falls back to the most frequent icon code if no midday data.
 */
function pickDaytimeIcon(entries: Map<string, number | null>, date: string): number | null {
  const dayEntries: Array<{ hour: number; code: number }> = [];
  for (const [ts, val] of entries.entries()) {
    if (val === null) continue;
    if (timestampToDate(ts) !== date) continue;
    const hour = Number(ts.slice(8, 10));
    dayEntries.push({ hour, code: val });
  }
  if (dayEntries.length === 0) return null;

  // Prefer midday hours (07-13 UTC ≈ 09-15 CET)
  const midday = dayEntries.filter((e) => e.hour >= 7 && e.hour <= 13);
  if (midday.length > 0) {
    // Pick the icon closest to noon UTC (11)
    midday.sort((a, b) => Math.abs(a.hour - 11) - Math.abs(b.hour - 11));
    return midday[0]!.code;
  }

  // Fallback: most frequent icon
  const counts = new Map<number, number>();
  for (const e of dayEntries) {
    counts.set(e.code, (counts.get(e.code) ?? 0) + 1);
  }
  let best = dayEntries[0]!.code;
  let bestCount = 0;
  for (const [code, count] of counts.entries()) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Build a daily forecast from hourly data (aggregate to daily min/max, sum precip, pick icon).
 */
function buildHourlyAggregatedForecast(
  paramData: Map<string, Map<string, number | null>>,
  days: number
): DailyForecast[] {
  const hourlyTemp = paramData.get('tre200h0') ?? new Map<string, number | null>();
  const hourlyPrecip = paramData.get('rre150h0') ?? new Map<string, number | null>();
  const hourlyIcon = paramData.get('jww003i0') ?? new Map<string, number | null>();

  const tempByDate = groupByDate(hourlyTemp);
  const precipByDate = groupByDate(hourlyPrecip);

  const dates = [...tempByDate.keys()].sort().slice(0, days);
  return dates.map((date) => {
    const temps = tempByDate.get(date) ?? [];
    const precips = precipByDate.get(date) ?? [];
    const precipTotal =
      precips.length > 0 ? Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10 : null;
    const iconCode = pickDaytimeIcon(hourlyIcon, date);

    return {
      date,
      temperature: {
        min: temps.length > 0 ? Math.min(...temps) : null,
        max: temps.length > 0 ? Math.max(...temps) : null,
        unit: '\u00B0C',
      },
      precipitation: { total: precipTotal, unit: 'mm' },
      weather: iconCode !== null ? weatherIconDescription(iconCode) : null,
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
    : buildHourlyAggregatedForecast(paramData, days);

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
