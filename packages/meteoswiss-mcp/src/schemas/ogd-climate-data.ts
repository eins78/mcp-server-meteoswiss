/**
 * Zod schemas for the meteoswissClimateData MCP tool.
 */

import { z } from 'zod';
import { CoordinatesSchema } from './ogd-shared.js';

/** Coordinates with Swiss bounding-box validation for tool input */
const CoordinatesParamSchema = CoordinatesSchema.extend({
  lat: z.number().min(45.5).max(48).describe('WGS84 latitude'),
  lon: z.number().min(5.9).max(10.6).describe('WGS84 longitude'),
}).describe('WGS84 coordinates (alternative to station name)');

export const CLIMATE_RESOLUTIONS = ['daily', 'monthly', 'yearly'] as const;
export type ClimateResolution = (typeof CLIMATE_RESOLUTIONS)[number];

export const GetClimateDataParamsSchema = z.object({
  station: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Climate station name or abbreviation (e.g., "Zurich", "BAS", "Davos"). Part of the National Basic Climatic Network (29 climate + 46 precipitation stations).'
    ),
  coordinates: CoordinatesParamSchema.optional(),
  resolution: z
    .enum(CLIMATE_RESOLUTIONS)
    .default('monthly')
    .describe(
      'Data resolution: daily (temp min/max/mean), monthly (full climate summary), yearly (annual summary)'
    ),
  start_date: z
    .string()
    .optional()
    .describe('Start date filter (YYYY-MM-DD). Only rows on or after this date are returned.'),
  end_date: z
    .string()
    .optional()
    .describe('End date filter (YYYY-MM-DD). Only rows on or before this date are returned.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(30)
    .describe('Maximum number of data rows to return (default 30)'),
});
export type GetClimateDataParams = z.infer<typeof GetClimateDataParamsSchema>;

/** A single climate measurement row */
export type ClimateMeasurement = {
  date: string;
  temperature_mean?: number;
  temperature_max?: number;
  temperature_min?: number;
  precipitation?: number;
  sunshine_duration_min?: number;
  radiation_w_m2?: number;
  wind_speed_m_s?: number;
  pressure_hpa?: number;
  frost_days?: number;
  summer_days?: number;
  heat_days?: number;
  ice_days?: number;
  tropical_nights?: number;
  rain_days?: number;
};

/** Climate data response */
export type ClimateDataResponse = {
  station: {
    name: string;
    abbreviation: string;
    elevation: number;
    coordinates: { lat: number; lon: number };
    canton?: string;
    distance_km?: number;
    network: string;
  };
  resolution: ClimateResolution;
  data: ClimateMeasurement[];
  source: string;
};
