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

/** A single hourly precipitation reading within a day */
export type HourlyPrecip = {
  /** ISO 8601 timestamp with UTC offset, in local Europe/Zurich time (e.g. "2026-03-28T09:00:00+01:00") */
  time: string;
  /** Precipitation sum for that hour, in mm */
  value: number;
};

/** Daily forecast summary for one day */
export type DailyForecast = {
  /** Local Europe/Zurich calendar date (YYYY-MM-DD) for postal codes/mountain points; the station data source's native daily date for weather stations. */
  date: string;
  weather: string | null;
  weather_icon_url: string | null;
  temperature: { min: number | null; max: number | null; unit: string };
  precipitation: {
    total: number | null;
    unit: string;
    /**
     * Per-hour precipitation breakdown, keyed to the local Europe/Zurich calendar
     * day this `date` represents (each entry's `time` always falls within this day).
     * `null` when not available for this location's point type (currently: weather
     * stations). A dry day still returns a non-empty array — 0mm hours are kept, not
     * omitted; an empty array means no hourly readings were available for the day at all.
     */
    hourly: HourlyPrecip[] | null;
  };
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
