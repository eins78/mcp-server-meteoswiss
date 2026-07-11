/**
 * Core MCP server implementation for MeteoSwiss weather data
 * Transport-agnostic server logic
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchMeteoSwissContentSchema } from './schemas/meteoswiss-search.js';
import type { SearchMeteoSwissContentInput } from './schemas/meteoswiss-search.js';
import { fetchMeteoSwissContentSchema } from './schemas/meteoswiss-fetch.js';
import type { FetchMeteoSwissContentInput } from './schemas/meteoswiss-fetch.js';
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
import { GetPollenDataParamsSchema } from './schemas/ogd-pollen-data.js';
import type { GetPollenDataParams } from './schemas/ogd-pollen-data.js';
import { getPollenData } from './data/ogd-pollen-data.js';
import { GetClimateDataParamsSchema } from './schemas/ogd-climate-data.js';
import type { GetClimateDataParams } from './schemas/ogd-climate-data.js';
import { getClimateData } from './data/ogd-climate-data.js';
import { debugServer, debugTools } from './support/logging.js';
import { recordToolCall } from './support/metrics.js';
import type { McpPromptResponse } from './types/mcp-prompts.js';
import { getVersion } from './support/version.js';

/**
 * Create and configure the MeteoSwiss MCP server
 * @returns Configured MCP server instance
 */
