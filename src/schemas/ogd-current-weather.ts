/**
 * Zod schemas for the getCurrentWeather MCP tool.
 */

import { z } from 'zod';

export const GetCurrentWeatherParamsSchema = z.object({
  station: z
    .string()
    .min(1)
    .describe(
      'Swiss weather station: name (e.g., "Zurich") or abbreviation (e.g., "SMA")'
    ),
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
  source: string;
};
