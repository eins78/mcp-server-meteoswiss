/**
 * Data layer for the getClimateNormals tool.
 * Fetches 1991-2020 climate normal values from MeteoSwiss OGD.
 */

import { getCollection } from './ogd-stac-client.js';
import { getLatin1CsvData } from './ogd-data-store.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';
import { OGD_COLLECTIONS, SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  GetClimateNormalsParams,
  ClimateNormalsResponse,
  MonthlyNormal,
} from '../schemas/ogd-climate-normals.js';

/**
 * Normalize a string for fuzzy matching.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Fetch climate normals for a station.
 *
 * @param params - Tool parameters with station and optional month filter
 * @returns Climate normals response with monthly data
 */
export async function getClimateNormals(
  params: GetClimateNormalsParams
): Promise<ClimateNormalsResponse> {
  const { station: stationQuery, month } = params;

  debugData('[ogd-climate] Loading climate normals collection...');
  const collection = await getCollection(OGD_COLLECTIONS.CLIMATE_NORMALS);

  // Get station metadata from the SMN collection for name/coordinates
  const smnCollection = await getCollection(OGD_COLLECTIONS.SMN);
  const stationMetaAsset = smnCollection.assets?.['ogd-smn_meta_stations.csv'];
  if (!stationMetaAsset) {
    throw new Error('Station metadata asset not found');
  }

  const stationRows = await getLatin1CsvData(
    stationMetaAsset.href,
    'metadata/smn-stations.csv',
    'metadata'
  );

  // Resolve station
  const q = normalize(stationQuery.trim());
  const stationRow = stationRows.find(
    (r) =>
      normalize(r.station_abbr ?? '').includes(q) || normalize(r.station_name ?? '').includes(q)
  );

  if (!stationRow) {
    throw new Error(`No station found for "${stationQuery}". Try a station name or abbreviation.`);
  }

  const abbr = stationRow.station_abbr ?? '';

  // Find climate normals data for this station
  // Climate normals are stored per-station in the STAC items
  const paramAsset = collection.assets?.['ogd-climate-normals_meta_parameters.csv'];
  if (!paramAsset) {
    debugData('[ogd-climate] No parameter metadata asset, using known parameter codes');
  }

  // Fetch the station's normals CSV
  const normalsUrl = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-climate-normals/${abbr.toLowerCase()}/ogd-climate-normals_${abbr}_norm_year.csv`;

  let rows;
  try {
    rows = await getLatin1CsvData(
      normalsUrl,
      `climate/normals-${abbr.toLowerCase()}.csv`,
      'climate'
    );
  } catch {
    throw new Error(
      `Climate normals not available for station ${abbr} (${stationRow.station_name}). ` +
        'Climate normals are only published for a subset of long-term stations.'
    );
  }

  if (rows.length === 0) {
    throw new Error(`No climate normal data found for station ${abbr}`);
  }

  // Parse monthly normals from the data
  // The CSV has one row per month with parameter values
  const normals: MonthlyNormal[] = [];
  for (let m = 1; m <= 12; m++) {
    if (month && m !== month) continue;
    const monthStr = String(m).padStart(2, '0');
    const monthRow = rows.find((r) => {
      const date = r.Date ?? r.date ?? '';
      return date.endsWith(monthStr) || date.includes(`-${monthStr}`);
    });

    normals.push({
      month: m,
      temperature_mean: monthRow ? parseNumeric(monthRow.tre200m0 ?? null) : null,
      precipitation_total: monthRow ? parseNumeric(monthRow.rre150m0 ?? null) : null,
      sunshine_hours: monthRow ? parseNumeric(monthRow.sre000m0 ?? null) : null,
    });
  }

  return {
    station: {
      name: stationRow.station_name ?? abbr,
      abbreviation: abbr,
      elevation: parseNumeric(stationRow.station_height_masl ?? null) ?? 0,
      coordinates: {
        lat: parseNumeric(stationRow.station_coordinates_wgs84_lat ?? null) ?? 0,
        lon: parseNumeric(stationRow.station_coordinates_wgs84_lon ?? null) ?? 0,
      },
    },
    period: '1991-2020',
    data: normals,
    source: SOURCE_ATTRIBUTION,
  };
}
