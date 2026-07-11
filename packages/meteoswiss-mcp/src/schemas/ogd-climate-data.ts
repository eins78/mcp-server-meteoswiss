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
    .max(200, { message: 'Station must be at most 200 characters.' })
    .optional()
    .describe(
      'Climate station name or abbreviation (e.g., "Zurich", "BAS", "Davos"). Part of the National Basic Climatic Network (29 climate + 46 precipitation stations). Provide either this or `coordinates`; if both are given, `coordinates` takes precedence.'
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
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional()
    .describe('Start date filter (YYYY-MM-DD). Only rows on or after this date are returned.'),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
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
export const ClimateMeasurementSchema = z.object({
  date: z
    .string()
    .describe('Measurement date (YYYY-MM-DD; first day of period for monthly/yearly)'),
  temperature_mean: z.number().optional().describe('Mean temperature, °C'),
  temperature_max: z.number().optional().describe('Maximum temperature, °C'),
  temperature_min: z.number().optional().describe('Minimum temperature, °C'),
  precipitation: z.number().optional().describe('Precipitation total, mm'),
  sunshine_duration_min: z.number().optional().describe('Sunshine duration, minutes'),
  radiation_w_m2: z.number().optional().describe('Global radiation, W/m²'),
  wind_speed_m_s: z.number().optional().describe('Wind speed, m/s'),
  pressure_hpa: z.number().optional().describe('Air pressure, hPa'),
  frost_days: z.number().optional().describe('Days with minimum below 0 °C (monthly/yearly)'),
  summer_days: z
    .number()
    .optional()
    .describe('Days with maximum of 25 °C or above (monthly/yearly)'),
  heat_days: z.number().optional().describe('Days with maximum of 30 °C or above (monthly/yearly)'),
  ice_days: z.number().optional().describe('Days with maximum below 0 °C (monthly/yearly)'),
  tropical_nights: z
    .number()
    .optional()
    .describe('Nights with minimum of 20 °C or above (monthly/yearly)'),
  rain_days: z.number().optional().describe('Days with measurable precipitation (monthly/yearly)'),
});
export type ClimateMeasurement = z.infer<typeof ClimateMeasurementSchema>;

/** Climate data response */
export const ClimateDataResponseSchema = z.object({
  station: z.object({
    name: z.string().describe('Climate station name'),
    abbreviation: z.string().describe('Official station abbreviation (e.g. "SMA")'),
    elevation: z.number().describe('Elevation in metres above sea level'),
    coordinates: CoordinatesSchema.describe('WGS84 coordinates of the station'),
    canton: z.string().optional().describe('Canton abbreviation (e.g. "ZH")'),
    distance_km: z
      .number()
      .optional()
      .describe(
        'Distance from the queried location to this station, km (when resolved by proximity)'
      ),
    network: z
      .string()
      .describe(
        'NBCN network kind: "nbcn" (full climate series) or "nbcn-precip" (precipitation-only)'
      ),
  }),
  resolution: z.enum(CLIMATE_RESOLUTIONS).describe('Resolution the returned rows are in'),
  data: z
    .array(ClimateMeasurementSchema)
    .describe('Measurement rows, filtered and limited as requested'),
  note: z
    .string()
    .optional()
    .describe(
      'Present only when `data` is empty because the requested date range fell outside the fetched series (e.g. a daily request older than the ~2-year `_recent` window). Explains why and suggests a fallback resolution.'
    ),
  source: z.string().describe('Data attribution'),
});
export type ClimateDataResponse = z.infer<typeof ClimateDataResponseSchema>;
