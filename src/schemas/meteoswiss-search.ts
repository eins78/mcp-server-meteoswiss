import { z } from 'zod';

/**
 * Schema for search tool parameters
 */
export const searchMeteoSwissContentSchema = z.object({
  query: z.string().min(1).describe('The search query string'),
  language: z
    .enum(['de', 'fr', 'it', 'en'])
    .optional()
    .default('de')
    .describe('The language for search results'),
  contentType: z
    .string()
    .optional()
    .describe('Filter by content type (e.g., "content", "pages")'),
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe('Page number for pagination (1-based)'),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(12)
    .describe('Number of results per page (max 100)'),
  sort: z
    .enum(['relevance', 'date-desc', 'date-asc'])
    .optional()
    .default('relevance')
    .describe('Sort order for results'),
});

export type SearchMeteoSwissContentInput = z.infer<typeof searchMeteoSwissContentSchema>;