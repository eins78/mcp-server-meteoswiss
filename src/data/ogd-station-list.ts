/**
 * Data layer for the listStations tool.
 * Lists and searches MeteoSwiss automatic weather stations.
 */

import { getCollection } from './ogd-stac-client.js';
import { getLatin1CsvData } from './ogd-data-store.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS, SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  ListStationsParams,
  StationListResponse,
  StationListEntry,
} from '../schemas/ogd-station-list.js';

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
 * List and search MeteoSwiss weather stations.
 *
 * @param params - Tool parameters with optional search, canton, and limit
 * @returns Filtered station list
 */
export async function listStations(params: ListStationsParams): Promise<StationListResponse> {
  const { search, canton, limit } = params;

  debugData('[ogd-stations] Loading station metadata...');
  const collection = await getCollection(OGD_COLLECTIONS.SMN);
  const metaAsset = collection.assets?.['ogd-smn_meta_stations.csv'];
  if (!metaAsset) {
    throw new Error('Station metadata asset not found');
  }

  const rows = await getLatin1CsvData(metaAsset.href, 'metadata/smn-stations.csv', 'metadata');

  let stations: StationListEntry[] = rows
    .filter((row) => row.station_abbr)
    .map((row) => ({
      abbreviation: row.station_abbr ?? '',
      name: row.station_name ?? '',
      canton: row.station_canton ?? '',
      elevation: parseNumeric(row.station_height_masl ?? null) ?? 0,
      coordinates: {
        lat: parseNumeric(row.station_coordinates_wgs84_lat ?? null) ?? 0,
        lon: parseNumeric(row.station_coordinates_wgs84_lon ?? null) ?? 0,
      },
      data_since: row.station_data_since ?? '',
    }));

  // Apply filters
  if (search) {
    const q = normalize(search);
    stations = stations.filter(
      (s) => normalize(s.name).includes(q) || normalize(s.abbreviation).includes(q)
    );
  }

  if (canton) {
    const c = canton.toUpperCase();
    stations = stations.filter((s) => s.canton.toUpperCase() === c);
  }

  const total = stations.length;
  stations = stations.slice(0, limit);

  debugData('[ogd-stations] Returning %d of %d stations', stations.length, total);

  return {
    total,
    stations,
    source: SOURCE_ATTRIBUTION,
  };
}
