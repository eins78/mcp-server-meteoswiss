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
 * Map from the first 6 characters of a pollen parameter code to a short
 * species display name. MeteoSwiss codes follow the pattern:
 * k{a|h}{genus-4-chars}{resolution} where genus is a Latin-genus abbreviation.
 */
const POLLEN_SPECIES = {
  kaalnu: 'Alder (Alnus)',
  kabetu: 'Birch (Betula)',
  kacory: 'Hazel (Corylus)',
  kafagu: 'Beech (Fagus)',
  kafrax: 'Ash (Fraxinus)',
  kaquer: 'Oak (Quercus)',
  khpoac: 'Grasses (Poaceae)',
} as const;

type PollenSpeciesPrefix = keyof typeof POLLEN_SPECIES;

/**
 * Get a short display name for a pollen parameter code.
 * Falls back to the raw code if the prefix is not recognized.
 *
 * @param code - Parameter shortname (or 6-char prefix) like 'kaalnud1'
 * @returns Short species name like 'Alder (Alnus)', or the raw code
 */
function pollenDisplayName(code: string): string {
  const prefix = code.slice(0, 6) as PollenSpeciesPrefix;
  return POLLEN_SPECIES[prefix] ?? code;
}

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
      // MeteoSwiss OGD renamed _d_now.csv to _d_recent.csv in 2025
      const dataUrl = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-pollen/${abbrLower}/ogd-pollen_${abbrLower}_d_recent.csv`;

      try {
        const rows = await getLatin1CsvData(
          dataUrl,
          `pollen/${abbrLower}-daily-recent.csv`,
          'realtime'
        );
        if (rows.length === 0) return null;

        const latestRow = rows[rows.length - 1];
        if (!latestRow) return null;

        // Collect measurements, preferring d1 (calendar day 0-0 UTC) over d0 (6-6 UTC)
        const d0Values = new Map<string, number>();
        const d1Values = new Map<string, number>();

        for (const [key, value] of Object.entries(latestRow)) {
          if (key === 'station_abbr' || key === 'reference_timestamp' || key === 'Date') continue;
          const numVal = parseNumeric(value);
          if (numVal === null) continue;

          const prefix = key.slice(0, 6);
          const suffix = key.slice(6);

          if (suffix === 'd1') {
            d1Values.set(prefix, numVal);
          } else if (suffix === 'd0') {
            d0Values.set(prefix, numVal);
          }
          // Ignore h0, y0, and other resolutions for daily pollen output
        }

        const pollen: PollenMeasurement[] = [];
        const allPrefixes = new Set([...d1Values.keys(), ...d0Values.keys()]);
        for (const prefix of allPrefixes) {
          const value = d1Values.get(prefix) ?? d0Values.get(prefix);
          if (value === undefined) continue;
          pollen.push({
            type: pollenDisplayName(prefix),
            value,
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
