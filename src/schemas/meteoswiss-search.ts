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
      errorMap: (issue, ctx) => {
        if (issue.code === 'invalid_enum_value') {
          return {
            message: `Language must be one of: 'de' (German), 'fr' (French), 'it' (Italian), or 'en' (English). Received: '${issue.received}'`,
          };
        }
        return { message: ctx.defaultError };
      },
    })
    .optional()
    .default('de')
    .describe('The language for search results'),
  contentType: z
    .enum(['content', 'press-release', 'blog-article', 'publication'], {
      errorMap: (issue, ctx) => {
        if (issue.code === 'invalid_enum_value') {
          return {
            message: `Content type must be one of: 'content' (general content pages), 'press-release', 'blog-article', or 'publication' (official reports and scientific publications). Received: '${issue.received}'`,
          };
        }
        return { message: ctx.defaultError };
      },
    })
    .optional()
    .describe(
      'Filter by content type. Defaults to "content" to exclude application pages. Use "publication" for official reports.'
    ),
  page: z
    .number({
      invalid_type_error: 'Page must be a number',
      required_error: 'Page is required when specified',
    })
    .int({ message: 'Page must be a whole number' })
    .positive({ message: 'Page number must be greater than 0' })
    .optional()
    .default(1)
    .describe('Page number for pagination (1-based)'),
  pageSize: z
    .number({
      invalid_type_error: 'Page size must be a number',
      required_error: 'Page size is required when specified',
    })
    .int({ message: 'Page size must be a whole number' })
    .positive({ message: 'Page size must be greater than 0' })
    .max(100, { message: 'Page size cannot exceed 100 results per page' })
    .optional()
    .default(12)
    .describe('Number of results per page (max 100)'),
  sort: z
    .enum(['relevance', 'date-desc', 'date-asc'], {
      errorMap: (issue, ctx) => {
        if (issue.code === 'invalid_enum_value') {
          return {
            message: `Sort order must be one of: 'relevance', 'date-desc', or 'date-asc'. Received: '${issue.received}'`,
          };
        }
        return { message: ctx.defaultError };
      },
    })
    .optional()
    .default('relevance')
    .describe('Sort order for results'),
});

export type SearchMeteoSwissContentInput = z.infer<typeof searchMeteoSwissContentSchema>;
