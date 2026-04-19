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
