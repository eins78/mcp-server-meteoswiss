/**
 * Zod schemas for the listStations MCP tool.
 */

import { z } from 'zod';

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
export type StationListEntry = {
  abbreviation: string;
  name: string;
  canton: string;
  elevation: number;
  coordinates: { lat: number; lon: number };
  data_since: string;
};

/** Station list response */
export type StationListResponse = {
  total: number;
  stations: StationListEntry[];
  source: string;
};
