/**
 * Zod schemas for the getLocalForecast MCP tool.
 */

import { z } from 'zod';

export const GetLocalForecastParamsSchema = z.object({
  location: z
    .string()
    .min(1)
    .describe(
      'Swiss location: postal code (e.g., "8001"), station abbreviation (e.g., "ZUE"), or place name (e.g., "Zurich")'
    ),
  days: z
    .number()
    .int()
    .min(1)
    .max(9)
    .optional()
    .default(5)
    .describe('Number of forecast days (1-9, default 5)'),
});
export type GetLocalForecastParams = z.infer<typeof GetLocalForecastParamsSchema>;

/** Daily forecast summary for one day */
export type DailyForecast = {
  date: string;
  temperature: { min: number | null; max: number | null; unit: string };
  precipitation: { total: number | null; unit: string };
  weather_icon: number | null;
};

/** Full forecast response */
export type LocalForecastResponse = {
  location: {
    name: string;
    type: string;
    elevation: number;
    coordinates: { lat: number; lon: number };
  };
  generated: string;
  forecast: DailyForecast[];
  source: string;
};
