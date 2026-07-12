/**
 * Normalization of MeteoSwiss OGD CSV timestamp cells to ISO 8601.
 *
 * OGD CSVs carry timestamps in two fixed-width, timezone-less formats depending
 * on the product: `YYYYMMDDhhmm` (e.g. VQHA80 realtime) and `DD.MM.YYYY HH:MM`
 * (e.g. precip-station and pollen). Both are UTC. The tool schemas advertise
 * ISO 8601, so raw cells must be normalized before they reach the client.
 */

/**
 * Normalize a MeteoSwiss OGD timestamp cell to `YYYY-MM-DDTHH:mm:ssZ` (UTC).
 *
 * Recognizes `YYYYMMDDhhmm` (12 digits) and `DD.MM.YYYY[ HH:MM[:SS]]`. An empty
 * cell returns `''`; an unrecognized format is returned unchanged rather than
 * fabricating a value.
 *
 * @param raw - The raw CSV timestamp cell
 * @returns An ISO 8601 UTC timestamp, `''`, or the original string if unrecognized
 */
export function normalizeOgdTimestamp(raw: string): string {
  const value = raw.trim();
  if (value === '') return '';

  // YYYYMMDDhhmm (12 digits, UTC)
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const [, y, mo, d, h, mi] = compact;
    return `${y}-${mo}-${d}T${h}:${mi}:00Z`;
  }

  // DD.MM.YYYY with optional HH:MM[:SS] (UTC)
  const dotted = value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dotted) {
    const [, d, mo, y, h = '00', mi = '00', s = '00'] = dotted;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  }

  return value;
}
