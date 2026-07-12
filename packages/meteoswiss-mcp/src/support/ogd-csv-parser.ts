/**
 * CSV parser for MeteoSwiss OGD data files.
 * Wraps csv-parse/sync with MeteoSwiss-specific configuration:
 * semicolon delimiters, RFC 4180 quoting, and null mapping for missing values.
 */

import { parse } from 'csv-parse/sync';
import { debugData } from './logging.js';

/** A parsed CSV row as a record of string keys to string or null values */
export type CsvRow = Record<string, string | null>;

/**
 * Parse a MeteoSwiss CSV string into typed rows.
 * MeteoSwiss uses semicolon delimiters with missing values as '-' or empty.
 * Handles RFC 4180 quoted fields (descriptions may contain embedded semicolons).
 *
 * @param csvText - Raw CSV text content
 * @param filter - Optional predicate to filter rows during parsing (avoids allocating unneeded rows)
 * @returns Array of parsed rows as key-value objects
 */
export function parseCsv(csvText: string, filter?: (row: CsvRow) => boolean): CsvRow[] {
  if (!csvText.trim()) return [];

  const records: CsvRow[] = parse(csvText, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    cast: (value: string): string | null => (value === '' || value === '-' ? null : value),
    on_record: filter
      ? (record: CsvRow): CsvRow | null => (filter(record) ? record : null)
      : undefined,
  }) as CsvRow[];

  debugData('[ogd-csv] Parsed %d data rows', records.length);
  return records;
}

/**
 * Parse a numeric value from a CSV cell, returning null for missing data.
 *
 * Uses `Number.isFinite`, so the non-finite forms `Number()` would otherwise
 * accept — `Infinity`, `-Infinity`, and overflow like `1e309` (→ `Infinity`) —
 * are rejected as null rather than flowing into measurement objects, where
 * `Infinity` JSON-serializes to `null` or trips the SDK's output validation. — FUN-18.
 *
 * @param value - Raw string value from a CSV cell, or null
 * @returns Parsed finite number, or null if the value is missing or not a finite number
 */
export function parseNumeric(value: string | null): number | null {
  if (value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
