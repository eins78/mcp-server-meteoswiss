/**
 * Shared Zod schemas and types for MeteoSwiss OGD data.
 * Used across all OGD tools for consistent typing at data boundaries.
 */

import { z } from 'zod';

// --- Language ---

export const OGD_LANGUAGES = ['de', 'fr', 'it', 'en'] as const;
export type OgdLanguage = (typeof OGD_LANGUAGES)[number];
export const OgdLanguageSchema = z.enum(OGD_LANGUAGES);

// --- Coordinates ---

export const CoordinatesSchema = z.object({
  lat: z.number(),
  lon: z.number(),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

// --- Forecast point metadata ---

export const POINT_TYPES = { 1: 'station', 2: 'postal_code', 3: 'mountain' } as const;
export type PointType = (typeof POINT_TYPES)[keyof typeof POINT_TYPES];

/**
 * Map a numeric point_type_id to its human-readable point type name.
 *
 * @param id - The numeric point type identifier from MeteoSwiss data
 * @returns The corresponding point type name, defaulting to 'station'
 */
export function pointTypeFromId(id: number): PointType {
  if (id === 1 || id === 2 || id === 3) {
    return POINT_TYPES[id];
  }
  return 'station';
}

export const ForecastPointSchema = z.object({
  point_id: z.number(),
  point_type_id: z.number(),
  station_abbr: z.string().nullable(),
  postal_code: z.string().nullable(),
  name: z.string(),
  elevation: z.number(),
  coordinates: CoordinatesSchema,
});
export type ForecastPoint = z.infer<typeof ForecastPointSchema>;

// --- STAC API response schemas ---

export const StacAssetSchema = z.object({
  href: z.string(),
  type: z.string().optional(),
  title: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});
export type StacAsset = z.infer<typeof StacAssetSchema>;

export const StacCollectionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  assets: z.record(z.string(), StacAssetSchema).optional(),
});
export type StacCollection = z.infer<typeof StacCollectionSchema>;

export const StacItemSchema = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.unknown()),
  assets: z.record(z.string(), StacAssetSchema),
});
export type StacItem = z.infer<typeof StacItemSchema>;

export const StacItemCollectionSchema = z.object({
  features: z.array(StacItemSchema),
});
export type StacItemCollection = z.infer<typeof StacItemCollectionSchema>;

// --- Collection IDs ---

export const OGD_COLLECTIONS = {
  LOCAL_FORECASTING: 'ch.meteoschweiz.ogd-local-forecasting',
  SMN: 'ch.meteoschweiz.ogd-smn',
  SMN_PRECIP: 'ch.meteoschweiz.ogd-smn-precip',
  SMN_TOWER: 'ch.meteoschweiz.ogd-smn-tower',
  NBCN: 'ch.meteoschweiz.ogd-nbcn',
  POLLEN: 'ch.meteoschweiz.ogd-pollen',
  RADIOSOUNDING: 'ch.meteoschweiz.ogd-radiosounding',
} as const;

// --- Common output ---

export const SOURCE_ATTRIBUTION = 'MeteoSwiss Open Data' as const;

export const StationInfoSchema = z.object({
  name: z.string(),
  abbreviation: z.string().optional(),
  canton: z.string().optional(),
  elevation: z.number(),
  coordinates: CoordinatesSchema,
});
export type StationInfo = z.infer<typeof StationInfoSchema>;
