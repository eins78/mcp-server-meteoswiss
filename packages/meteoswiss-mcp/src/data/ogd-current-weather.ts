/**
 * Data layer for the getCurrentWeather tool.
 * Fetches real-time measurements from the consolidated VQHA80.csv.
 */

import { getCsvData, getLatin1CsvData } from './ogd-data-store.js';
import { resolveSmnStation, loadSmnStations } from './ogd-smn-stations.js';
import { parseNumeric } from '../support/ogd-csv-parser.js';
import { roundByUnit } from '../support/round-measurements.js';
import { reverseGeocodeSwiss } from '../support/reverse-geocode.js';
import type { ReverseGeocodeResult } from '../support/reverse-geocode.js';
import { debugData } from '../support/logging.js';
import { SOURCE_ATTRIBUTION } from '../schemas/ogd-shared.js';
import { findNearest } from '../support/haversine.js';
import type {
  GetCurrentWeatherParams,
  CurrentWeatherResponse,
  MeasurementValue,
} from '../schemas/ogd-current-weather.js';
import type { CsvRow } from '../support/ogd-csv-parser.js';
import type { SmnStation } from './ogd-smn-stations.js';

const REALTIME_CSV_URL = 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv';

/** The 8 stations that have visual observations (OBS) data */
const OBS_STATIONS = new Set(['ALT', 'BAS', 'CHU', 'GSB', 'JUN', 'SAE', 'SIO', 'SMA']);

/** Cache reverse geocode results per station (coordinates are static) */
const reverseGeoCache = new Map<string, ReverseGeocodeResult | null>();

async function getCachedReverseGeocode(
  lat: number,
  lon: number,
  stationAbbr: string
): Promise<ReverseGeocodeResult | null> {
  if (reverseGeoCache.has(stationAbbr)) {
    return reverseGeoCache.get(stationAbbr) ?? null;
  }
  const result = await reverseGeocodeSwiss(lat, lon).catch(() => null);
  reverseGeoCache.set(stationAbbr, result);
  return result;
}

/**
 * Create a measurement value if the raw data is present.
 */
function measurement(row: CsvRow, key: string, unit: string): MeasurementValue | undefined {
  const val = parseNumeric(row[key] ?? null);
  if (val === null) return undefined;
  return { value: roundByUnit(val, unit), unit };
}

/**
 * Find the nearest station to a coordinate that actually reports a core
 * measurement (temperature). Some stations are geometrically close to a
 * point but report only sunshine/radiation or precipitation (e.g. Uetliberg
 * near Zürich Kreis 3) — this skips past them to the nearest station with
 * temperature data, rather than returning a mostly-empty response for the
 * strictly-nearest point (issue #110, DECISION-4). Only used on the
 * coordinate-lookup path; name-based resolution is unaffected. Falls back to
 * the plain geometric nearest station if no station in VQHA80 reports
 * temperature (should not happen in practice).
 *
 * Returns the selected station's own VQHA80 row alongside the station so the
 * caller can read its measurements directly instead of re-fetching and
 * re-parsing the same CSV (PR #116 Copilot review). Only the one matching
 * row is retained — not the full parsed table — to avoid holding the large
 * VQHA80 row set alive for the rest of the request.
 */
async function findNearestStationWithTemperature(
  lat: number,
  lon: number
): Promise<{ station: SmnStation; distance_km: number; row: CsvRow | undefined }> {
  const [stations, rows] = await Promise.all([
    loadSmnStations(),
    getCsvData(REALTIME_CSV_URL, 'measurements/VQHA80.csv', 'realtime'),
  ]);

  const abbrsWithTemperature = new Set(
    rows
      .filter((row) => parseNumeric(row.tre200s0 ?? null) !== null)
      .map((row) => row['Station/Location'])
  );

  const capableStations = stations.filter((s) => abbrsWithTemperature.has(s.abbr));
  const candidates = capableStations.length > 0 ? capableStations : stations;

  const result = findNearest(
    candidates,
    (s) => s.lat,
    (s) => s.lon,
    lat,
    lon
  );
  if (!result) {
    throw new Error('No stations available');
  }
  const station = result.item;
  const row = rows.find((r) => r['Station/Location'] === station.abbr);
  return { station, distance_km: result.distance_km, row };
}

/**
 * Fetch current weather measurements for a station.
 * Accepts either a station query (name/abbreviation/address) or coordinates.
 *
 * @param params - Tool parameters
 * @returns Structured current weather response
 */
