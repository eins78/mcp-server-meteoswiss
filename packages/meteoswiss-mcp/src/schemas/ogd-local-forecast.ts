/**
 * Zod schemas for the getLocalForecast MCP tool.
 */

import { z } from 'zod';

export const GetLocalForecastParamsSchema = z.object({
  location: z
    .string()
    .min(1)
    .describe(
      'Swiss location: postal code (e.g., "8001"), station abbreviation (e.g., "SMA"), or place name (e.g., "Zurich")'
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

/**
 * A single hour's readings across every hourly series (unified per-hour object — "Shape B",
 * chosen over parallel per-parameter arrays by eval evidence; see
 * packages/meteoswiss-forecast-evals/docs/results/2026-07-09-forecast-json-comprehension.md
 * and packages/meteoswiss-forecast-evals/docs/results/2026-07-11-hourly-multiseries-shape-refinement.md
 * for the gust/all-flat follow-up).
 * Each field is independently nullable — an hour is included whenever at least one series has
 * a reading for it, even if others are missing for that specific hour.
 */
export type HourlyEntry = {
  /** ISO 8601 timestamp with UTC offset, in local Europe/Zurich time (e.g. "2026-03-28T09:00:00+01:00") */
  time: string;
  /** Temperature at this hour, in °C */
  temperature_c: number | null;
  /** Precipitation sum for this hour, in mm */
  precip_mm: number | null;
  /** Sunshine duration within this hour, in minutes */
  sunshine_minutes: number | null;
  /** Mean wind speed for this hour, in km/h */
  wind_kmh: number | null;
  /** Peak wind gust for this hour, in km/h */
  wind_gust_kmh: number | null;
};

/** Daily forecast summary for one day */
export type DailyForecast = {
  /** Local Europe/Zurich calendar date (YYYY-MM-DD) for postal codes/mountain points; the station data source's native daily date for weather stations. */
  date: string;
  weather: string | null;
  weather_icon_url: string | null;
  /**
   * Daily temperature min/max, °C. For postal codes/mountain points, derived from the same
   * hourly series as `hourly` (so they cannot disagree). For weather stations, MeteoSwiss's
   * official daily aggregate (`tre200dn`/`tre200dx`) — may capture sub-hourly extremes the
   * hourly series alone wouldn't show.
   */
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  /**
   * Daily precipitation total, mm. For postal codes/mountain points, the sum of `hourly`'s
   * `precip_mm` (cannot disagree with the series). For weather stations, MeteoSwiss's official
   * daily aggregate (`rka150d0`) — a *different* product than re-summing the station's hourly
   * series, so it may legitimately NOT equal `sum(hourly precip_mm)` for stations. This is
   * expected, not a data inconsistency.
   */
  precipitation_total_mm: number | null;
  /** Daily sunshine total, minutes. Derived from `hourly`'s `sunshine_minutes` for every point type (no official daily aggregate exists for this parameter). */
  sunshine_total_minutes: number | null;
  /** Daily mean wind speed, km/h. Derived from `hourly`'s `wind_kmh` for every point type. */
  wind_avg_kmh: number | null;
  /** Daily peak wind gust, km/h. Derived from `hourly`'s `wind_gust_kmh` for every point type. */
  wind_gust_max_kmh: number | null;
  /**
   * Per-hour breakdown across every series, keyed to the local Europe/Zurich calendar day this
   * `date` represents (each entry's `time` always falls within this day). `null` when no hourly
   * breakdown exists for this location at all (a total data gap); `[]` when the point type
   * supports hourly data but none was available for this specific day. A dry/calm/sunless hour
   * still appears with its measured 0 value — 0-valued readings are kept, not omitted.
   */
  hourly: HourlyEntry[] | null;
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
