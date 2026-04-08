/**
 * Scored name matching for Swiss place names and station names.
 * Word-boundary-aware scoring prevents "Bern" matching "Bernina" over "Bern / Zollikofen".
 */

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
