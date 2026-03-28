/**
 * Lightweight STAC API client for MeteoSwiss OGD data on data.geo.admin.ch.
 * Browses collections, resolves items, and returns asset download URLs.
 */

import { fetchJson } from '../support/http-communication.js';
import { debugData } from '../support/logging.js';
import {
  StacCollectionSchema,
  StacItemCollectionSchema,
  type StacCollection,
  type StacItem,
} from '../schemas/ogd-shared.js';

const STAC_BASE = 'https://data.geo.admin.ch/api/stac/v1';

/**
 * Get collection metadata including asset URLs for metadata CSVs.
 */
export async function getCollection(collectionId: string): Promise<StacCollection> {
  const url = `${STAC_BASE}/collections/${collectionId}`;
  debugData('[ogd-stac] Fetching collection: %s', collectionId);
  const raw = await fetchJson(url);
  return StacCollectionSchema.parse(raw);
}

/**
 * Get the most recent item in a collection (e.g., latest forecast run).
 * Items are sorted by datetime descending by default.
 */
export async function getLatestItem(collectionId: string): Promise<StacItem> {
  const url = `${STAC_BASE}/collections/${collectionId}/items?limit=1`;
  debugData('[ogd-stac] Fetching latest item for: %s', collectionId);
  const raw = await fetchJson(url);
  const parsed = StacItemCollectionSchema.parse(raw);
  if (parsed.features.length === 0) {
    throw new Error(`No items found in collection ${collectionId}`);
  }
  debugData('[ogd-stac] Latest item: %s', parsed.features[0]!.id);
  return parsed.features[0]!;
}

/**
 * Resolve the download URL for a specific asset within a STAC item.
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
