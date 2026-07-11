import { z } from 'zod';

/**
 * Schema for search tool parameters
 */
export const searchMeteoSwissContentSchema = z.object({
  query: z
    .string()
    .min(1, { message: 'Search query cannot be empty. Please provide at least one character.' })
    .describe('The search query string'),
  language: z
    .enum(['de', 'fr', 'it', 'en'], {
      message:
        "Language must be one of: 'de' (German), 'fr' (French), 'it' (Italian), or 'en' (English).",
    })
    .optional()
    .default('de')
    .describe('The language for search results'),
  contentType: z
    .enum(['content', 'press-release', 'blog-article', 'publication'], {
      message:
        "Content type must be one of: 'content', 'press-release', 'blog-article', or 'publication'.",
    })
    .optional()
    .describe(
      'Filter by content type. Defaults to "content" to exclude application pages. Use "publication" for official reports.'
    ),
  page: z
    .number({ message: 'Page must be a number' })
    .int({ message: 'Page must be a whole number' })
    .positive({ message: 'Page number must be greater than 0' })
    .optional()
    .default(1)
    .describe(
      'Page number for pagination (1-based). The upstream API always returns 10 results per page; page size is not configurable.'
    ),
  sort: z
    .enum(['relevance', 'date-desc', 'date-asc'], {
      message: "Sort order must be one of: 'relevance', 'date-desc', or 'date-asc'.",
    })
    .optional()
    .default('relevance')
    .describe(
      'Sort order for results. Note: date-asc severely degrades relevance — results are dominated by page age rather than query match.'
    ),
});

export type SearchMeteoSwissContentInput = z.infer<typeof searchMeteoSwissContentSchema>;
