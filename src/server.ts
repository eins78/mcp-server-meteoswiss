/**
 * Core MCP server implementation for MeteoSwiss weather data
 * Transport-agnostic server logic
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetWeatherReportParamsSchema } from './schemas/weather-report.js';
import type { GetWeatherReportParams } from './schemas/weather-report.js';
import { meteoswissWeatherReport } from './tools/meteoswiss-weather-report.js';
import { debugServer, debugTools } from './support/logging.js';
import { texts } from './texts/index.js';

/**
 * Create and configure the MeteoSwiss MCP server
 * @returns Configured MCP server instance
 */
export function createServer(): McpServer {
  debugServer('Creating MCP server instance');
  const server = new McpServer({
    name: 'mcp-server-meteoswiss',
    version: '1.0.0',
    description: texts['server-description'],
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
    texts['meteoswiss-weather-report-tool-description'],
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
              text: texts['prompt-wetter-nordschweiz-user']
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: texts['prompt-wetter-nordschweiz-assistant']
            }
          }
        ]
      };
    }
  );

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
              text: texts['prompt-meteo-suisse-romande-user']
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: texts['prompt-meteo-suisse-romande-assistant']
            }
          }
        ]
      };
    }
  );

  // Italian prompt for Southern Switzerland (Ticino)
  server.prompt(
    'meteoTicino',
    'Bollettino meteo attuale per il Ticino in italiano',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: texts['prompt-meteo-ticino-user']
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: texts['prompt-meteo-ticino-assistant']
            }
          }
        ]
      };
    }
  );

  // Generic German prompt for any region
  server.prompt(
    'wetterSchweiz',
    'Wetterbericht für eine beliebige Schweizer Region',
    () => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: texts['prompt-wetter-schweiz-user']
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: texts['prompt-wetter-schweiz-assistant']
            }
          }
        ]
      };
    }
  );

  return server;
}