export async function getCurrentWeather(
  params: GetCurrentWeatherParams
): Promise<CurrentWeatherResponse> {
  let station: SmnStation;
  let distance_km: number | undefined;
  let row: CsvRow | undefined;
  let geo: ReverseGeocodeResult | null;

  if (params.coordinates) {
    const result = await findNearestStationWithTemperature(
      params.coordinates.lat,
      params.coordinates.lon
    );
    station = result.station;
    distance_km = result.distance_km;
    debugData(
      '[ogd-weather] Nearest station with temperature to coordinates: %s (%.1f km)',
      station.abbr,
      distance_km
    );

    // Reuse the row already fetched/parsed by findNearestStationWithTemperature
    // instead of re-fetching and re-parsing the same CSV (PR #116 Copilot review).
    row = result.row;
    geo = await getCachedReverseGeocode(station.lat, station.lon, station.abbr);
  } else if (params.station) {
    station = await resolveSmnStation(params.station);
    debugData('[ogd-weather] Resolved station: %s (%s)', station.abbr, station.name);

    const filter = (r: CsvRow): boolean => r['Station/Location'] === station.abbr;

    // Fetch weather data and reverse geocode concurrently (independent operations)
    const [rows, geoResult] = await Promise.all([
      getCsvData(REALTIME_CSV_URL, 'measurements/VQHA80.csv', 'realtime', filter),
      getCachedReverseGeocode(station.lat, station.lon, station.abbr),
    ]);
    row = rows[0];
    geo = geoResult;
  } else {
    throw new Error('Either "station" or "coordinates" must be provided');
  }

  // Fallback for precipitation-only stations: VQHA80 does not include them
  if (!row && station.network === 'smn-precip') {
    debugData('[ogd-weather] Station %s is precip-only, fetching per-station CSV', station.abbr);
    const abbrLower = station.abbr.toLowerCase();
    const precipUrl = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn-precip/${abbrLower}/ogd-smn-precip_${abbrLower}_t_recent.csv`;
    const precipRows = await getCsvData(
      precipUrl,
      `measurements/smn-precip-${abbrLower}-t-recent.csv`,
      'realtime'
    );
    // Use the most recent row (last in the CSV)
    row = precipRows.length > 0 ? precipRows[precipRows.length - 1] : undefined;
  }

  if (!row) {
    throw new Error(`No current data available for station ${station.abbr} (${station.name})`);
  }

  // Enrich with visual observations for the 8 OBS stations
  let visual_observations: CurrentWeatherResponse['visual_observations'];
  if (OBS_STATIONS.has(station.abbr)) {
    visual_observations = await fetchVisualObservations(station.abbr);
  }

  return {
    station: {
      name: station.name,
      abbreviation: station.abbr,
      elevation: station.elevation,
      coordinates: { lat: station.lat, lon: station.lon },
      municipality: geo?.municipality,
      canton: geo?.canton ?? station.canton,
      distance_km,
      network: station.network,
    },
    timestamp: row.Date ?? row.reference_timestamp ?? '',
    measurements: {
      temperature: measurement(row, 'tre200s0', '\u00B0C'),
      humidity: measurement(row, 'ure200s0', '%'),
      dew_point: measurement(row, 'tde200s0', '\u00B0C'),
      precipitation: measurement(row, 'rre150z0', 'mm'),
      wind_speed: measurement(row, 'fu3010z0', 'km/h'),
      wind_gust: measurement(row, 'fu3010z1', 'km/h'),
      wind_direction: measurement(row, 'dkl010z0', '\u00B0'),
      sunshine: measurement(row, 'sre000z0', 'min'),
      radiation: measurement(row, 'gre000z0', 'W/m\u00B2'),
      pressure_station: measurement(row, 'prestas0', 'hPa'),
      pressure_sea_level: measurement(row, 'pp0qffs0', 'hPa'),
      snow_depth: measurement(row, 'htoauts0', 'cm'),
    },
    visual_observations,
    source: SOURCE_ATTRIBUTION,
  };
}

/**
 * Fetch the latest visual observation for an OBS station.
 * Returns undefined if the fetch fails (non-critical enrichment).
 */
async function fetchVisualObservations(
  abbr: string
): Promise<CurrentWeatherResponse['visual_observations']> {
  try {
    const abbrLower = abbr.toLowerCase();
    const url = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-obs/${abbrLower}/ogd-obs_${abbrLower}_d_recent.csv`;
    const rows = await getLatin1CsvData(
      url,
      `observations/obs-${abbrLower}-d-recent.csv`,
      'realtime'
    );

    if (rows.length === 0) return undefined;
    const latestRow = rows[rows.length - 1]!;

    const cloudCover = parseNumeric(latestRow.nto000d0 ?? null);
    // MeteoSwiss CSV uses '-' for "phenomenon not observed", which the CSV parser
    // maps to null. For boolean observation flags, not-observed means false.
    const parseFlag = (val: string | null): boolean => {
      if (val === null) return false;
      const num = parseNumeric(val);
      return num === 1;
    };

    // Parse timestamp DD.MM.YYYY → YYYY-MM-DD
    const ts = latestRow.reference_timestamp ?? '';
    const match = ts.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    const date = match ? `${match[3]}-${match[2]}-${match[1]}` : ts;

    return {
      date,
      cloud_cover_percent: cloudCover === null ? undefined : roundByUnit(cloudCover, '%'),
      is_clear_day: parseFlag(latestRow.nto002d0 ?? null),
      is_overcast_day: parseFlag(latestRow.nto008d0 ?? null),
      has_rain: parseFlag(latestRow.w1p012d0 ?? null),
      has_rain_and_snow: parseFlag(latestRow.w2p001d0 ?? null),
      has_snowfall: parseFlag(latestRow.w2p002d0 ?? null),
      has_hail: parseFlag(latestRow.w3p002d0 ?? null),
      has_fog: parseFlag(latestRow.w5p002d0 ?? null),
      has_snow_coverage: parseFlag(latestRow.est000d0 ?? null),
    };
  } catch (error) {
    debugData('[ogd-weather] Failed to fetch visual observations for %s: %O', abbr, error);
    return undefined;
  }
}
