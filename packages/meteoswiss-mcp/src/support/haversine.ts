/**
 * Haversine distance calculation for finding nearest stations.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate the great-circle distance between two WGS84 points.
 *
 * @param lat1 - Latitude of point 1 in degrees
 * @param lon1 - Longitude of point 1 in degrees
 * @param lat2 - Latitude of point 2 in degrees
 * @param lon2 - Longitude of point 2 in degrees
 * @returns Distance in kilometers
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the item from a collection closest to a given point.
 *
 * @param items - Collection to search
 * @param getLat - Extract latitude from an item
 * @param getLon - Extract longitude from an item
 * @param lat - Target latitude
 * @param lon - Target longitude
 * @returns Nearest item and distance in km, or null if items is empty
 */
export function findNearest<T>(
  items: T[],
  getLat: (item: T) => number,
  getLon: (item: T) => number,
  lat: number,
  lon: number
): { item: T; distance_km: number } | null {
  let nearest: T | null = null;
  let minDist = Infinity;

  for (const item of items) {
    const d = haversineDistance(lat, lon, getLat(item), getLon(item));
    if (d < minDist) {
      minDist = d;
      nearest = item;
    }
  }

  if (!nearest) return null;
  return { item: nearest, distance_km: Math.round(minDist * 10) / 10 };
}
