import { z } from 'zod';

/**
 * Schema for fetch tool parameters
 */
export const fetchMeteoSwissContentSchema = z.object({
  id: z
    .string()
    .min(1, { message: 'Content ID cannot be empty. Please provide a valid content ID or path.' })
    .describe('The content ID or path to fetch'),
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
