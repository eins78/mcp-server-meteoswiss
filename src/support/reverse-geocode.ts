/**
 * Swiss reverse geocoding via swisstopo Identify API.
 * Converts WGS84 coordinates to municipality and canton names.
 * Free, no auth, CORS open.
 */

import { z } from 'zod';
import { fetchJson } from './http-communication.js';
import { debugData } from './logging.js';

const IDENTIFY_URL = 'https://api3.geo.admin.ch/rest/services/ech/MapServer/identify';
const MUNICIPALITY_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';

/** Result from reverse geocoding */
export type ReverseGeocodeResult = {
  municipality: string;
  canton: string;
};

/** Zod schema for the swisstopo Identify API response */
const IdentifyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        properties: z
          .object({
            gemname: z.string().optional(),
            kanton: z.string().optional(),
          })
          .optional(),
        attributes: z
          .object({
            gemname: z.string().optional(),
            kanton: z.string().optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

/**
 * Reverse geocode WGS84 coordinates to municipality and canton.
 * Network errors propagate to the caller; coordinates outside Switzerland return null.
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

  // Let HTTP/network errors propagate — only return null for empty results
  const raw = await fetchJson(url);
  const data = IdentifyResponseSchema.parse(raw);
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
}
