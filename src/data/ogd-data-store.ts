/**
 * Disk-based CSV cache for MeteoSwiss OGD data.
 * Downloads CSV files, caches them on disk with TTL-based refresh,
 * and returns parsed rows.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fetchWithRetry } from '../support/http-communication.js';
import { parseCsv, decodeLatinBuffer, type CsvRow } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';

/** Cache TTLs in milliseconds */
export const CACHE_TTL = {
  realtime: Number(process.env.OGD_CACHE_TTL_REALTIME) || 60_000,
  forecast: Number(process.env.OGD_CACHE_TTL_FORECAST) || 3_600_000,
  metadata: Number(process.env.OGD_CACHE_TTL_METADATA) || 86_400_000,
  climate: Number(process.env.OGD_CACHE_TTL_CLIMATE) || 604_800_000,
} as const;

export type CacheTier = keyof typeof CACHE_TTL;

const CACHE_DIR = process.env.OGD_CACHE_DIR || path.join(os.tmpdir(), 'meteoswiss-ogd');

/**
 * Get parsed CSV data from the OGD data store.
 * Downloads and caches on first request; serves from disk cache on subsequent requests.
 *
 * @param url - Direct download URL for the CSV file
 * @param cacheKey - Unique key for disk cache (e.g., "forecasts/tre200dx.csv")
 * @param tier - Cache TTL tier
 * @returns Parsed CSV rows
 */
export async function getCsvData(
  url: string,
  cacheKey: string,
  tier: CacheTier
): Promise<CsvRow[]> {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  const ttl = CACHE_TTL[tier];

  // Check disk cache
  try {
    const stat = await fs.stat(cachePath);
    const age = Date.now() - stat.mtimeMs;
    if (age < ttl) {
      debugData('[ogd-store] Cache hit for %s (age: %dms)', cacheKey, Math.round(age));
      const buffer = await fs.readFile(cachePath);
      return parseCsv(decodeLatinBuffer(buffer));
    }
    debugData(
      '[ogd-store] Cache stale for %s (age: %dms, ttl: %dms)',
      cacheKey,
      Math.round(age),
      ttl
    );
  } catch {
    debugData('[ogd-store] Cache miss for %s', cacheKey);
  }

  // Download fresh data
  debugData('[ogd-store] Downloading %s', url);
  const text = await fetchWithRetry(url, { useCache: false, timeout: 60_000 });

  // Write to disk cache atomically
  const dir = path.dirname(cachePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${cachePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, text, 'utf-8');
  await fs.rename(tmpPath, cachePath);
  debugData('[ogd-store] Cached %d bytes to %s', text.length, cacheKey);

  return parseCsv(text);
}

/**
 * Get raw text data from the OGD data store (for metadata CSVs that need Latin1 decoding).
 */
export async function getRawCsvData(
  url: string,
  cacheKey: string,
  tier: CacheTier
): Promise<CsvRow[]> {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  const ttl = CACHE_TTL[tier];

  try {
    const stat = await fs.stat(cachePath);
    if (Date.now() - stat.mtimeMs < ttl) {
      const buffer = await fs.readFile(cachePath);
      return parseCsv(decodeLatinBuffer(buffer));
    }
  } catch {
    // cache miss
  }

  // Download as binary to handle encoding
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const dir = path.dirname(cachePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${cachePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, cachePath);

  return parseCsv(decodeLatinBuffer(buffer));
}
