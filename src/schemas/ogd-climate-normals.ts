/**
 * Zod schemas for the getClimateNormals MCP tool.
 */

import { z } from 'zod';

export const GetClimateNormalsParamsSchema = z.object({
  station: z
    .string()
    .min(1)
    .describe('Station name or abbreviation (e.g., "Zurich", "SMA", "BER")'),
  month: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe('Filter to a specific month (1-12). Omit for full year.'),
});
export type GetClimateNormalsParams = z.infer<typeof GetClimateNormalsParamsSchema>;

/** Monthly climate normal values */
export type MonthlyNormal = {
  month: number;
  temperature_mean: number | null;
  precipitation_total: number | null;
  sunshine_hours: number | null;
};

/** Climate normals response */
export type ClimateNormalsResponse = {
  station: {
    name: string;
    abbreviation: string;
    elevation: number;
    coordinates: { lat: number; lon: number };
  };
  period: string;
  data: MonthlyNormal[];
  source: string;
};
