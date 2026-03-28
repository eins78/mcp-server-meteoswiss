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
import { GetLocalForecastParamsSchema } from './schemas/ogd-local-forecast.js';
import type { GetLocalForecastParams } from './schemas/ogd-local-forecast.js';
import { getLocalForecast } from './data/ogd-local-forecast.js';
import { GetCurrentWeatherParamsSchema } from './schemas/ogd-current-weather.js';
import type { GetCurrentWeatherParams } from './schemas/ogd-current-weather.js';
import { getCurrentWeather } from './data/ogd-current-weather.js';
import { ListStationsParamsSchema } from './schemas/ogd-station-list.js';
import type { ListStationsParams } from './schemas/ogd-station-list.js';
import { listStations } from './data/ogd-station-list.js';
import { GetClimateNormalsParamsSchema } from './schemas/ogd-climate-normals.js';
import type { GetClimateNormalsParams } from './schemas/ogd-climate-normals.js';
import { getClimateNormals } from './data/ogd-climate-normals.js';
import { GetPollenDataParamsSchema } from './schemas/ogd-pollen-data.js';
import type { GetPollenDataParams } from './schemas/ogd-pollen-data.js';
import { getPollenData } from './data/ogd-pollen-data.js';
import { debugServer, debugTools } from './support/logging.js';
import type { McpPromptResponse } from './types/mcp-prompts.js';
import { getVersion } from './support/version.js';

/**
 * Create and configure the MeteoSwiss MCP server
 * @returns Configured MCP server instance
 */
