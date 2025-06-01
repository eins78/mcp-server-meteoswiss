#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GetWeatherReportParamsSchema } from './schemas/weather-report.ts';
import type { GetWeatherReportParams } from './schemas/weather-report.ts';
import { getWeatherReport } from './tools/get-weather-report.ts';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

  // Log environment info
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  console.error('MCP Server starting with:');
  console.error(`- Node.js version: ${process.version}`);
  console.error(`- Current directory: ${process.cwd()}`);
  console.error(`- Script directory: ${__dirname}`);
  console.error(`- Running in TTY: ${process.stdout.isTTY ? 'Yes' : 'No'}`);
  console.error(`- USE_TEST_FIXTURES: ${process.env.USE_TEST_FIXTURES || 'not set'}`);

  // Check for test fixtures
  const testFixturesDevPath = path.resolve(__dirname, '../test/__fixtures__/weather-report');
  const testFixturesProdPath = path.resolve(__dirname, './test/__fixtures__/weather-report');
  console.error(
    `- Test fixtures dev path exists: ${existsSync(testFixturesDevPath) ? 'Yes' : 'No'}`
  );
  console.error(
    `- Test fixtures prod path exists: ${existsSync(testFixturesProdPath) ? 'Yes' : 'No'}`
  );

  // Set USE_TEST_FIXTURES to true by default when using stdio (Claude Desktop)
  if (!process.env.USE_TEST_FIXTURES && process.stdout.isTTY === false) {
    process.env.USE_TEST_FIXTURES = 'true';
    console.error('Running in Claude Desktop, using test fixtures by default');
  }

  // Create MCP server instance
  const server = new McpServer({
    name: 'meteoswiss-weather-server',
    version: '1.0.0',
    description: 'MCP server for MeteoSwiss weather data',
  });

  // Register tools
  server.tool(
    'getWeatherReport',
    'Retrieves the latest MeteoSwiss weather report for a specified region (Northern, Southern, Western parts of Switzerland), in German, French, Italian or English',
    GetWeatherReportParamsSchema.shape,
    async (params: GetWeatherReportParams) => {
      try {
        console.error(
          `Processing getWeatherReport request for region: ${params.region}, language: ${params.language}`
        );
        const weatherReport = await getWeatherReport(params);
        console.error('Successfully retrieved weather report');
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
