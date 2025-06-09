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
    description: 'Access official MeteoSwiss weather reports and forecasts for Switzerland. Provides daily weather reports for Northern, Southern, and Western regions in German, French, and Italian.',
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
              text: 'Was ist das aktuelle Wetter in der Nordschweiz?'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Ich hole den aktuellen Wetterbericht für die Nordschweiz von MeteoSwiss. Dieser enthält die Wetterprognose für die nächsten Tage mit Temperaturen und Wetterbedingungen.\n\n[Verwende das Tool meteoswissWeatherReport mit region="north" und language="de"]'
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
              text: 'Quel temps fait-il en Suisse romande?'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Je vais consulter le bulletin météo actuel de MétéoSuisse pour la Suisse romande. Il contient les prévisions détaillées pour les prochains jours.\n\n[Utiliser l\'outil meteoswissWeatherReport avec region="west" et language="fr"]'
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
              text: 'Che tempo fa in Ticino?'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Consulto il bollettino meteorologico attuale di MeteoSvizzera per il Ticino. Contiene le previsioni dettagliate per i prossimi giorni.\n\n[Utilizzare lo strumento meteoswissWeatherReport con region="south" e language="it"]'
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
              text: 'Wie ist das Wetter in der Schweiz?'
            }
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: 'Für welche Region der Schweiz möchten Sie den Wetterbericht?\n\n- Nordschweiz (Zürich, Basel, Bern, Mittelland)\n- Südschweiz (Tessin und südliche Täler)\n- Westschweiz (Romandie - Genf, Lausanne, Westliche Alpen)\n\nIch kann Ihnen den Bericht auf Deutsch, Französisch oder Italienisch liefern.'
            }
          }
        ]
      };
    }
  );

  return server;
}
