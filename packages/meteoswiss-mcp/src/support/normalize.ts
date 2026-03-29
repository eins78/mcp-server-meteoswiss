/**
 * String normalization for fuzzy matching of Swiss place names.
 * Handles diacritics: Zürich→zurich, Genève→geneve, Château-d'Oex→chateau-d'oex.
 */

/**
 * Normalize a string for fuzzy matching: lowercase, strip diacritics.
 *
 * @param s - Input string
 * @returns Normalized lowercase string with diacritics removed
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
