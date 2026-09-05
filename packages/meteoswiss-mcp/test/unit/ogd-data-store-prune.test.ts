import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * The cache prune reclaims empty directories.
 *
 * Eviction only ever deleted files, so the dated `forecasts/<item-id>/` folders
 * accumulated one per day forever — 42 of 43 on the production container were
 * empty husks. `removeEmptyDirs` now runs at the end of every prune pass.
 *
 * `pruneDiskCache` is internal, so this drives it the way production does: via a
 * successful `getCsvData`, which fires a prune after writing.
 */

type GetCsvData = typeof import('../../src/data/ogd-data-store.js').getCsvData;

let getCsvData: GetCsvData;
let server: http.Server;
let baseUrl: string;
let cacheRoot: string;

const CSV = 'reference_timestamp;point_id;point_type_id;tre200h0\n05.09.2026 10:00;100;2;12.3\n';

beforeAll(async () => {
  cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ogd-prune-'));
  process.env.USE_TEST_FIXTURES = 'false';
  process.env.OGD_CACHE_DIR = cacheRoot;

  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' });
    res.end(CSV);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  ({ getCsvData } = await import('../../src/data/ogd-data-store.js'));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(cacheRoot, { recursive: true, force: true });
});

describe('pruneDiskCache — empty directory reclamation', () => {
  it('removes stale empty dated directories but keeps the one holding data', async () => {
    // Three days' worth of husks, exactly as production accumulated them.
    const husks = ['20260724-ch', '20260725-ch', '20260726-ch'];
    for (const husk of husks) {
      await fs.mkdir(path.join(cacheRoot, 'forecasts', husk), { recursive: true });
    }

    const rows = await getCsvData(
      `${baseUrl}/tre200h0.csv`,
      'forecasts/20260905-ch/vnut12.lssw.202609051000.tre200h0.csv',
      'forecast'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tre200h0).toBe('12.3');

    // pruneDiskCache is fired unawaited after the write; give it a turn.
    await new Promise((resolve) => setTimeout(resolve, 250));

    for (const husk of husks) {
      await expect(fs.stat(path.join(cacheRoot, 'forecasts', husk))).rejects.toThrow(/ENOENT/);
    }

    // The directory that actually holds the cached file must survive.
    const kept = await fs.readdir(path.join(cacheRoot, 'forecasts', '20260905-ch'));
    expect(kept).toContain('vnut12.lssw.202609051000.tre200h0.csv');
  });
});
