/**
 * Zod schemas for the listStations MCP tool.
 */

import { z } from 'zod';
import { CoordinatesSchema } from './ogd-shared.js';

export const ListStationsParamsSchema = z.object({
  search: z.string().optional().describe('Search by station name or abbreviation'),
  canton: z
    .string()
    .length(2)
    .optional()
    .describe('Filter by canton abbreviation (e.g., "ZH", "BE", "GR")'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(20)
    .describe('Maximum number of results (1-200, default 20)'),
});
export type ListStationsParams = z.infer<typeof ListStationsParamsSchema>;

/** Station entry in the list */
export const StationListEntrySchema = z.object({
  abbreviation: z.string().describe('Official station abbreviation (e.g. "SMA")'),
  name: z.string().describe('Station name'),
  canton: z.string().describe('Canton abbreviation (e.g. "ZH")'),
  elevation: z.number().describe('Elevation in metres above sea level'),
  coordinates: CoordinatesSchema.describe('WGS84 coordinates of the station'),
  data_since: z.string().describe('Date the station started reporting data'),
});
export type StationListEntry = z.infer<typeof StationListEntrySchema>;

/** Station list response */
export const StationListResponseSchema = z.object({
  total: z.number().describe('Total number of stations matching the filter'),
  stations: z.array(StationListEntrySchema).describe('Matching stations, up to `limit`'),
  source: z.string().describe('Data attribution'),
});
export type StationListResponse = z.infer<typeof StationListResponseSchema>;
