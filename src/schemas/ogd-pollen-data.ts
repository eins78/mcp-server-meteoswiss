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

/** Pollen measurement for a single type */
export type PollenMeasurement = {
  type: string;
  value: number | null;
  unit: string;
};

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
