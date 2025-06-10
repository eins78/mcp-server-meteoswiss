import { searchMeteoSwissContentSchema } from '../schemas/meteoswiss-search.js';
import { searchMeteoSwissContent, type SearchResults } from '../data/meteoswiss-search-data.js';
import { debugTools } from '../support/logging.js';

/**
 * Search MeteoSwiss website content
 *
 * This tool allows searching for content on the MeteoSwiss website in multiple languages.
 * It uses the MeteoSwiss Solr search API to find relevant pages, articles, and documents.
 *
 * @param input Search parameters
 * @returns Search results with metadata
 */
export async function meteoswissSearchTool(input: unknown): Promise<SearchResults> {
  debugTools('Search tool called with input: %O', input);

  // Validate input
  const params = searchMeteoSwissContentSchema.parse(input);
  debugTools('Validated search parameters: %O', params);

  try {
    // Perform the search
    const results = await searchMeteoSwissContent(params);
    debugTools('Search returned %d results', results.totalResults);

    return results;
  } catch (error) {
    debugTools('Search error: %O', error);
    throw error;
  }
}