export function createServer(): McpServer {
  debugServer('Creating MCP server instance');
  const server = new McpServer({
    name: 'mcp-server-meteoswiss',
    version: getVersion(),
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

IMPORTANT: This tool ONLY supports Swiss official languages. English (en) is NOT supported and will return an error.

Supported languages:
- German (de) - Use for Zurich, Basel, Bern, and most queries unless a specific language is requested
- French (fr) - Use for Geneva, Lausanne, or when French is specifically requested
- Italian (it) - Use for Ticino or when Italian is specifically requested

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

  // Register getLocalForecast tool (OGD)
  debugServer('Registering tool: getLocalForecast');
  server.tool(
    'meteoswissLocalForecast',
    `Get a multi-day weather forecast for any Swiss location. Returns daily summaries with temperature, precipitation, and weather icons.

This uses official MeteoSwiss Open Government Data — the same forecasts powering the MeteoSwiss app and website.

Accepts:
- Postal codes: "8001" (Zurich), "3000" (Bern), "1200" (Geneva)
- Station abbreviations: "ZUE" (Zurich Fluntern), "BER" (Bern)
- Place names: "Zurich", "Basel", "Lugano"

Coverage: ~6000 Swiss locations (all postal codes + weather stations + mountain points).
Forecast horizon: up to 9 days. Updated hourly.`,
    GetLocalForecastParamsSchema.shape,
    async (params: GetLocalForecastParams) => {
      try {
        console.error(
          `Processing getLocalForecast request for location: ${params.location}, days: ${params.days}`
        );
        debugTools('getLocalForecast called with params: %O', params);
        const result = await getLocalForecast(params);
        console.error('Successfully retrieved local forecast');
        debugTools('Local forecast retrieved successfully');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        console.error('Error in getLocalForecast tool:', error);
        debugTools('Error in getLocalForecast: %O', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get local forecast: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register getCurrentWeather tool (OGD)
  debugServer('Registering tool: getCurrentWeather');
  server.tool(
    'meteoswissCurrentWeather',
    `Get real-time weather measurements from any of 158 Swiss automatic weather stations. Returns temperature, precipitation, wind, humidity, pressure, sunshine, and more. Data updates every 10 minutes.

Accepts station names ("Zurich"), abbreviations ("SMA"), or searches by name.`,
    GetCurrentWeatherParamsSchema.shape,
    async (params: GetCurrentWeatherParams) => {
      try {
        console.error(`Processing meteoswissCurrentWeather request for station: ${params.station}`);
        debugTools('getCurrentWeather called with params: %O', params);
        const result = await getCurrentWeather(params);
        console.error('Successfully retrieved current weather');
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        console.error('Error in meteoswissCurrentWeather tool:', error);
        debugTools('Error in getCurrentWeather: %O', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get current weather: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register listStations tool (OGD)
  debugServer('Registering tool: listStations');
  server.tool(
    'meteoswissStations',
    `List and search MeteoSwiss automatic weather stations. Filter by name, canton, or browse the full network of 158 stations across Switzerland.`,
    ListStationsParamsSchema.shape,
    async (params: ListStationsParams) => {
      try {
        console.error(
          `Processing meteoswissStations request: search=${params.search ?? ''}, canton=${params.canton ?? ''}`
        );
        debugTools('listStations called with params: %O', params);
        const result = await listStations(params);
        console.error(`Successfully listed ${result.total} stations`);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        console.error('Error in meteoswissStations tool:', error);
        debugTools('Error in listStations: %O', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to list stations: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register getClimateNormals tool (OGD)
  debugServer('Registering tool: getClimateNormals');
  server.tool(
    'meteoswissClimateNormals',
    `Get 1991-2020 climate normal values (30-year averages) for a Swiss weather station. Shows average temperature, precipitation, and sunshine by month. Useful for "what's normal for this location?" questions.`,
    GetClimateNormalsParamsSchema.shape,
    async (params: GetClimateNormalsParams) => {
      try {
        console.error(`Processing meteoswissClimateNormals request for station: ${params.station}`);
        debugTools('getClimateNormals called with params: %O', params);
        const result = await getClimateNormals(params);
        console.error('Successfully retrieved climate normals');
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        console.error('Error in meteoswissClimateNormals tool:', error);
        debugTools('Error in getClimateNormals: %O', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get climate normals: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register getPollenData tool (OGD)
  debugServer('Registering tool: getPollenData');
  server.tool(
    'meteoswissPollenData',
    `Get current pollen concentration data from MeteoSwiss monitoring stations (~15 stations across Switzerland). Shows pollen levels by type (birch, grass, etc.). Useful for allergy sufferers.`,
    GetPollenDataParamsSchema.shape,
    async (params: GetPollenDataParams) => {
      try {
        console.error(
          `Processing meteoswissPollenData request: station=${params.station ?? 'all'}`
        );
        debugTools('getPollenData called with params: %O', params);
        const result = await getPollenData(params);
        console.error(`Successfully retrieved pollen data for ${result.stations.length} stations`);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        console.error('Error in meteoswissPollenData tool:', error);
        debugTools('Error in getPollenData: %O', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get pollen data: ${error instanceof Error ? error.message : String(error)}`,
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
    (): McpPromptResponse => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Wie ist das Wetter in der Nordschweiz heute und in den nächsten Tagen?',
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: 'Ich hole den aktuellen Wetterbericht für die Nordschweiz.\n\n[Tool: meteoswissWeatherReport mit region="north" und language="de"]',
            },
          },
        ],
      };
    }
  );

  // German prompt for flexible region
  server.prompt(
    'wetterSchweiz',
    'Interaktiver Wetterbericht für alle Regionen auf Deutsch',
    (): McpPromptResponse => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Für welche Region möchten Sie den Wetterbericht? Verfügbar sind:\n- Nordschweiz (north)\n- Südschweiz/Tessin (south)\n- Westschweiz/Romandie (west)',
            },
          },
        ],
      };
    }
  );

  // French prompt for Western Switzerland (Romandy)
  server.prompt(
    'meteoSuisseRomande',
    'Bulletin météo actuel pour la Suisse romande en français',
    (): McpPromptResponse => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: "Quel temps fait-il en Suisse romande aujourd'hui et pour les prochains jours?",
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: 'Je vais chercher le bulletin météo actuel pour la Suisse romande.\n\n[Tool: meteoswissWeatherReport avec region="west" et language="fr"]',
            },
          },
        ],
      };
    }
  );

  // Italian prompt for Southern Switzerland (Ticino)
  server.prompt(
    'meteoTicino',
    'Bollettino meteo attuale per il Ticino in italiano',
    (): McpPromptResponse => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: "Com'è il tempo in Ticino oggi e nei prossimi giorni?",
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: 'Recupero il bollettino meteo attuale per il Ticino.\n\n[Tool: meteoswissWeatherReport con region="south" e language="it"]',
            },
          },
        ],
      };
    }
  );

  return server;
}
