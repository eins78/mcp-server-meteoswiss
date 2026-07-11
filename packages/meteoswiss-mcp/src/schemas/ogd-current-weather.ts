/**
 * Zod schemas for the getCurrentWeather MCP tool.
 */

import { z } from 'zod';
import { CoordinatesSchema } from './ogd-shared.js';

/** Coordinates with Swiss bounding-box validation for tool input */
export const CoordinatesParamSchema = CoordinatesSchema.extend({
  lat: z.number().min(45.5).max(48).describe('WGS84 latitude'),
  lon: z.number().min(5.9).max(10.6).describe('WGS84 longitude'),
}).describe('WGS84 coordinates (alternative to station name)');

export const GetCurrentWeatherParamsSchema = z.object({
  station: z
    .string()
    .min(1)
    .max(200, { message: 'Station must be at most 200 characters.' })
    .optional()
    .describe(
      'Swiss weather station or location: name (e.g., "Zurich"), abbreviation (e.g., "SMA"), or address (e.g., "Bahnhofplatz 1 Bern"). Provide either this or `coordinates`; if both are given, `coordinates` takes precedence.'
    ),
  coordinates: CoordinatesParamSchema.optional(),
});
export type GetCurrentWeatherParams = z.infer<typeof GetCurrentWeatherParamsSchema>;

/** Measurement value with unit (only present when data is available) */
export const MeasurementValueSchema = z.object({
  value: z.number(),
  unit: z.string(),
});
export type MeasurementValue = z.infer<typeof MeasurementValueSchema>;

/** Current weather response */
export const CurrentWeatherResponseSchema = z.object({
  station: z.object({
    name: z.string().describe('Station name'),
    abbreviation: z.string().describe('Official station abbreviation (e.g. "SMA")'),
    elevation: z.number().describe('Elevation in metres above sea level'),
    coordinates: CoordinatesSchema.describe('WGS84 coordinates of the station'),
    municipality: z.string().optional(),
    canton: z.string().optional().describe('Canton abbreviation (e.g. "ZH")'),
    distance_km: z
      .number()
      .optional()
      .describe(
        'Distance from the queried location to this station, km (when resolved by proximity)'
      ),
    network: z
      .string()
      .optional()
      .describe('Measurement network ("smn" full weather, "smn-precip" precipitation-only)'),
  }),
  timestamp: z.string().describe('Measurement timestamp (ISO 8601)'),
  measurements: z
    .object({
      temperature: MeasurementValueSchema.optional(),
      humidity: MeasurementValueSchema.optional(),
      dew_point: MeasurementValueSchema.optional(),
      precipitation: MeasurementValueSchema.optional(),
      wind_speed: MeasurementValueSchema.optional(),
      wind_gust: MeasurementValueSchema.optional(),
      wind_direction: MeasurementValueSchema.optional(),
      sunshine: MeasurementValueSchema.optional(),
      radiation: MeasurementValueSchema.optional(),
      pressure_station: MeasurementValueSchema.optional(),
      pressure_sea_level: MeasurementValueSchema.optional(),
      snow_depth: MeasurementValueSchema.optional(),
    })
    .describe('Each measurement is present only when the station reports it'),
  visual_observations: z
    .object({
      date: z.string(),
      cloud_cover_percent: z.number().optional(),
      is_clear_day: z.boolean().optional(),
      is_overcast_day: z.boolean().optional(),
      has_rain: z.boolean().optional(),
      has_rain_and_snow: z.boolean().optional(),
      has_snowfall: z.boolean().optional(),
      has_hail: z.boolean().optional(),
      has_fog: z.boolean().optional(),
      has_snow_coverage: z.boolean().optional(),
    })
    .optional()
    .describe(
      'Visual observations (only for 8 OBS stations: ALT, BAS, CHU, GSB, JUN, SAE, SIO, SMA)'
    ),
  source: z.string().describe('Data attribution'),
});
export type CurrentWeatherResponse = z.infer<typeof CurrentWeatherResponseSchema>;
