/**
 * Data layer for the getClimateNormals tool.
 * Fetches 1991-2020 climate normal values from MeteoSwiss OGD.
 */

import { getLatin1CsvData } from './ogd-data-store.js';
import { resolveSmnStation } from './ogd-smn-stations.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';
import { SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import type {
  GetClimateNormalsParams,
  ClimateNormalsResponse,
  MonthlyNormal,
} from '../schemas/ogd-climate-normals.js';

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

  const station = await resolveSmnStation(stationQuery);
  debugData('[ogd-climate] Resolved station: %s (%s)', station.abbr, station.name);

  // Fetch the station's normals CSV
  const normalsUrl = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-climate-normals/${station.abbr.toLowerCase()}/ogd-climate-normals_${station.abbr}_norm_year.csv`;

  let rows;
  try {
    rows = await getLatin1CsvData(
      normalsUrl,
      `climate/normals-${station.abbr.toLowerCase()}.csv`,
      'climate'
    );
  } catch {
    throw new Error(
      `Climate normals not available for station ${station.abbr} (${station.name}). ` +
        'Climate normals are only published for a subset of long-term stations.'
    );
  }

  if (rows.length === 0) {
    throw new Error(`No climate normal data found for station ${station.abbr}`);
  }

  // Parse monthly normals
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
      name: station.name,
      abbreviation: station.abbr,
      elevation: station.elevation,
      coordinates: { lat: station.lat, lon: station.lon },
    },
    period: '1991-2020',
    data: normals,
    source: SOURCE_ATTRIBUTION,
  };
}
