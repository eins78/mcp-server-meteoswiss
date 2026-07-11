import { z } from 'zod';

/**
 * Schema for search tool parameters
 */
export const searchMeteoSwissContentSchema = z.object({
  query: z
    .string()
    .min(1, { message: 'Search query cannot be empty. Please provide at least one character.' })
    .max(200, { message: 'Search query must be at most 200 characters.' })
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
    .max(1000, { message: 'Page number must be at most 1000.' })
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

/** A single search result item */
export const SearchResultItemSchema = z.object({
  id: z.string().describe('Result identifier — the page URL (pass to the fetch tool)'),
  title: z.string().describe('Page title'),
  url: z.string().describe('Full page URL'),
  description: z.string().optional().describe('Short description of the page'),
  contentType: z.string().optional().describe('Content type of the result'),
  lastModified: z.string().optional().describe('Last modification date'),
  path: z.string().optional().describe('Site path of the page'),
  lead: z.string().optional().describe('Lead/teaser text'),
  publicationDate: z.string().optional().describe('Publication date'),
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

/** Search results response */
export const SearchResultsSchema = z.object({
  totalResults: z.number().describe('Total number of matches across all pages'),
  page: z.number().describe('Current page number (1-based)'),
  pageSize: z
    .number()
    .describe(
      'Number of items in `results` for this page — at most 10 (the upstream API pages by a fixed 10), fewer on the last page'
    ),
  results: z.array(SearchResultItemSchema).describe('Result items for this page'),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;
