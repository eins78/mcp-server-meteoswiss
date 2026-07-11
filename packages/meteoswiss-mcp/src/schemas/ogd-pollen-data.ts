/**
 * Zod schemas for the getPollenData MCP tool.
 */

import { z } from 'zod';

export const GetPollenDataParamsSchema = z.object({
  station: z
    .string()
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
export type PollenMeasurement =
  | { type: string; status: 'measured'; value: number; unit: string }
  | { type: string; status: 'no-current-data' };

/** Pollen data for one station */
export type StationPollenData = {
  station: {
    name: string;
    abbreviation: string;
    coordinates: { lat: number; lon: number };
  };
  timestamp: string;
  pollen: PollenMeasurement[];
};

/** Pollen data response */
export type PollenDataResponse = {
  stations: StationPollenData[];
  source: string;
};
