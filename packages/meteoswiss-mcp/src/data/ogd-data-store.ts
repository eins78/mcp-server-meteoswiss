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
import { USE_TEST_FIXTURES, OGD_FIXTURES_ROOT } from '../support/test-fixtures.js';

const LATIN1_DECODER = new TextDecoder('latin1');

/**
 * Map known URLs to fixture files for test mode.
 * Only the filename portion of the URL is matched against fixtures.
 */
function resolveFixturePath(url: string): string | null {
  if (!USE_TEST_FIXTURES) return null;

  // Map known URL patterns to fixture directories
  if (url.includes('VQHA80.csv')) return path.join(OGD_FIXTURES_ROOT, 'measurements', 'VQHA80.csv');

  // SMN-precip metadata and data (must come BEFORE SMN to avoid 'smn' substring match)
  if (url.includes('meta_stations.csv') && url.includes('smn-precip'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-smn-precip_meta_stations.csv');
  if (url.includes('ogd-smn-precip') && url.includes('_t_recent.csv'))
    return path.join(OGD_FIXTURES_ROOT, 'measurements', 'smn-precip-abe-t-recent.csv');

  // SMN (weather station) metadata
  if (url.includes('meta_stations.csv') && url.includes('smn'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-smn_meta_stations.csv');
  if (url.includes('meta_parameters.csv') && url.includes('smn'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-smn_meta_parameters.csv');

  // NBCN metadata and data (nbcn-precip must come BEFORE nbcn)
  if (url.includes('meta_stations.csv') && url.includes('nbcn-precip'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-nbcn-precip_meta_stations.csv');
  if (url.includes('meta_stations.csv') && url.includes('nbcn'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-nbcn_meta_stations.csv');
  if (url.includes('ogd-nbcn') && url.includes('_m.csv'))
    return path.join(OGD_FIXTURES_ROOT, 'climate', 'nbcn-bas-m.csv');
  if (url.includes('ogd-nbcn') && url.includes('_d_recent.csv'))
    return path.join(OGD_FIXTURES_ROOT, 'climate', 'nbcn-bas-d-recent.csv');

  // OBS (visual observations) data
  if (url.includes('ogd-obs') && url.includes('_d_recent.csv'))
    return path.join(OGD_FIXTURES_ROOT, 'observations', 'obs-sma-d-recent.csv');

  // Pollen metadata and data
  if (url.includes('meta_stations.csv') && url.includes('pollen'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-pollen_meta_stations.csv');
  if (url.includes('meta_parameters.csv') && url.includes('pollen'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-pollen_meta_parameters.csv');
  if (url.includes('ogd-pollen') && url.includes('_d_recent.csv'))
    return path.join(OGD_FIXTURES_ROOT, 'pollen', 'pzh-daily-recent.csv');

  // Forecast metadata
  if (url.includes('meta_point.csv'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-local-forecasting_meta_point.csv');
  if (url.includes('meta_parameters.csv') && url.includes('forecasting'))
    return path.join(OGD_FIXTURES_ROOT, 'metadata', 'ogd-local-forecasting_meta_parameters.csv');

  // Forecast CSVs: match by parameter name
  for (const param of [
    'tre200dx',
    'tre200dn',
    'rka150d0',
    'jp2000d0',
    'tre200h0',
    'rre150h0',
    'jww003i0',
    'sre000h0',
    'fu3010h0',
    'fu3010h1',
  ]) {
    if (url.includes(`.${param}.csv`))
      return path.join(OGD_FIXTURES_ROOT, 'forecasts', `${param}.csv`);
  }

  return null;
}

/**
 * Parse an env var as a number, returning the default if unset.
 * Respects explicit zero (unlike `Number(x) || default` which treats 0 as falsy).
 */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Cache TTLs in milliseconds */
export const CACHE_TTL = {
  realtime: envNumber('OGD_CACHE_TTL_REALTIME', 60_000),
  forecast: envNumber('OGD_CACHE_TTL_FORECAST', 3_600_000),
  metadata: envNumber('OGD_CACHE_TTL_METADATA', 86_400_000),
  climate: envNumber('OGD_CACHE_TTL_CLIMATE', 604_800_000),
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
  // Test fixture support — fail-fast if no fixture matches
  const fixturePath = resolveFixturePath(url);
  if (fixturePath) {
    debugData('[ogd-store] Using fixture: %s', fixturePath);
    const text = await fs.readFile(fixturePath, 'utf-8');
    return parseCsv(text, filter);
  }
  if (USE_TEST_FIXTURES) {
    throw new Error(`No test fixture for URL: ${url}. Add a mapping in resolveFixturePath.`);
  }

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
  // Test fixture support — fail-fast if no fixture matches
  const fixturePath = resolveFixturePath(url);
  if (fixturePath) {
    debugData('[ogd-store] Using fixture: %s', fixturePath);
    const text = await fs.readFile(fixturePath, 'utf-8');
    return parseCsv(text, filter);
  }
  if (USE_TEST_FIXTURES) {
    throw new Error(`No test fixture for URL: ${url}. Add a mapping in resolveFixturePath.`);
  }

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
