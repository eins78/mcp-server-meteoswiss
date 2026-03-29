/**
 * Data layer for the getPollenData tool.
 * Fetches pollen concentration data from MeteoSwiss OGD.
 */

import { getCollection } from './ogd-stac-client.js';
import { getLatin1CsvData } from './ogd-data-store.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { normalize } from '../support/normalize.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS, SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  GetPollenDataParams,
  PollenDataResponse,
  StationPollenData,
  PollenMeasurement,
} from '../schemas/ogd-pollen-data.js';

/**
 * Fetch pollen data from MeteoSwiss OGD.
 *
 * @param params - Tool parameters with optional station filter
 * @returns Pollen data response with measurements per station
 */
export async function getPollenData(params: GetPollenDataParams): Promise<PollenDataResponse> {
  debugData('[ogd-pollen] Loading pollen collection...');
  const collection = await getCollection(OGD_COLLECTIONS.POLLEN);

  // Get station metadata
  const stationMetaAsset = collection.assets?.['ogd-pollen_meta_stations.csv'];
  if (!stationMetaAsset) {
    throw new Error('Pollen station metadata asset not found');
  }

  const stationRows = await getLatin1CsvData(
    stationMetaAsset.href,
    'metadata/pollen-stations.csv',
    'metadata'
  );

  // Get parameter metadata for pollen type names
  const paramMetaAsset = collection.assets?.['ogd-pollen_meta_parameters.csv'];
  const paramRows = paramMetaAsset
    ? await getLatin1CsvData(paramMetaAsset.href, 'metadata/pollen-parameters.csv', 'metadata')
    : [];

  const paramNames = new Map<string, string>();
  for (const row of paramRows) {
    const code = row.parameter_shortname ?? '';
    const name = row.parameter_description_en ?? row.parameter_description_de ?? code;
    if (code) paramNames.set(code, name);
  }

  // Filter stations if search provided
  let filteredStations = stationRows.filter((r) => r.station_abbr);
  if (params.station) {
    const q = normalize(params.station);
    filteredStations = filteredStations.filter(
      (r) =>
        normalize(r.station_abbr ?? '').includes(q) || normalize(r.station_name ?? '').includes(q)
    );
    if (filteredStations.length === 0) {
      throw new Error(
        `No pollen station found for "${params.station}". ` +
          `Available: ${stationRows.map((r) => `${r.station_abbr} (${r.station_name})`).join(', ')}`
      );
    }
  }

  // Fetch data for each station concurrently
  const stationResults = await Promise.all(
    filteredStations.map(async (stationRow): Promise<StationPollenData | null> => {
      const abbr = stationRow.station_abbr ?? '';
      const abbrLower = abbr.toLowerCase();
      const dataUrl = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-pollen/${abbrLower}/ogd-pollen_${abbrLower}_d_now.csv`;

      try {
        const rows = await getLatin1CsvData(
          dataUrl,
          `pollen/${abbrLower}-daily-now.csv`,
          'realtime'
        );
        if (rows.length === 0) return null;

        const latestRow = rows[rows.length - 1];
        if (!latestRow) return null;

        const pollen: PollenMeasurement[] = [];
        for (const [key, value] of Object.entries(latestRow)) {
          if (key === 'station_abbr' || key === 'reference_timestamp' || key === 'Date') continue;
          const numVal = parseNumeric(value);
          if (numVal === null) continue;
          pollen.push({
            type: paramNames.get(key) ?? key,
            value: numVal,
            unit: 'particles/m\u00B3',
          });
        }

        return {
          station: {
            name: stationRow.station_name ?? abbr,
            abbreviation: abbr,
            coordinates: {
              lat: parseNumeric(stationRow.station_coordinates_wgs84_lat ?? null) ?? 0,
              lon: parseNumeric(stationRow.station_coordinates_wgs84_lon ?? null) ?? 0,
            },
          },
          timestamp: latestRow.reference_timestamp ?? latestRow.Date ?? '',
          pollen,
        };
      } catch (error) {
        debugData('[ogd-pollen] Failed to fetch data for station %s: %O', abbr, error);
        return null;
      }
    })
  );

  const stations = stationResults.filter((s): s is StationPollenData => s !== null);

  return { stations, source: SOURCE_ATTRIBUTION };
}
