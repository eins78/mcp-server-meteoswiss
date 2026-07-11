/**
 * Unit-aware rounding for numeric measurement values.
 *
 * Rounding is applied at each tool's data-assembly point (see the
 * construction sites in `src/data/*.ts`), not as a post-hoc transform on the
 * serialized response. Every numeric value in a tool response is genuinely
 * parsed from CSV data and explicitly placed into a typed response object by
 * our own code, so the natural place to round is where the value is first
 * assembled — not a generic tree-walk applied afterward.
 *
 * {@link UNIT_DECIMALS} is the single source of truth for how many decimal
 * places a given unit should be rounded to. {@link roundByUnit} applies it to
 * a plain number; {@link roundNullable} and {@link roundOptional} are thin
 * wrappers for the `number | null` and `number | undefined` shapes commonly
 * produced by CSV parsing at assembly sites.
 *
 * Fields with no physical unit (coordinates, elevation, distance_km, climate
 * day counts, IDs, timestamps, pagination counters) are never routed through
 * these helpers and so pass through unchanged.
 */

/** Decimal places to round to, keyed by the exact unit string emitted in tool output. */
export const UNIT_DECIMALS: Record<string, number> = {
  '°C': 1,
  'km/h': 1,
  'm/s': 1,
  mm: 1,
  '°': 0,
  '%': 0,
  hPa: 0,
  min: 0,
  'W/m²': 0,
  cm: 0,
  'particles/m³': 0,
};

/**
 * Rounds `value` to `decimals` places by shifting the decimal point through
 * string/exponential notation rather than `value * 10 ** decimals`. Plain
 * multiplication is susceptible to IEEE-754 representation error — e.g.
 * `0.15 * 10 === 1.4999999999999998`, which `Math.round` would floor to `1`
 * (giving `0.1` instead of the correct `0.2`). Parsing `'0.15e1'` sidesteps
 * that specific artifact — it's the value you'd get from writing the shifted
 * literal directly, without the extra rounding error `* 10` introduces —
 * though it's still an IEEE-754 double under the hood, not infinite precision.
 *
 * Rounds the absolute value and restores the sign afterward so exact
 * half-steps round away from zero symmetrically in both directions — plain
 * `Math.round` on a negative shifted value rounds toward +Infinity (e.g.
 * `Math.round(-23.5) === -23`), which would otherwise make `-2.35` round to
 * `-2.3` while `2.35` rounds to `2.4`. Callers must only pass finite values.
 */
function roundToDecimals(value: number, decimals: number): number {
  const sign = value < 0 ? -1 : 1;
  const [coefficient, exponent] = Math.abs(value).toString().split('e');
  const shifted = Number(`${coefficient}e${(exponent ? Number(exponent) : 0) + decimals}`);
  const rounded = Math.round(shifted);
  const [roundedCoefficient, roundedExponent] = rounded.toString().split('e');
  const result = Number(
    `${roundedCoefficient}e${(roundedExponent ? Number(roundedExponent) : 0) - decimals}`
  );
  return sign * result;
}

/**
 * Rounds a single value to the decimal precision configured for `unit`.
 * Unknown units (not present in {@link UNIT_DECIMALS}) and non-finite values
 * (`NaN`, `Infinity`, `-Infinity` — e.g. via the `Number()` coercion
 * `parseNumeric` uses upstream) are returned unchanged.
 *
 * @param value - Raw numeric measurement
 * @param unit - Exact unit string as emitted in tool output (e.g. `'°C'`)
 * @returns The value rounded to the unit's configured decimal places
 */
export function roundByUnit(value: number, unit: string): number {
  if (!Number.isFinite(value)) return value;
  const decimals = UNIT_DECIMALS[unit];
  if (decimals === undefined) return value;
  return roundToDecimals(value, decimals);
}

/** Rounds a nullable measurement value by unit; `null` passes through as `null`. */
export function roundNullable(value: number | null, unit: string): number | null {
  return value === null ? null : roundByUnit(value, unit);
}

/** Rounds an optional measurement value by unit; `undefined` passes through as `undefined`. */
export function roundOptional(value: number | undefined, unit: string): number | undefined {
  return value === undefined ? undefined : roundByUnit(value, unit);
}
