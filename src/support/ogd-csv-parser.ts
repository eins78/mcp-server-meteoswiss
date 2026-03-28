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
 * @returns Array of parsed rows as key-value objects
 */
export function parseCsv(csvText: string): CsvRow[] {
  const lines = csvText.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0]!.split(';').map((h) => h.trim());
  debugData('[ogd-csv] Parsed %d headers: %s', headers.length, headers.join(', '));

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split(';');
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      const raw = values[j]?.trim() ?? '';
      row[headers[j]!] = raw === '' || raw === '-' ? null : raw;
    }
    rows.push(row);
  }

  debugData('[ogd-csv] Parsed %d data rows', rows.length);
  return rows;
}

/**
 * Decode a Buffer from Latin1/Windows-1252 encoding to a UTF-8 string.
 * MeteoSwiss CSVs use Latin1 (forecast data) or Windows-1252 (station data).
 */
export function decodeLatinBuffer(buffer: Buffer): string {
  return new TextDecoder('latin1').decode(buffer);
}

/**
 * Parse a numeric value from a CSV cell, returning null for missing data.
 */
export function parseNumeric(value: string | null): number | null {
  if (value === null) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}
