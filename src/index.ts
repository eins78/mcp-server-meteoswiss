#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GetWeatherReportParamsSchema } from './schemas/weather-report.ts';
import type { GetWeatherReportParams } from './schemas/weather-report.ts';
import { getWeatherReport } from './tools/get-weather-report.ts';

/**
 * Creates and configures the MCP server for MeteoSwiss weather data
 *
 * This server implementation follows the Model Context Protocol specification
 * using the official TypeScript SDK to ensure compatibility with Claude Desktop
 * and other MCP clients.
 */
async function startServer() {
  // Define the port
  const PORT = process.env.PORT || 3000;

  // Create MCP server instance
  const server = new McpServer({
    name: 'meteoswiss-weather-server',
    version: '1.0.0',
    description: 'MCP server for MeteoSwiss weather data',
  });

  // Register tools
  server.tool(
    'getWeatherReport',
    'Retrieves the latest weather report for a specified region',
    GetWeatherReportParamsSchema.shape,
    async (params: GetWeatherReportParams) => {
      try {
        const weatherReport = await getWeatherReport(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(weatherReport, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        console.error('Error in getWeatherReport tool:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get weather report: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Create StreamableHTTP transport with proper CORS settings for Claude Desktop
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Use console.error instead of console.log for logging as stderr won't interfere with MCP communication
  console.error(`MCP Server is running via stdio transport`);
  console.error('Registered tools:');
  console.error('- getWeatherReport: Retrieves the latest weather report for a specified region');
}

// Start the server and handle errors
startServer().catch((error: unknown) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
