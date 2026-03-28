/**
 * Data layer for the getLocalForecast tool.
 * Fetches forecast CSVs from MeteoSwiss OGD, filters by location, and aggregates into daily summaries.
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

/** Parameters needed for summary mode */
const SUMMARY_PARAMS = ['tre200dx', 'tre200dn', 'rka150d0', 'jp2000d0'] as const;

/**
 * Find the asset key for a given parameter in the latest forecast item.
 * Asset keys follow: vnut12.lssw.{YYYYMMDDhhmm}.{param}.csv
 */
function findAssetKey(item: StacItem, param: string): string | null {
  const suffix = `.${param}.csv`;
  return Object.keys(item.assets).find((k) => k.endsWith(suffix)) ?? null;
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

  // Resolve location and get latest STAC item concurrently
  debugData('[ogd-forecast] Resolving location: %s', location);
  const [resolved, item] = await Promise.all([
    resolveForecastPoint(location),
    getLatestItem(OGD_COLLECTIONS.LOCAL_FORECASTING),
  ]);

  const point = resolved.match;
  debugData(
    '[ogd-forecast] Resolved to: %s (point_id=%d, type=%d, confidence=%s)',
    point.name,
    point.point_id,
    point.point_type_id,
    resolved.confidence
  );

  const generated = String(item.properties.datetime ?? item.properties.updated ?? item.id);
  const pointIdStr = String(point.point_id);
  const pointTypeStr = String(point.point_type_id);

  // Row filter: only keep rows matching this point (avoids allocating ~1.2M rows)
  const rowFilter = (row: Record<string, string | null>): boolean =>
    row.point_id === pointIdStr && row.point_type_id === pointTypeStr;

  // Download all parameter CSVs concurrently with row filtering
  const paramEntries = await Promise.all(
    SUMMARY_PARAMS.map(async (param) => {
      const assetKey = findAssetKey(item, param);
      if (!assetKey) {
        debugData('[ogd-forecast] No asset found for param: %s', param);
        return [param, new Map<string, number | null>()] as const;
      }

      const url = resolveAssetUrl(item, assetKey);
      const cacheKey = `forecasts/${item.id}/${assetKey}`;
      debugData('[ogd-forecast] Downloading %s...', param);
      const rows = await getCsvData(url, cacheKey, 'forecast', rowFilter);

      // Build date -> value map from filtered rows
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

  // Collect unique dates from temperature max (daily parameter)
  const tempMaxData = paramData.get('tre200dx') ?? new Map<string, number | null>();
  const dates = [...new Set([...tempMaxData.keys()].map(timestampToDate))].sort().slice(0, days);

  // Pre-key all param data by date for O(1) lookup
  const dateKeyedData = new Map(
    [...paramData.entries()].map(([param, tsMap]) => [
      param,
      new Map([...tsMap.entries()].map(([ts, val]) => [timestampToDate(ts), val])),
    ])
  );

  // Build daily forecasts
  const forecast: DailyForecast[] = dates.map((date) => ({
    date,
    temperature: {
      min: dateKeyedData.get('tre200dn')?.get(date) ?? null,
      max: dateKeyedData.get('tre200dx')?.get(date) ?? null,
      unit: '\u00B0C',
    },
    precipitation: {
      total: dateKeyedData.get('rka150d0')?.get(date) ?? null,
      unit: 'mm',
    },
    weather_icon: dateKeyedData.get('jp2000d0')?.get(date) ?? null,
  }));

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
