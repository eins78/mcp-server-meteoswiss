import { z } from 'zod';

/**
 * Schema for fetch tool parameters
 */
export const fetchMeteoSwissContentSchema = z.object({
  id: z.string().min(1).describe('The content ID or path to fetch'),
  format: z
    .enum(['markdown', 'text', 'html'])
    .optional()
    .default('markdown')
    .describe('The output format for the content'),
  includeMetadata: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include metadata in the response'),
  includeImages: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include images found in the content'),
});

export type FetchMeteoSwissContentInput = z.infer<typeof fetchMeteoSwissContentSchema>;