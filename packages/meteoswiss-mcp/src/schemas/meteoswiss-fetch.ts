import { z } from 'zod';

/**
 * Schema for fetch tool parameters
 */
export const fetchMeteoSwissContentSchema = z.object({
  url: z
    .string()
    .min(1, { message: 'URL cannot be empty. Use the search tool to find valid page URLs.' })
    .describe(
      'Full URL of a MeteoSwiss page to fetch. Use the search tool first to discover valid URLs. Example: https://www.meteoschweiz.admin.ch/klima/klimawandel/steigende-temperaturen.html'
    ),
  format: z
    .enum(['markdown', 'text'], {
      message: "Format must be either 'markdown' or 'text'.",
    })
    .optional()
    .default('markdown')
    .describe('The output format for the content'),
  includeMetadata: z
    .boolean({
      message: 'includeMetadata must be a boolean (true or false)',
    })
    .optional()
    .default(true)
    .describe('Whether to include metadata in the response'),
});

export type FetchMeteoSwissContentInput = z.infer<typeof fetchMeteoSwissContentSchema>;
