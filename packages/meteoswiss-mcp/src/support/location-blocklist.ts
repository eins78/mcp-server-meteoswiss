import { normalize } from './normalize.js';

/**
 * Well-known international city names that should always be rejected, regardless
 * of Swiss namesake hamlets. Switzerland has a hamlet named "Paris" in the
 * municipality of Lucens, Canton Vaud (~100 people, ~3 km from Payerne).
 * Without this guard, querying "Paris" silently returns Payerne (PAY) instead
 * of erroring because the swisstopo geocoder correctly finds the Swiss hamlet.
 *
 * Pure blocklist: any query whose normalized form exactly matches an entry is
 * rejected before any name matching or geocoding. Entries are exact strings.
 */
export const INTERNATIONAL_CITY_BLOCKLIST = [
  'paris',
  'berlin',
  'london',
  'tokyo',
  'beijing',
  'moscow',
  'madrid',
  'rome',
  'new york',
  'los angeles',
  'sydney',
  'mumbai',
  'delhi',
  'cairo',
  'istanbul',
  'bangkok',
  'toronto',
  'budapest',
  'stockholm',
  'oslo',
  'copenhagen',
  'helsinki',
  'athens',
  'lisbon',
  'dublin',
  'brussels',
  'amsterdam',
  'barcelona',
  'buenos aires',
  'mexico city',
  'sao paulo',
  'rio de janeiro',
] as const;

/** Set of blocklisted names for O(1) lookup */
const BLOCKLIST_SET = new Set<string>(INTERNATIONAL_CITY_BLOCKLIST);

/**
 * Returns true when the query exactly matches a well-known international city
 * name. Case-insensitive and diacritic-normalized. Protects against Swiss
 * namesake hamlets (e.g., Paris, VD) silently matching international queries.
 *
 * @param query - Raw user query
 */
export function isBlocklisted(query: string): boolean {
  return BLOCKLIST_SET.has(normalize(query.trim()));
}
