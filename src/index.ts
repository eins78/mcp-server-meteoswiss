#!/usr/bin/env node
/**
 * Main entry point for MeteoSwiss MCP server
 * Supports both stdio and HTTP transports
 */

import { createServer } from './server.js';
import { createStdioTransport } from './transports/stdio.js';
import { createHttpServer } from './transports/streamable-http.js';
import { debugMain, initFileLogging, closeFileLogging } from './utils/logger.js';

// Check Node.js version requirement
const MIN_NODE_VERSION = 16;
const nodeVersionMatch = process.version.match(/^v(\d+)\.(\d+)\.(\d+)/);
if (nodeVersionMatch) {
  const majorVersion = parseInt(nodeVersionMatch[1] || '0', 10);
  if (majorVersion < MIN_NODE_VERSION) {
    console.error(`ERROR: This MCP server requires Node.js version ${MIN_NODE_VERSION} or higher.`);
    console.error(`Current version: ${process.version}`);
    console.error(`Please upgrade Node.js to continue.`);
    process.exit(1);
  }
}

// Set up crash handlers
process.on('uncaughtException', (error) => {
  console.error('FATAL: Uncaught exception:', error);
  debugMain('FATAL: Uncaught exception: %O', error);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
    debugMain('Stack trace: %s', error.stack);
  }
  closeFileLogging();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('FATAL: Unhandled promise rejection at:', promise, 'reason:', reason);
  debugMain('FATAL: Unhandled rejection: %O', reason);
  if (reason instanceof Error && reason.stack) {
    console.error('Stack trace:', reason.stack);
    debugMain('Stack trace: %s', reason.stack);
  }
  closeFileLogging();
  process.exit(1);
});

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
  
  // Initialize logging
  initFileLogging('meteoswiss');
  debugMain('Starting MCP server with transport: %s, port: %d', transport, port || 3000);
  debugMain('Environment: USE_TEST_FIXTURES=%s, DEBUG_MCHMCP=%s', 
    process.env.USE_TEST_FIXTURES, process.env.DEBUG_MCHMCP);
  
  // Create the MCP server instance
  const mcpServer = createServer();
  
  try {
    switch (transport) {
      case 'stdio':
        // Set USE_TEST_FIXTURES to true by default when using stdio (Claude Desktop)
        if (!process.env.USE_TEST_FIXTURES && !process.stdout.isTTY) {
          process.env.USE_TEST_FIXTURES = 'true';
          console.error('Running in Claude Desktop, using test fixtures by default');
          debugMain('Set USE_TEST_FIXTURES=true for Claude Desktop');
        }
        
        debugMain('Creating stdio transport');
        await createStdioTransport(mcpServer);
        debugMain('Stdio transport ready');
        break;
        
      case 'http':
        debugMain('Creating HTTP server on port %d', port || 3000);
        const { start } = await createHttpServer(mcpServer, { port });
        await start();
        debugMain('HTTP server started');
        break;
        
      default:
        throw new Error(`Unknown transport: ${transport}`);
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    debugMain('Server startup failed: %O', error);
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

// Log startup environment information
console.error('=== MCP Server Startup Debug Info ===');
console.error(`Node Version: ${process.version}`);
console.error(`Platform: ${process.platform} ${process.arch}`);
console.error(`CWD: ${process.cwd()}`);
console.error(`Script: ${process.argv[1]}`);
console.error(`Args: ${process.argv.slice(2).join(' ')}`);
console.error(`ENV USE_TEST_FIXTURES: ${process.env.USE_TEST_FIXTURES}`);
console.error(`ENV DEBUG_MCHMCP: ${process.env.DEBUG_MCHMCP}`);
console.error(`ENV DEBUG: ${process.env.DEBUG}`);
console.error('=====================================');

// Start the server
debugMain('MeteoSwiss MCP server starting...');
main().catch((error) => {
  console.error('Unhandled error:', error);
  debugMain('Unhandled error in main: %O', error);
  process.exit(1);
});