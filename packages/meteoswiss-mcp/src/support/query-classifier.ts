/**
 * Classify free-form location queries by shape.
 * Used by resolvers to pick the right swisstopo geocode origin and decide
 * whether postal-code prefix fallback applies.
 *
 * - `postal_code`: exactly 4 digits ("1200", "8001")
 * - `address`:     contains at least one digit AND at least two whitespace-separated tokens
 *                  ("Bahnhofplatz 1 Bern")
 * - `place_name`:  everything else (plain place/station names, gibberish inputs)
 *
 * The classifier runs on the already-trimmed user query. Normalisation
 * (lowercasing, diacritic stripping) is the caller's concern — results
 * do not depend on case or diacritics.
 */

export const QUERY_KINDS = ['postal_code', 'address', 'place_name'] as const;
export type QueryKind = (typeof QUERY_KINDS)[number];

const FOUR_DIGIT = /^\d{4}$/;
const CONTAINS_DIGIT = /\d/;

/**
 * Classify a trimmed query string into a QueryKind.
 *
 * @param query - Trimmed user query (e.g., "1200", "Bern", "Bahnhofplatz 1 Bern")
 * @returns Query shape
 */
export function classifyQuery(query: string): QueryKind {
  if (FOUR_DIGIT.test(query)) return 'postal_code';
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && CONTAINS_DIGIT.test(query)) return 'address';
  return 'place_name';
}
