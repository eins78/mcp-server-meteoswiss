import { z } from 'zod';

/**
 * Schema for fetch tool parameters.
 *
 * Canonical input arg is `id` to match the ChatGPT Deep Research MCP contract:
 * <https://github.com/openai/openai-cookbook/blob/main/examples/deep_research_api/how_to_build_a_deep_research_mcp_server/main.py>
 *
 * For this server the `id` is a full MeteoSwiss page URL returned by the search tool.
 */
export const fetchMeteoSwissContentSchema = z.object({
  id: z
    .string()
    .min(1, { message: 'id cannot be empty. Use the search tool to find valid page URLs.' })
    .describe(
      'Identifier of a MeteoSwiss page to fetch. For this server the id is a full URL returned by the search tool. Example: https://www.meteoschweiz.admin.ch/klima/klimawandel/steigende-temperaturen.html'
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

/** Fetched page content response (field names match the ChatGPT Deep Research MCP contract) */
export const ContentResponseSchema = z.object({
  id: z.string().describe('The id the content was fetched for (the page URL)'),
  title: z.string().optional().describe('Page title'),
  text: z.string().describe('Canonical body field (matches ChatGPT Deep Research spec)'),
  format: z.enum(['markdown', 'text']).describe('Format of `text`'),
  url: z
    .string()
    .describe(
      'Canonical URL field (matches ChatGPT Deep Research spec). For this server `url === id`.'
    ),
  metadata: z
    .object({
      url: z.string(),
      language: z.string().optional(),
      lastModified: z.string().optional(),
      contentType: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      description: z.string().optional(),
    })
    .optional()
    .describe('Page metadata (present when includeMetadata is true)'),
});
export type ContentResponse = z.infer<typeof ContentResponseSchema>;
