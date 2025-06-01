/**
 * Core MCP server implementation for MeteoSwiss weather data
 * Transport-agnostic server logic
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetWeatherReportParamsSchema } from './schemas/weather-report.js';
import type { GetWeatherReportParams } from './schemas/weather-report.js';
import { getWeatherReport } from './tools/get-weather-report.js';
import { debugServer, debugTools } from './utils/logger.js';

/**
 * Create and configure the MeteoSwiss MCP server
 * @returns Configured MCP server instance
 */
export function createServer(): McpServer {
  debugServer('Creating MCP server instance');
  const server = new McpServer({
    name: 'mcp-server-meteoswiss',
    version: '1.0.0',
    description: 'MCP server for MeteoSwiss weather data',
  });
  debugServer('MCP server created with name: mcp-server-meteoswiss');

  // Register error handler
  server.server.onerror = (error: Error) => {
    console.error('[MCP Server Error]', error);
    debugServer('Server error: %O', error);
  };

  // Register tools
  debugServer('Registering tool: getWeatherReport');
  server.tool(
    'getWeatherReport',
    'Retrieves the latest MeteoSwiss weather report for a specified region (Northern, Southern, Western parts of Switzerland), in German, French, Italian or English',
    GetWeatherReportParamsSchema.shape,
    async (params: GetWeatherReportParams) => {
      try {
        console.error(
          `Processing getWeatherReport request for region: ${params.region}, language: ${params.language}`
        );
        debugTools('getWeatherReport called with params: %O', params);
        const weatherReport = await getWeatherReport(params);
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
        console.error('Error in getWeatherReport tool:', error);
        debugTools('Error in getWeatherReport: %O', error);
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

  return server;
}