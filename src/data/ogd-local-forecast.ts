/**
 * Data layer for the getLocalForecast tool.
 * Fetches forecast CSVs from MeteoSwiss OGD, filters by location, and aggregates into daily summaries.
 */

import { getLatestItem, resolveAssetUrl } from './ogd-stac-client.js';
import { getCsvData } from './ogd-data-store.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { resolveForecastPoint } from './ogd-station-resolver.js';
import { debugData } from '../support/logging.js';
import { pointTypeFromId, SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  GetLocalForecastParams,
  LocalForecastResponse,
  DailyForecast,
} from '../schemas/ogd-local-forecast.js';
import type { CsvRow } from '../support/ogd-csv-parser.js';
import type { StacItem } from '../schemas/ogd-shared.js';

const FORECAST_COLLECTION = 'ch.meteoschweiz.ogd-local-forecasting';

/** Parameters needed for summary mode */
const SUMMARY_PARAMS = ['tre200dx', 'tre200dn', 'rka150d0', 'jp2000d0'] as const;

/**
 * Find the asset key for a given parameter in the latest forecast item.
 * Asset keys follow: vnut12.lssw.{YYYYMMDDhhmm}.{param}.csv
 * We need to match any timestamp prefix for the given parameter.
 */
function findAssetKey(item: StacItem, param: string): string | null {
  const suffix = `.${param}.csv`;
  const key = Object.keys(item.assets).find((k) => k.endsWith(suffix));
  return key ?? null;
}

/**
 * Filter CSV rows for a specific forecast point and extract date-value pairs.
 */
function filterRowsForPoint(
  rows: CsvRow[],
  pointId: number,
  pointTypeId: number,
  paramName: string
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  for (const row of rows) {
    if (
      parseNumeric(row.point_id ?? null) === pointId &&
      parseNumeric(row.point_type_id ?? null) === pointTypeId
    ) {
      const date = row.Date ?? '';
      result.set(date, parseNumeric(row[paramName] ?? null));
    }
  }
  return result;
}

/**
 * Convert a MeteoSwiss timestamp (YYYYMMDDhhmm) to a date string (YYYY-MM-DD).
 */
function timestampToDate(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/**
 * Fetch and assemble the local forecast for a given location.
 */
export async function getLocalForecast(
  params: GetLocalForecastParams
): Promise<LocalForecastResponse> {
  const { location, days } = params;

  // Resolve location to forecast point
  debugData('[ogd-forecast] Resolving location: %s', location);
  const resolved = await resolveForecastPoint(location);
  const point = resolved.match;
  debugData(
    '[ogd-forecast] Resolved to: %s (point_id=%d, type=%d, confidence=%s)',
    point.name,
    point.point_id,
    point.point_type_id,
    resolved.confidence
  );

  // Get latest forecast item from STAC
  const item = await getLatestItem(FORECAST_COLLECTION);
  const generated = String(item.properties.datetime ?? item.properties.updated ?? item.id);

  // Download parameter CSVs and filter for this point
  const paramData = new Map<string, Map<string, number | null>>();

  for (const param of SUMMARY_PARAMS) {
    const assetKey = findAssetKey(item, param);
    if (!assetKey) {
      debugData('[ogd-forecast] No asset found for param: %s', param);
      continue;
    }

    const url = resolveAssetUrl(item, assetKey);
    const cacheKey = `forecasts/${item.id}/${assetKey}`;
    debugData('[ogd-forecast] Downloading %s...', param);
    const rows = await getCsvData(url, cacheKey, 'forecast');
    const filtered = filterRowsForPoint(rows, point.point_id, point.point_type_id, param);
    paramData.set(param, filtered);
    debugData('[ogd-forecast] Got %d values for %s', filtered.size, param);
  }

  // Collect unique dates from temperature max (daily parameter)
  const tempMaxData = paramData.get('tre200dx') ?? new Map();
  const dates = [...tempMaxData.keys()]
    .map(timestampToDate)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .sort()
    .slice(0, days);

  // Build daily forecasts
  const forecast: DailyForecast[] = dates.map((date) => {
    // Find the timestamp key that maps to this date
    const findValue = (param: string): number | null => {
      const data = paramData.get(param);
      if (!data) return null;
      for (const [ts, val] of data.entries()) {
        if (timestampToDate(ts) === date) return val;
      }
      return null;
    };

    return {
      date,
      temperature: {
        min: findValue('tre200dn'),
        max: findValue('tre200dx'),
        unit: '\u00B0C',
      },
      precipitation: {
        total: findValue('rka150d0'),
        unit: 'mm',
      },
      weather_icon: findValue('jp2000d0'),
    };
  });

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
