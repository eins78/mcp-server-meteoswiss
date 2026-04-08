/**
 * Lightweight STAC API client for MeteoSwiss OGD data on data.geo.admin.ch.
 * Browses collections, resolves items, and returns asset download URLs.
 * Supports test fixtures when USE_TEST_FIXTURES=true.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fetchJson } from '../support/http-communication.js';
import { debugData } from '../support/logging.js';
import { USE_TEST_FIXTURES, OGD_FIXTURES_ROOT } from '../support/test-fixtures.js';
import {
  StacCollectionSchema,
  StacItemCollectionSchema,
  type StacCollection,
  type StacItem,
} from '../schemas/ogd-shared.js';

const STAC_BASE = 'https://data.geo.admin.ch/api/stac/v1';

/** Map collection IDs to fixture file names */
const COLLECTION_FIXTURES: Record<string, string> = {
  'ch.meteoschweiz.ogd-local-forecasting': 'collection-local-forecasting.json',
  'ch.meteoschweiz.ogd-smn': 'collection-ogd-smn.json',
  'ch.meteoschweiz.ogd-smn-precip': 'collection-ogd-smn-precip.json',
  'ch.meteoschweiz.ogd-nbcn': 'collection-ogd-nbcn.json',
  'ch.meteoschweiz.ogd-nbcn-precip': 'collection-ogd-nbcn-precip.json',
  'ch.meteoschweiz.ogd-obs': 'collection-ogd-obs.json',
  'ch.meteoschweiz.ogd-pollen': 'collection-pollen.json',
};

const ITEMS_FIXTURES: Record<string, string> = {
  'ch.meteoschweiz.ogd-local-forecasting': 'items-local-forecasting.json',
  'ch.meteoschweiz.ogd-smn': 'items-ogd-smn.json',
};

/**
 * Get collection metadata including asset URLs for metadata CSVs.
 *
 * @param collectionId - STAC collection identifier
 * @returns Collection metadata with assets
 */
export async function getCollection(collectionId: string): Promise<StacCollection> {
  debugData('[ogd-stac] Fetching collection: %s', collectionId);

  if (USE_TEST_FIXTURES) {
    const fixture = COLLECTION_FIXTURES[collectionId];
    if (fixture) {
      const data = JSON.parse(
        await fs.readFile(path.join(OGD_FIXTURES_ROOT, 'stac', fixture), 'utf-8')
      );
      return StacCollectionSchema.parse(data);
    }
  }

  const url = `${STAC_BASE}/collections/${collectionId}`;
  const raw = await fetchJson(url);
  return StacCollectionSchema.parse(raw);
}

/**
 * Get the most recent item in a collection (e.g., latest forecast run).
 * The swisstopo STAC API does not reliably sort by datetime, so we fetch
 * recent items and pick the one with the latest ID (IDs are date-based).
 *
 * @param collectionId - STAC collection identifier
 * @returns Latest item with assets
 */
export async function getLatestItem(collectionId: string): Promise<StacItem> {
  debugData('[ogd-stac] Fetching items for: %s', collectionId);

  let parsed;
  if (USE_TEST_FIXTURES) {
    const fixture = ITEMS_FIXTURES[collectionId];
    if (fixture) {
      const data = JSON.parse(
        await fs.readFile(path.join(OGD_FIXTURES_ROOT, 'stac', fixture), 'utf-8')
      );
      parsed = StacItemCollectionSchema.parse(data);
    }
  }

  if (!parsed) {
    const url = `${STAC_BASE}/collections/${collectionId}/items?limit=10`;
    const raw = await fetchJson(url);
    parsed = StacItemCollectionSchema.parse(raw);
  }

  if (parsed.features.length === 0) {
    throw new Error(`No items found in collection ${collectionId}`);
  }
  // Pick the item with the lexicographically latest ID that has assets
  const withAssets = parsed.features.filter((f) => Object.keys(f.assets).length > 0);
  if (withAssets.length === 0) {
    throw new Error(`No items with assets found in collection ${collectionId}`);
  }
  const sorted = withAssets.sort((a, b) => b.id.localeCompare(a.id));
  const latest = sorted[0];
  if (!latest) {
    throw new Error(`No items with assets found in collection ${collectionId}`);
  }
  debugData(
    '[ogd-stac] Latest item: %s (from %d items, %d with assets)',
    latest.id,
    parsed.features.length,
    withAssets.length
  );
  return latest;
}

/**
 * Resolve the download URL for a specific asset within a STAC item.
 *
 * @param item - STAC item containing assets
 * @param assetKey - Key of the asset to resolve
 * @returns Direct download URL for the asset
 */
export function resolveAssetUrl(item: StacItem, assetKey: string): string {
  const asset = item.assets[assetKey];
  if (!asset) {
    throw new Error(
      `Asset "${assetKey}" not found in item "${item.id}". Available: ${Object.keys(item.assets).slice(0, 5).join(', ')}...`
    );
  }
  return asset.href;
}
