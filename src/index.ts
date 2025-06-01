#!/usr/bin/env node
/**
 * Main entry point for MeteoSwiss MCP server
 * Supports both stdio and HTTP transports
 */

import { createServer } from './server.js';
import { createStdioTransport } from './transports/stdio.js';
import { createHttpServer } from './transports/streamable-http.js';

/**
 * Parse command line arguments to determine transport type
 */
function parseArgs(): { transport: 'stdio' | 'http'; port?: number } {
  const args = process.argv.slice(2);
  const transport = args[0] === 'http' ? 'http' : 'stdio';
  const port = args[1] ? parseInt(args[1], 10) : undefined;
  
  return { transport, port };
}

/**
 * Main function to start the server
 */
async function main() {
  const { transport, port } = parseArgs();
  
  // Create the MCP server instance
  const mcpServer = createServer();
  
  try {
    switch (transport) {
      case 'stdio':
        // Set USE_TEST_FIXTURES to true by default when using stdio (Claude Desktop)
        if (!process.env.USE_TEST_FIXTURES && !process.stdout.isTTY) {
          process.env.USE_TEST_FIXTURES = 'true';
          console.error('Running in Claude Desktop, using test fixtures by default');
        }
        
        await createStdioTransport(mcpServer);
        break;
        
      case 'http':
        const { start } = await createHttpServer(mcpServer, { port });
        await start();
        break;
        
      default:
        throw new Error(`Unknown transport: ${transport}`);
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('\nShutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\nShutting down server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});