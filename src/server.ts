/**
 * Core MCP server implementation for MeteoSwiss weather data
 * Transport-agnostic server logic
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetWeatherReportParamsSchema } from './schemas/weather-report.js';
import type { GetWeatherReportParams } from './schemas/weather-report.js';
import { meteoswissWeatherReport } from './tools/meteoswiss-weather-report.js';
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
    description: 'Access official MeteoSwiss weather reports and forecasts for Switzerland. Provides daily weather reports for Northern, Southern, and Western regions in German, French, Italian, and English languages.',
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
- English (en): Available for all regions

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

  // Register prompts
  debugServer('Registering prompts');
  
  // German prompts for Northern Switzerland
  server.prompt(
    'wetterNordschweiz',
    'Aktueller Wetterbericht für die Nordschweiz',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Zeige mir den aktuellen Wetterbericht für die Nordschweiz auf Deutsch.'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Ich hole für Sie den aktuellen Wetterbericht für die Nordschweiz auf Deutsch.'
            }
          }
        ]
      };
    }
  );

  server.prompt(
    'wetterbericht',
    'Wetterbericht für eine Schweizer Region abrufen',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Zeige mir den Wetterbericht für die Nordschweiz auf Deutsch.'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Ich rufe den Wetterbericht für die gewünschte Region ab. Verwenden Sie das Tool meteoswissWeatherReport mit den Parametern region (north/south/west) und language (de/fr/it/en).'
            }
          }
        ]
      };
    }
  );

  // English prompts for Northern Switzerland
  server.prompt(
    'weatherNorthernSwitzerland',
    'Current weather report for Northern Switzerland',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Show me the current weather report for Northern Switzerland in English.'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'I\'ll get the current weather report for Northern Switzerland in English for you.'
            }
          }
        ]
      };
    }
  );

  server.prompt(
    'swissWeather',
    'Get weather report for a Swiss region',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'I want to see the weather report for Northern Switzerland in English.'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'I\'ll retrieve the weather report for your chosen region. Use the meteoswissWeatherReport tool with parameters region (north/south/west) and language (en/de/fr/it).'
            }
          }
        ]
      };
    }
  );

  // French prompt for Western Switzerland
  server.prompt(
    'meteoSuisseRomande',
    'Bulletin météo actuel pour la Suisse romande',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Montre-moi le bulletin météo actuel pour la Suisse romande en français.'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Je vais chercher le bulletin météo actuel pour la Suisse romande en français.'
            }
          }
        ]
      };
    }
  );

  // Italian prompt for Southern Switzerland (Ticino)
  server.prompt(
    'meteoTicino',
    'Bollettino meteo attuale per il Ticino',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Mostrami il bollettino meteo attuale per il Ticino in italiano.'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Recupero il bollettino meteo attuale per il Ticino in italiano.'
            }
          }
        ]
      };
    }
  );

  return server;
}
