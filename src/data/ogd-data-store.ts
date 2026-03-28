/**
 * Disk-based CSV cache for MeteoSwiss OGD data.
 * Downloads CSV files, caches them on disk with TTL-based refresh,
 * and returns parsed rows.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fetchWithRetry } from '../support/http-communication.js';
import { parseCsv, type CsvRow } from '../support/ogd-csv-parser.js';
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
 * Get parsed CSV data from the OGD data store.
 * Downloads and caches on first request; serves from disk cache on subsequent requests.
 * Raw bytes are cached to preserve original encoding; decoding happens at read time.
 *
 * @param url - Direct download URL for the CSV file
 * @param cacheKey - Unique key for disk cache (e.g., "forecasts/tre200dx.csv")
 * @param tier - Cache TTL tier
 * @param filter - Optional row filter to reduce memory for large CSVs
 * @returns Parsed CSV rows
 */
export async function getCsvData(
  url: string,
  cacheKey: string,
  tier: CacheTier,
  filter?: (row: CsvRow) => boolean
): Promise<CsvRow[]> {
  const cachePath = path.join(CACHE_DIR, cacheKey);
  const ttl = CACHE_TTL[tier];

  // Check disk cache
  try {
    const stat = await fs.stat(cachePath);
    const age = Date.now() - stat.mtimeMs;
    if (age < ttl) {
      debugData('[ogd-store] Cache hit for %s (age: %dms)', cacheKey, Math.round(age));
      const text = await fs.readFile(cachePath, 'utf-8');
      return parseCsv(text, filter);
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

  // Write to disk cache atomically, store as UTF-8
  await writeToDiskCache(cachePath, text);
  debugData('[ogd-store] Cached %d bytes to %s', text.length, cacheKey);

  return parseCsv(text, filter);
}
