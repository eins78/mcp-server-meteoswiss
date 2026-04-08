import { describe, expect, it } from '@jest/globals';
import { splitCsvLine, parseCsv, parseNumeric } from '../../src/support/ogd-csv-parser.js';

describe('splitCsvLine', () => {
  it('should split simple unquoted fields', () => {
    expect(splitCsvLine('a;b;c', ';')).toEqual(['a', 'b', 'c']);
  });

  it('should handle empty fields', () => {
    expect(splitCsvLine('a;;c', ';')).toEqual(['a', '', 'c']);
  });

  it('should handle quoted fields with embedded semicolons', () => {
    expect(splitCsvLine('code;"value; with semicolon";other', ';')).toEqual([
      'code',
      'value; with semicolon',
      'other',
    ]);
  });

  it('should handle escaped double quotes inside quoted fields', () => {
    expect(splitCsvLine('a;"he said ""hello""";b', ';')).toEqual([
      'a',
      'he said "hello"',
      'b',
    ]);
  });

  it('should handle mixed quoted and unquoted fields', () => {
    expect(splitCsvLine('plain;"quoted; value";123;-', ';')).toEqual([
      'plain',
      'quoted; value',
      '123',
      '-',
    ]);
  });

  it('should parse pollen parameter metadata format correctly', () => {
    const line =
      'kaalnud0;"Erle; mittlere Pollenkonzentration";"Aune; concentration pollinique";"Ontano; concentrazione";"Alder; daily average pollen concentration / Alnus";Pollen;Pollen;Pollini;Pollen;D;0;Integer;No/m³';
    const fields = splitCsvLine(line, ';');
    expect(fields).toHaveLength(13);
    expect(fields[0]).toBe('kaalnud0');
    expect(fields[1]).toBe('Erle; mittlere Pollenkonzentration');
    expect(fields[4]).toBe('Alder; daily average pollen concentration / Alnus');
    expect(fields[5]).toBe('Pollen');
    expect(fields[12]).toBe('No/m³');
  });
});

describe('parseCsv', () => {
  it('should parse simple semicolon-delimited CSV', () => {
    const csv = 'name;value\nalpha;1\nbeta;2';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'alpha', value: '1' });
    expect(rows[1]).toEqual({ name: 'beta', value: '2' });
  });

  it('should treat empty strings and dashes as null', () => {
    const csv = 'a;b;c\n1;;-';
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual({ a: '1', b: null, c: null });
  });

  it('should handle quoted fields with embedded semicolons', () => {
    const csv =
      'code;description_de;description_en;unit\n' +
      'kaalnud0;"Erle; tägliche Pollenkonzentration";"Alder; daily pollen concentration";No/m³';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe('kaalnud0');
    expect(rows[0]!.description_de).toBe('Erle; tägliche Pollenkonzentration');
    expect(rows[0]!.description_en).toBe('Alder; daily pollen concentration');
    expect(rows[0]!.unit).toBe('No/m³');
  });

  it('should apply filter predicate', () => {
    const csv = 'name;value\nalpha;1\nbeta;2\nalpha;3';
    const rows = parseCsv(csv, (row) => row.name === 'alpha');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.value).toBe('1');
    expect(rows[1]!.value).toBe('3');
  });

  it('should return empty array for CSV with only a header', () => {
    expect(parseCsv('header_only')).toEqual([]);
  });

  it('should return empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('parseNumeric', () => {
  it('should parse valid numbers', () => {
    expect(parseNumeric('42')).toBe(42);
    expect(parseNumeric('3.14')).toBe(3.14);
    expect(parseNumeric('-1')).toBe(-1);
    expect(parseNumeric('0')).toBe(0);
  });

  it('should return null for non-numeric values', () => {
    expect(parseNumeric('abc')).toBeNull();
  });

  it('should coerce empty string to 0 (callers pass null for missing values)', () => {
    // parseCsv converts empty strings to null before calling parseNumeric,
    // so in practice parseNumeric never receives '' from the pipeline
    expect(parseNumeric('')).toBe(0);
  });

  it('should return null for null input', () => {
    expect(parseNumeric(null)).toBeNull();
  });
});
