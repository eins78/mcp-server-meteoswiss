/**
 * Zod schemas for the getPollenData MCP tool.
 */

import { z } from 'zod';
import { CoordinatesSchema } from './ogd-shared.js';

export const GetPollenDataParamsSchema = z.object({
  station: z
    .string()
    .max(200, { message: 'Station must be at most 200 characters.' })
    .optional()
    .describe(
      'Pollen monitoring station name or abbreviation. Omit for an overview of all stations.'
    ),
});
export type GetPollenDataParams = z.infer<typeof GetPollenDataParamsSchema>;

/**
 * Pollen measurement for a single known species. All species the OGD network
 * measures are always represented — `status: 'no-current-data'` makes an
 * absent reading explicit (e.g. out of season) instead of silently omitting
 * the type (issue #110, DECISION-3).
 */
export const PollenMeasurementSchema = z.discriminatedUnion('status', [
  z.object({
    type: z.string().describe('Pollen species (e.g. "birch", "grasses")'),
    status: z.literal('measured'),
    value: z.number().describe('Concentration reading'),
    unit: z.string().describe('Concentration unit (particles/m³)'),
  }),
  z.object({
    type: z.string().describe('Pollen species (e.g. "birch", "grasses")'),
    status: z
      .literal('no-current-data')
      .describe('No current reading for this species (e.g. out of season) — explicit, not omitted'),
  }),
]);
export type PollenMeasurement = z.infer<typeof PollenMeasurementSchema>;

/** Pollen data for one station */
export const StationPollenDataSchema = z.object({
  station: z.object({
    name: z.string().describe('Pollen station name'),
    abbreviation: z.string().describe('Pollen station abbreviation (e.g. "PZH")'),
    coordinates: CoordinatesSchema.describe('WGS84 coordinates of the station'),
  }),
  timestamp: z.string().describe('Measurement timestamp (ISO 8601)'),
  pollen: z
    .array(PollenMeasurementSchema)
    .describe('One entry per measured species — every known species always appears'),
});
export type StationPollenData = z.infer<typeof StationPollenDataSchema>;

/** Pollen data response */
export const PollenDataResponseSchema = z.object({
  stations: z.array(StationPollenDataSchema).describe('One entry per pollen station'),
  source: z.string().describe('Data attribution'),
});
export type PollenDataResponse = z.infer<typeof PollenDataResponseSchema>;
