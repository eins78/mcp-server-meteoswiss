/**
 * Data layer for the listStations tool.
 * Lists and searches MeteoSwiss automatic weather stations.
 */

import { loadSmnStations } from './ogd-smn-stations.js';
import { normalize } from '../support/normalize.js';
import { debugData } from '../support/logging.js';
import { SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  ListStationsParams,
  StationListResponse,
  StationListEntry,
} from '../schemas/ogd-station-list.js';

/**
 * List and search MeteoSwiss weather stations.
 *
 * @param params - Tool parameters with optional search, canton, and limit
 * @returns Filtered station list
 */
export async function listStations(params: ListStationsParams): Promise<StationListResponse> {
  const { search, canton, limit } = params;

  const smnStations = await loadSmnStations();

  let stations: StationListEntry[] = smnStations.map((s) => ({
    abbreviation: s.abbr,
    name: s.name,
    canton: s.canton,
    elevation: s.elevation,
    coordinates: { lat: s.lat, lon: s.lon },
    data_since: s.data_since,
  }));

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

  return { total, stations, source: SOURCE_ATTRIBUTION };
}
