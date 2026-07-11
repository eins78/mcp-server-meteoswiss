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
import { roundByUnit, roundNullable } from '../support/round-measurements.js';
import { resolveForecastPoint } from './ogd-station-resolver.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS, pointTypeFromId, SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import { weatherIconDescription, weatherIconUrl } from '../support/weather-icons.js';
import type {
  GetLocalForecastParams,
  LocalForecastResponse,
  DailyForecast,
  HourlyPrecip,
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
 * Formatter that renders a UTC instant as local Europe/Zurich wall-clock time
 * plus its UTC offset (DST-aware). Reused across calls since constructing an
 * `Intl.DateTimeFormat` repeatedly is comparatively expensive.
 */
const zurichFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Zurich',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

/**
 * Render a UTC timestamp's local Europe/Zurich date and wall-clock time, DST-correct.
 */
function zurichParts(ts: string): { date: string; time: string; offset: string } {
  const utcMs = Date.UTC(
    Number(ts.slice(0, 4)),
    Number(ts.slice(4, 6)) - 1,
    Number(ts.slice(6, 8)),
    Number(ts.slice(8, 10)),
    Number(ts.slice(10, 12))
  );
  const parts = zurichFormatter.formatToParts(new Date(utcMs));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
    offset: get('timeZoneName').replace('GMT', ''),
  };
}

/**
 * Convert a MeteoSwiss UTC timestamp (YYYYMMDDhhmm) to its local Europe/Zurich
 * calendar date (YYYY-MM-DD), DST-correct. Used to bucket hourly readings into
 * days that match the local wall-clock times we surface, so a day's `hourly`
 * entries never spill across the local midnight boundary into a neighboring day.
 */
function utcTimestampToZurichDate(ts: string): string {
  return zurichParts(ts).date;
}

/**
 * Get today's date in YYYY-MM-DD format (UTC).
 * In test fixture mode, uses the earliest date from the data to avoid
 * filtering out all fixture dates.
 */
function todayUtc(): string {
  if (process.env.USE_TEST_FIXTURES === 'true') {
    // Don't filter dates in test mode — fixture dates are static
    return '1900-01-01';
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build a daily forecast from station data (has daily min/max directly).
 */
function buildStationForecast(
  paramData: Map<string, Map<string, number | null>>,
  days: number
): DailyForecast[] {
  const tempMaxData = paramData.get('tre200dx') ?? new Map<string, number | null>();
  const today = todayUtc();
  const dates = [...new Set([...tempMaxData.keys()].map(timestampToDate))]
    .sort()
    .filter((d) => d >= today)
    .slice(0, days);

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
      weather_icon_url: iconCode !== null ? weatherIconUrl(iconCode) : null,
      temperature: {
        min: roundNullable(dateKeyed.get('tre200dn')?.get(date) ?? null, '°C'),
        max: roundNullable(dateKeyed.get('tre200dx')?.get(date) ?? null, '°C'),
        unit: '\u00B0C',
      },
      precipitation: {
        total: roundNullable(dateKeyed.get('rka150d0')?.get(date) ?? null, 'mm'),
        unit: 'mm',
        // Stations use daily params (rka150d0) — hourly precip isn't fetched for them yet.
        hourly: null,
      },
    };
  });
}

/**
 * Group hourly values by local Europe/Zurich date. Non-station forecasts are
 * bucketed by local day (not the raw UTC date) so that a day's data matches the
 * local-time labels we surface elsewhere (see `utcTimestampToZurichDate`).
 */
function groupByDate(hourlyMap: Map<string, number | null>): Map<string, number[]> {
  const byDate = new Map<string, number[]>();
  for (const [ts, val] of hourlyMap.entries()) {
    if (val === null) continue;
    const date = utcTimestampToZurichDate(ts);
    const existing = byDate.get(date) ?? [];
    existing.push(val);
    byDate.set(date, existing);
  }
  return byDate;
}

/**
 * Group hourly precipitation values by local Europe/Zurich date — the same day
 * boundary used for `groupByDate` — so every entry's `time` falls within the day
 * it's nested under. Within each day, entries are sorted chronologically and
 * null/missing readings are skipped (zero-mm hours are kept).
 */
function groupPrecipByDate(hourlyMap: Map<string, number | null>): Map<string, HourlyPrecip[]> {
  const byDate = new Map<string, HourlyPrecip[]>();
  const sortedTimestamps = [...hourlyMap.keys()].sort();
  for (const ts of sortedTimestamps) {
    const val = hourlyMap.get(ts) ?? null;
    if (val === null) continue;
    const { date, time, offset } = zurichParts(ts);
    const existing = byDate.get(date) ?? [];
    existing.push({ time: `${date}T${time}${offset}`, value: roundByUnit(val, 'mm') });
    byDate.set(date, existing);
  }
  return byDate;
}

/**
 * Pick the most representative weather icon for a day.
 * `date` is a local Europe/Zurich calendar date (see `utcTimestampToZurichDate`).
 * Prefers midday hours (09-15 local, ~07-13 UTC) for daytime representation.
 * Falls back to the most frequent icon code if no midday data.
 */
function pickDaytimeIcon(entries: Map<string, number | null>, date: string): number | null {
  const dayEntries: Array<{ hour: number; code: number }> = [];
  for (const [ts, val] of entries.entries()) {
    if (val === null) continue;
    if (utcTimestampToZurichDate(ts) !== date) continue;
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
  const precipByDate = groupPrecipByDate(hourlyPrecip);

  const today = todayUtc();
  const dates = [...tempByDate.keys()]
    .sort()
    .filter((d) => d >= today)
    .slice(0, days);
  return dates.map((date) => {
    const temps = tempByDate.get(date) ?? [];
    // Derive both the daily total and the hourly series from the same list so
    // they cannot disagree with each other.
    const hourly = precipByDate.get(date) ?? [];
    const precipTotal =
      hourly.length > 0
        ? roundByUnit(
            hourly.reduce((sum, h) => sum + h.value, 0),
            'mm'
          )
        : null;
    const iconCode = pickDaytimeIcon(hourlyIcon, date);

    return {
      date,
      temperature: {
        min: temps.length > 0 ? roundByUnit(Math.min(...temps), '°C') : null,
        max: temps.length > 0 ? roundByUnit(Math.max(...temps), '°C') : null,
        unit: '\u00B0C',
      },
      precipitation: { total: precipTotal, unit: 'mm', hourly },
      weather: iconCode !== null ? weatherIconDescription(iconCode) : null,
      weather_icon_url: iconCode !== null ? weatherIconUrl(iconCode) : null,
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
