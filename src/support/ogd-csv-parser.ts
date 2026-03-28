/**
 * CSV parser for MeteoSwiss OGD data files.
 * Handles semicolon delimiters and Latin1/Windows-1252 encoding.
 */

import { debugData } from './logging.js';

/** A parsed CSV row as a record of string keys to string or null values */
export type CsvRow = Record<string, string | null>;

/**
 * Parse a MeteoSwiss CSV string into typed rows.
 * MeteoSwiss uses semicolon delimiters with missing values as '-' or empty.
 *
 * @param csvText - Raw CSV text content
 * @param filter - Optional predicate to filter rows during parsing (avoids allocating unneeded rows)
 * @returns Array of parsed rows as key-value objects
 */
export function parseCsv(csvText: string, filter?: (row: CsvRow) => boolean): CsvRow[] {
  const lines = csvText.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const headerLine = lines[0];
  if (!headerLine) {
    return [];
  }
  const headers = headerLine.split(';').map((h) => h.trim());
  debugData('[ogd-csv] Parsed %d headers: %s', headers.length, headers.join(', '));

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = line.split(';');
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (!header) continue;
      const raw = values[j]?.trim() ?? '';
      row[header] = raw === '' || raw === '-' ? null : raw;
    }
    if (!filter || filter(row)) {
      rows.push(row);
    }
  }

  debugData('[ogd-csv] Parsed %d data rows (from %d lines)', rows.length, lines.length - 1);
  return rows;
}

/**
 * Parse a numeric value from a CSV cell, returning null for missing data.
 *
 * @param value - Raw string value from a CSV cell, or null
 * @returns Parsed number, or null if the value is missing or not numeric
 */
export function parseNumeric(value: string | null): number | null {
  if (value === null) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}