export function createServer(): McpServer {
  debugServer('Creating MCP server instance');
  const server = new McpServer({
    name: 'meteoswiss-mcp',
    version: getVersion(),
    description:
      'Access official MeteoSwiss weather data for Switzerland. Provides multi-day forecasts, real-time measurements, station listings, and pollen data from the MeteoSwiss app and website.',
  });
  debugServer('MCP server created with name: meteoswiss-mcp');

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

  // Register search tool
  debugServer('Registering tool: search');
  server.tool(
    'search',
    'Search MeteoSwiss website content in multiple languages (DE, FR, IT, EN). Returns relevant pages with URLs that can be passed to the fetch tool. Always returns up to 10 results per page — the upstream API has a fixed page size that cannot be changed. Note: pagination may return duplicate results across pages (upstream API limitation).',
    searchMeteoSwissContentSchema.shape,
    async (params: SearchMeteoSwissContentInput) => {
      const _t0 = performance.now();
      try {
        console.error(
          `Processing search request: query="${params.query}", language=${params.language || 'de'}`
        );
        debugTools('search called with params: %O', params);
        const results = await meteoswissSearchTool(params);
        console.error(`Search returned ${results.totalResults} results`);
        debugTools('Search completed successfully');
        recordToolCall('search', performance.now() - _t0);
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
        recordToolCall('search', performance.now() - _t0);
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
    'Fetch full content from a MeteoSwiss webpage and convert to markdown or plain text. Use the search tool first to discover valid page URLs, then pass the full URL as the id parameter.',
    fetchMeteoSwissContentSchema.shape,
    async (params: FetchMeteoSwissContentInput) => {
      const _t0 = performance.now();
      try {
        console.error(
          `Processing fetch request: id="${params.id}", format=${params.format || 'markdown'}`
        );
        debugTools('fetch called with params: %O', params);
        const content = await meteoswissFetchTool(params);
        console.error('Successfully fetched content');
        debugTools('Fetch completed successfully');
        recordToolCall('fetch', performance.now() - _t0);
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
        recordToolCall('fetch', performance.now() - _t0);
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

This uses official MeteoSwiss Open Data — the same forecasts powering the MeteoSwiss app and website.

Accepts:
- Postal codes: "8001" (Zurich), "3000" (Bern), "1200" (Geneva)
- Station abbreviations: "SMA" (Zurich Fluntern), "BER" (Bern)
- Place names: "Zurich", "Basel", "Lugano"

Coverage: ~6000 Swiss locations (all postal codes + weather stations + mountain points).
Forecast horizon: up to 9 days. Updated hourly.

For postal codes and mountain points, each day also includes an hourly precipitation
breakdown (precipitation.hourly) — useful for judging *when* rain is expected, not just
the daily total:
- Each entry's "time" is already local wall-clock time for the location (Europe/Zurich),
  with the UTC offset included, e.g. "2026-07-09T14:00:00+02:00". It is NOT UTC — do not
  convert it.
- A dry hour is reported as value: 0, not omitted. A fully dry day is still a full array
  of zero-value hours, not an empty array.
- precipitation.hourly is null when no hourly breakdown exists for this location at all
  (weather stations only have a daily total, precipitation.total).
- precipitation.hourly is [] (empty array) only for postal codes/mountain points where
  hourly readings are missing for that specific day (a data gap) — distinct from null.`,
    GetLocalForecastParamsSchema.shape,
    async (params: GetLocalForecastParams) => {
      const _t0 = performance.now();
      try {
        console.error(
          `Processing getLocalForecast request for location: ${params.location}, days: ${params.days}`
        );
        debugTools('getLocalForecast called with params: %O', params);
        const result = await getLocalForecast(params);
        console.error('Successfully retrieved local forecast');
        debugTools('Local forecast retrieved successfully');
        recordToolCall('meteoswissLocalForecast', performance.now() - _t0);
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
        recordToolCall('meteoswissLocalForecast', performance.now() - _t0);
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
    `Get real-time weather measurements from ~300 Swiss automatic weather stations (~160 full weather + ~140 precipitation-only). Returns temperature, precipitation, wind, humidity, pressure, sunshine, and more. Data updates every 10 minutes. Precipitation-only stations return only rainfall data.

For 8 stations (Zurich, Basel, Chur, Sion, Altdorf, Säntis, Jungfraujoch, Grand St-Bernard), also includes daily visual observations: cloud cover, fog, rain, snowfall, hail, and snow coverage.

Accepts station names ("Zurich"), abbreviations ("SMA"), addresses ("Bahnhofplatz 1 Bern"), or WGS84 coordinates. Automatically finds the nearest station.`,
    GetCurrentWeatherParamsSchema.shape,
    async (params: GetCurrentWeatherParams) => {
      const _t0 = performance.now();
      try {
        console.error(
          `Processing meteoswissCurrentWeather request: station=${params.station ?? ''}, coords=${params.coordinates ? `${params.coordinates.lat},${params.coordinates.lon}` : ''}`
        );
        debugTools('getCurrentWeather called with params: %O', params);
        const result = await getCurrentWeather(params);
        console.error('Successfully retrieved current weather');
        recordToolCall('meteoswissCurrentWeather', performance.now() - _t0);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        console.error('Error in meteoswissCurrentWeather tool:', error);
        debugTools('Error in getCurrentWeather: %O', error);
        recordToolCall('meteoswissCurrentWeather', performance.now() - _t0);
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
    `List and search MeteoSwiss automatic weather stations. Filter by name, canton, or browse the full network of ~160 stations across Switzerland.`,
    ListStationsParamsSchema.shape,
    async (params: ListStationsParams) => {
      const _t0 = performance.now();
      try {
        console.error(
          `Processing meteoswissStations request: search=${params.search ?? ''}, canton=${params.canton ?? ''}`
        );
        debugTools('listStations called with params: %O', params);
        const result = await listStations(params);
        console.error(`Successfully listed ${result.total} stations`);
        recordToolCall('meteoswissStations', performance.now() - _t0);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        console.error('Error in meteoswissStations tool:', error);
        debugTools('Error in listStations: %O', error);
        recordToolCall('meteoswissStations', performance.now() - _t0);
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

  // Register getPollenData tool (OGD)
  debugServer('Registering tool: getPollenData');
  server.tool(
    'meteoswissPollenData',
    `Get current pollen concentration data from MeteoSwiss monitoring stations (~15 stations across Switzerland). Shows pollen levels for 7 measured species (alder, birch, hazel, beech, ash, oak, grasses) — each is always included, with a "no-current-data" status when out of season. Ambrosia (ragweed) is a MeteoSwiss forecast-only category and is not part of this OGD measurement network, so it is not included. Useful for allergy sufferers.`,
    GetPollenDataParamsSchema.shape,
    async (params: GetPollenDataParams) => {
      const _t0 = performance.now();
      try {
        console.error(
          `Processing meteoswissPollenData request: station=${params.station ?? 'all'}`
        );
        debugTools('getPollenData called with params: %O', params);
        const result = await getPollenData(params);
        console.error(`Successfully retrieved pollen data for ${result.stations.length} stations`);
        recordToolCall('meteoswissPollenData', performance.now() - _t0);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        console.error('Error in meteoswissPollenData tool:', error);
        debugTools('Error in getPollenData: %O', error);
        recordToolCall('meteoswissPollenData', performance.now() - _t0);
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

  // Register getClimateData tool (OGD NBCN)
  debugServer('Registering tool: getClimateData');
  server.tool(
    'meteoswissClimateData',
    `Get homogeneous climate measurement series from Switzerland's National Basic Climatic Network (NBCN). Returns temperature, precipitation, sunshine, radiation, wind, pressure, and climate indicators (frost days, summer days, heat days) going back decades.

29 climate stations + 46 precipitation stations with daily, monthly, and yearly resolution.

Use cases: "What are typical January temperatures in Zurich?", "How has precipitation changed in Basel over 50 years?", "How many heat days did Lugano have last year?"

Accepts station names ("Zurich", "Basel"), abbreviations ("SMA", "BAS"), or WGS84 coordinates.`,
    GetClimateDataParamsSchema.shape,
    async (params: GetClimateDataParams) => {
      const _t0 = performance.now();
      try {
        console.error(
          `Processing meteoswissClimateData request: station=${params.station ?? ''}, resolution=${params.resolution ?? 'monthly'}`
        );
        debugTools('getClimateData called with params: %O', params);
        const result = await getClimateData(params);
        console.error(`Successfully retrieved climate data: ${result.data.length} rows`);
        recordToolCall('meteoswissClimateData', performance.now() - _t0);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        console.error('Error in meteoswissClimateData tool:', error);
        debugTools('Error in getClimateData: %O', error);
        recordToolCall('meteoswissClimateData', performance.now() - _t0);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get climate data: ${error instanceof Error ? error.message : String(error)}`,
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
    'Wetterprognose und aktuelle Messdaten für die Nordschweiz',
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
              text: 'Ich hole die aktuelle Wetterprognose und Messdaten für die Nordschweiz.\n\n[Tool: meteoswissLocalForecast mit location="Zürich"]\n[Tool: meteoswissCurrentWeather mit station="Zürich"]',
            },
          },
        ],
      };
    }
  );

  // German prompt for flexible location
  server.prompt(
    'wetterSchweiz',
    'Wetter für einen beliebigen Ort in der Schweiz',
    (): McpPromptResponse => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Für welchen Ort möchten Sie das Wetter wissen? Sie können einen Ortsnamen, eine Postleitzahl oder eine Wetterstation angeben.\n\nBeispiele:\n- «Zürich» oder «8001»\n- «Genf» oder «1200»\n- «Lugano» oder «6900»',
            },
          },
        ],
      };
    }
  );

  // French prompt for Western Switzerland (Romandy)
  server.prompt(
    'meteoSuisseRomande',
    'Prévisions et mesures actuelles pour la Suisse romande',
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
              text: 'Je vais chercher les prévisions et mesures actuelles pour la Suisse romande.\n\n[Tool: meteoswissLocalForecast avec location="Genève"]\n[Tool: meteoswissCurrentWeather avec station="Genève"]',
            },
          },
        ],
      };
    }
  );

  // Italian prompt for Southern Switzerland (Ticino)
  server.prompt('meteoTicino', 'Previsioni e dati attuali per il Ticino', (): McpPromptResponse => {
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
            text: 'Recupero le previsioni e i dati attuali per il Ticino.\n\n[Tool: meteoswissLocalForecast con location="Lugano"]\n[Tool: meteoswissCurrentWeather con station="Lugano"]',
          },
        },
      ],
    };
  });

  return server;
}
