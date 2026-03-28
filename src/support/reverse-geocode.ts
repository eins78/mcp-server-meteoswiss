/**
 * Swiss reverse geocoding via swisstopo Identify API.
 * Converts WGS84 coordinates to municipality and canton names.
 * Free, no auth, CORS open.
 */

import { fetchJson } from './http-communication.js';
import { debugData } from './logging.js';

const IDENTIFY_URL = 'https://api3.geo.admin.ch/rest/services/ech/MapServer/identify';
const MUNICIPALITY_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';

/** Result from reverse geocoding */
export type ReverseGeocodeResult = {
  municipality: string;
  canton: string;
};

/** Raw API response shape */
type IdentifyResponse = {
  results?: Array<{
    properties?: {
      gemname?: string;
      kanton?: string;
    };
    attributes?: {
      gemname?: string;
      kanton?: string;
    };
  }>;
};

/**
 * Reverse geocode WGS84 coordinates to municipality and canton.
 *
 * @param lat - WGS84 latitude
 * @param lon - WGS84 longitude
 * @returns Municipality and canton names, or null if outside Switzerland
 */
export async function reverseGeocodeSwiss(
  lat: number,
  lon: number
): Promise<ReverseGeocodeResult | null> {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    tolerance: '0',
    sr: '4326',
    layers: `all:${MUNICIPALITY_LAYER}`,
    returnGeometry: 'false',
    limit: '1',
  });

  const url = `${IDENTIFY_URL}?${params.toString()}`;
  debugData('[reverse-geocode] Looking up (%f, %f)', lat, lon);

  try {
    const data = await fetchJson<IdentifyResponse>(url);
    const result = data.results?.[0];
    // API returns properties or attributes depending on format
    const props = result?.properties ?? result?.attributes;
    if (!props?.gemname) {
      debugData('[reverse-geocode] No municipality found for (%f, %f)', lat, lon);
      return null;
    }

    return {
      municipality: props.gemname,
      canton: props.kanton ?? '',
    };
  } catch (error) {
    debugData('[reverse-geocode] Failed for (%f, %f): %O', lat, lon, error);
    return null;
  }
}
