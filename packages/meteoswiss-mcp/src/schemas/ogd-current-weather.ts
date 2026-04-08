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
    .optional()
    .describe(
      'Swiss weather station or location: name (e.g., "Zurich"), abbreviation (e.g., "SMA"), or address (e.g., "Bahnhofplatz 1 Bern")'
    ),
  coordinates: CoordinatesParamSchema.optional(),
});
export type GetCurrentWeatherParams = z.infer<typeof GetCurrentWeatherParamsSchema>;

/** Measurement value with unit (only present when data is available) */
export type MeasurementValue = {
  value: number;
  unit: string;
};

/** Current weather response */
export type CurrentWeatherResponse = {
  station: {
    name: string;
    abbreviation: string;
    elevation: number;
    coordinates: { lat: number; lon: number };
    municipality?: string;
    canton?: string;
    distance_km?: number;
    network?: string;
  };
  timestamp: string;
  measurements: {
    temperature?: MeasurementValue;
    humidity?: MeasurementValue;
    dew_point?: MeasurementValue;
    precipitation?: MeasurementValue;
    wind_speed?: MeasurementValue;
    wind_gust?: MeasurementValue;
    wind_direction?: MeasurementValue;
    sunshine?: MeasurementValue;
    radiation?: MeasurementValue;
    pressure_station?: MeasurementValue;
    pressure_sea_level?: MeasurementValue;
    snow_depth?: MeasurementValue;
  };
  /** Visual observations (only for 8 OBS stations: ALT, BAS, CHU, GSB, JUN, SAE, SIO, SMA) */
  visual_observations?: {
    date: string;
    cloud_cover_percent?: number;
    is_clear_day?: boolean;
    is_overcast_day?: boolean;
    has_rain?: boolean;
    has_rain_and_snow?: boolean;
    has_snowfall?: boolean;
    has_hail?: boolean;
    has_fog?: boolean;
    has_snow_coverage?: boolean;
  };
  source: string;
};
