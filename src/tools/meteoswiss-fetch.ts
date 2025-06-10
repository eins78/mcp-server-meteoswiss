import { fetchMeteoSwissContentSchema } from '../schemas/meteoswiss-fetch.js';
import { fetchMeteoSwissContent } from '../data/meteoswiss-content-data.js';
import { debugTools } from '../support/logging.js';

/**
 * Fetch full content from MeteoSwiss website
 *
 * This tool retrieves the full content of a specific page from the MeteoSwiss website.
 * It can convert HTML content to different formats (markdown, text, or HTML) and
 * optionally include metadata and images found in the content.
 *
 * @param input Fetch parameters
 * @returns Content with optional metadata and images
 */
export async function meteoswissFetchTool(input: unknown): Promise<unknown> {
  debugTools('Fetch tool called with input: %O', input);

  // Validate input
  const params = fetchMeteoSwissContentSchema.parse(input);
  debugTools('Validated fetch parameters: %O', params);

  try {
    // Fetch the content
    const content = await fetchMeteoSwissContent(params);
    debugTools('Fetched content for ID: %s', params.id);

    return content;
  } catch (error) {
    debugTools('Fetch error: %O', error);
    throw error;
  }
}
