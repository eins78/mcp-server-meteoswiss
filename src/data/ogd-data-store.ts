/**
 * Disk-based CSV cache for MeteoSwiss OGD data.
 * Downloads CSV files, caches them on disk with TTL-based refresh,
 * and returns parsed rows.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fetchWithRetry, fetchBinary } from '../support/http-communication.js';
import { parseCsv, type CsvRow } from '../support/ogd-csv-parser.js';
import { debugData } from '../support/logging.js';

const LATIN1_DECODER = new TextDecoder('latin1');

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
 * Write data to disk cache atomically (write to .tmp then rename).
 */
async function writeToDiskCache(cachePath: string, data: string | Buffer): Promise<void> {
  const dir = path.dirname(cachePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${cachePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, data);
  await fs.rename(tmpPath, cachePath);
}

/**
 * Read a cached file, decoding it as UTF-8 text.
 * Returns null if the cache entry is missing or stale.
 */
async function readCacheUtf8(cachePath: string, ttl: number): Promise<string | null> {
  try {
    const stat = await fs.stat(cachePath);
    const age = Date.now() - stat.mtimeMs;
    if (age < ttl) {
      return await fs.readFile(cachePath, 'utf-8');
    }
  } catch {
    // cache miss
  }
  return null;
}

/**
 * Get parsed CSV data, fetching as UTF-8 text (for CSVs served with proper charset).
 *
 * @param url - Direct download URL for the CSV file
 * @param cacheKey - Unique key for disk cache
 * @param tier - Cache TTL tier
 * @param filter - Optional row filter to reduce memory for large CSVs
 */
export async function getCsvData(
  url: string,
  cacheKey: string,
  tier: CacheTier,
  filter?: (row: CsvRow) => boolean
): Promise<CsvRow[]> {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  const ttl = CACHE_TTL[tier];

  const cached = await readCacheUtf8(cachePath, ttl);
  if (cached !== null) {
    debugData('[ogd-store] Cache hit for %s', cacheKey);
    return parseCsv(cached, filter);
  }

  debugData('[ogd-store] Downloading %s', url);
  const text = await fetchWithRetry(url, { useCache: false, timeout: 60_000 });
  await writeToDiskCache(cachePath, text);
  debugData('[ogd-store] Cached %d bytes to %s', text.length, cacheKey);
  return parseCsv(text, filter);
}

/**
 * Get parsed CSV data, fetching as binary and decoding from Latin1.
 * MeteoSwiss metadata CSVs are served without charset header and are Latin1-encoded.
 *
 * @param url - Direct download URL for the CSV file
 * @param cacheKey - Unique key for disk cache
 * @param tier - Cache TTL tier
 * @param filter - Optional row filter
 */
export async function getLatin1CsvData(
  url: string,
  cacheKey: string,
  tier: CacheTier,
  filter?: (row: CsvRow) => boolean
): Promise<CsvRow[]> {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  const ttl = CACHE_TTL[tier];

  // Cache stores the decoded UTF-8 text
  const cached = await readCacheUtf8(cachePath, ttl);
  if (cached !== null) {
    debugData('[ogd-store] Cache hit for %s', cacheKey);
    return parseCsv(cached, filter);
  }

  debugData('[ogd-store] Downloading (binary/Latin1) %s', url);
  const buffer = await fetchBinary(url, { timeout: 60_000 });
  const text = LATIN1_DECODER.decode(buffer);
  await writeToDiskCache(cachePath, text);
  debugData('[ogd-store] Cached %d bytes (decoded) to %s', text.length, cacheKey);
  return parseCsv(text, filter);
}
