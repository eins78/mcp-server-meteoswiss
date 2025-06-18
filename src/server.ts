/**
 * Core MCP server implementation for MeteoSwiss weather data
 * Transport-agnostic server logic
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetWeatherReportParamsSchema } from './schemas/weather-report.js';
import type { GetWeatherReportParams } from './schemas/weather-report.js';
import { searchMeteoSwissContentSchema } from './schemas/meteoswiss-search.js';
import type { SearchMeteoSwissContentInput } from './schemas/meteoswiss-search.js';
import { fetchMeteoSwissContentSchema } from './schemas/meteoswiss-fetch.js';
import type { FetchMeteoSwissContentInput } from './schemas/meteoswiss-fetch.js';
import { meteoswissWeatherReport } from './tools/meteoswiss-weather-report.js';
import { meteoswissSearchTool } from './tools/meteoswiss-search.js';
import { meteoswissFetchTool } from './tools/meteoswiss-fetch.js';
import { debugServer, debugTools } from './support/logging.js';

/**
 * Create and configure the MeteoSwiss MCP server
 * @returns Configured MCP server instance
 */
export function createServer(): McpServer {
  debugServer('Creating MCP server instance');
  const server = new McpServer({
    name: 'mcp-server-meteoswiss',
    version: '1.0.0',
    description:
      'Access official MeteoSwiss weather reports and forecasts for Switzerland. Provides daily weather reports for Northern, Southern, and Western regions in German, French, and Italian.',
  });
  debugServer('MCP server created with name: mcp-server-meteoswiss');

  // Register error handler
  server.server.onerror = (error: Error) => {
    console.error('[MCP Server Error]', error);
    debugServer('Server error: %O', error);
    debugServer('Error stack: %s', error.stack);
  };

  // Log protocol events if debug is enabled
  if (process.env.DEBUG?.includes('mcp:server') || process.env.DEBUG_MCHMCP === 'true') {
    debugServer('Protocol event logging enabled');
  }

  // Register tools
  debugServer('Registering tool: meteoswissWeatherReport');
  server.tool(
    'meteoswissWeatherReport',
    `Get the official MeteoSwiss weather report for a Swiss region. Returns detailed daily forecasts including weather conditions, temperatures, and regional outlooks.

MeteoSwiss divides Switzerland into three main forecast regions:
- north: Northern Switzerland (including Zurich, Basel, Bern, and the Swiss Plateau)
- south: Southern Switzerland (Ticino and southern valleys)
- west: Western Switzerland (Romandy, including Geneva, Lausanne, and western Alps)

Weather reports are updated twice daily (morning and afternoon) and include:
- General weather situation and outlook
- Daily forecasts for the next 3-5 days
- Temperature ranges and trends
- Precipitation probability using standardized terms
- Regional-specific conditions (e.g., Föhn effects, valley fog)

Language support reflects Switzerland's multilingual nature:
- German (de): Primary language for northern regions
- French (fr): Primary language for western regions
- Italian (it): Primary language for southern regions (Ticino)

Note: Weather reports are only available in Switzerland's official languages (German, French, Italian). English translations are not provided by MeteoSwiss.

The reports use standardized probability terms for precipitation forecasts.`,
    GetWeatherReportParamsSchema.shape,
    async (params: GetWeatherReportParams) => {
      try {
        console.error(
          `Processing meteoswissWeatherReport request for region: ${params.region}, language: ${params.language}`
        );
        debugTools('meteoswissWeatherReport called with params: %O', params);
        const weatherReport = await meteoswissWeatherReport(params);
        console.error('Successfully retrieved weather report');
        debugTools('Weather report retrieved successfully');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(weatherReport, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        console.error('Error in meteoswissWeatherReport tool:', error);
        debugTools('Error in meteoswissWeatherReport: %O', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get weather report: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register search tool with ChatGPT-compatible name
  debugServer('Registering tool: search');
  server.tool(
    'search',
    'Search MeteoSwiss website content in multiple languages (DE, FR, IT, EN). Returns relevant pages, articles, and documents.',
    searchMeteoSwissContentSchema.shape,
    async (params: SearchMeteoSwissContentInput) => {
      try {
        console.error(
          `Processing search request: query="${params.query}", language=${params.language || 'de'}`
        );
        debugTools('search called with params: %O', params);
        const results = await meteoswissSearchTool(params);
        console.error(`Search returned ${results.totalResults} results`);
        debugTools('Search completed successfully');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        console.error('Error in search tool:', error);
        debugTools('Error in search: %O', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Search failed: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register fetch tool with ChatGPT-compatible name
  debugServer('Registering tool: fetch');
  server.tool(
    'fetch',
    'Fetch full content from a MeteoSwiss webpage. Can convert HTML to markdown or plain text, and optionally include metadata and images.',
    fetchMeteoSwissContentSchema.shape,
    async (params: FetchMeteoSwissContentInput) => {
      try {
        console.error(
          `Processing fetch request: id="${params.id}", format=${params.format || 'markdown'}`
        );
        debugTools('fetch called with params: %O', params);
        const content = await meteoswissFetchTool(params);
        console.error('Successfully fetched content');
        debugTools('Fetch completed successfully');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(content, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        console.error('Error in fetch tool:', error);
        debugTools('Error in fetch: %O', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Fetch failed: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register prompts
  debugServer('Registering prompts');

  // German prompt for Northern Switzerland
  server.prompt(
    'wetterNordschweiz',
    'Aktueller Wetterbericht für die Nordschweiz auf Deutsch',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Wie ist das Wetter in der Nordschweiz heute und in den nächsten Tagen?',
            },
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Ich hole den aktuellen Wetterbericht für die Nordschweiz.\n\n[Tool: meteoswissWeatherReport mit region="north" und language="de"]',
            },
          },
        ],
      };
    }
  );

  // German prompt for flexible region
  server.prompt('wetterSchweiz', 'Interaktiver Wetterbericht für alle Regionen auf Deutsch', () => {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: 'Für welche Region möchten Sie den Wetterbericht? Verfügbar sind:\n- Nordschweiz (north)\n- Südschweiz/Tessin (south)\n- Westschweiz/Romandie (west)',
          },
        },
      ],
    };
  });

  // French prompt for Western Switzerland (Romandy)
  server.prompt(
    'meteoSuisseRomande',
    'Bulletin météo actuel pour la Suisse romande en français',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: "Quel temps fait-il en Suisse romande aujourd'hui et pour les prochains jours?",
            },
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Je vais chercher le bulletin météo actuel pour la Suisse romande.\n\n[Outil: meteoswissWeatherReport avec region="west" et language="fr"]',
            },
          },
        ],
      };
    }
  );

  // Italian prompt for Southern Switzerland (Ticino)
  server.prompt('meteoTicino', 'Bollettino meteo attuale per il Ticino in italiano', () => {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: "Com'è il tempo in Ticino oggi e nei prossimi giorni?",
          },
        },
        {
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: 'Recupero il bollettino meteo attuale per il Ticino.\n\n[Strumento: meteoswissWeatherReport con region="south" e language="it"]',
          },
        },
      ],
    };
  });

  return server;
}
