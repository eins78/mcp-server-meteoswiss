/**
 * Scored name matching for Swiss place names and station names.
 * Word-boundary-aware scoring prevents "Bern" matching "Bernina" over "Bern / Zollikofen".
 */

import { normalize } from './normalize.js';

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns true if the user's query has at least one token (≥3 chars) that
 * appears as a substring in the geocoded place name, or vice versa.
 *
 * Guards against gibberish queries (e.g., "NOTASTATION") that the live swisstopo
 * API fuzzy-matches to an unrelated Swiss coordinate. Shared by all three station
 * resolvers (SMN, NBCN, forecast) so the guard cannot drift between them.
 *
 * @param query - The raw user query
 * @param geocodedName - The place name returned by the geocoder
 * @returns Whether the two share a meaningful token
 */
export function geocodedNameMatchesQuery(query: string, geocodedName: string): boolean {
  const queryNorm = normalize(query.trim());
  const nameNorm = normalize(geocodedName);

  const queryTokens = queryNorm.split(/\s+/).filter((t) => t.length >= 3);
  for (const token of queryTokens) {
    if (nameNorm.includes(token)) return true;
  }

  const nameTokens = nameNorm.split(/\s+/).filter((t) => t.length >= 3);
  for (const token of nameTokens) {
    if (queryNorm.includes(token)) return true;
  }

  return false;
}

/**
 * Score how well a normalized query matches a normalized candidate name.
 * Higher scores indicate better matches. Returns 0 for no match.
 *
 * Scoring tiers:
 * - 100: Exact match ("davos" === "davos")
 * -  50: Word-boundary match ("bern" in "bern / zollikofen")
 * -  10: Substring match ("bern" in "passo del bernina" — inside "bernina")
 * -   0: No match
 *
 * @param normalizedQuery - Normalized search query (lowercase, no diacritics)
 * @param normalizedName - Normalized candidate name to match against
 * @returns Score from 0 (no match) to 100 (exact match)
 */
export function scoreNameMatch(normalizedQuery: string, normalizedName: string): number {
  if (normalizedQuery === '') return 0;

  if (normalizedName === normalizedQuery) return 100;

  if (!normalizedName.includes(normalizedQuery)) return 0;

  // Word-boundary check: query appears as a complete word (not inside another word)
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedQuery)}([^a-z0-9]|$)`);
  if (pattern.test(normalizedName)) return 50;

  // Substring match (query is part of a longer word)
  return 10;
}
