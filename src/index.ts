#!/usr/bin/env node
/**
 * Main entry point for MeteoSwiss MCP server
 * HTTP-only server for use with mcp-remote
 */

import { createServer } from './server.js';
import { createHttpServer } from './transports/streamable-http.js';
import { debugMain, initFileLogging, closeFileLogging } from './support/logging.js';
import { validateEnv } from './support/environment-validation.js';

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
 * Main function to start the server
 */
async function main() {
  // Validate environment variables first
  let config;
  try {
    config = validateEnv();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
  
  // Override port from command line if provided
  const port = process.argv[2] ? parseInt(process.argv[2], 10) : config.PORT;
  
  // Initialize logging
  initFileLogging('meteoswiss');
  debugMain('Starting MCP HTTP server on port: %d', port);
  debugMain('Environment: USE_TEST_FIXTURES=%s, DEBUG_MCHMCP=%s', 
    config.USE_TEST_FIXTURES, config.DEBUG_MCHMCP);
  
  // Create the MCP server instance
  const mcpServer = createServer();
  
  let server: { start: () => Promise<void>; stop: () => void } | null = null;
  
  try {
    debugMain('Creating HTTP server on port %d', port);
    server = await createHttpServer(mcpServer, { port, host: config.BIND_ADDRESS, config });
    await server.start();
    debugMain('HTTP server started');
    console.log(`MCP server running at http://${config.BIND_ADDRESS === '0.0.0.0' ? 'localhost' : config.BIND_ADDRESS}:${port}/mcp`);
    console.log(`Use with: npx mcp-remote http://localhost:${port}/mcp`);
  } catch (error) {
    console.error('Failed to start server:', error);
    debugMain('Server startup failed: %O', error);
    process.exit(1);
  }
  
  // Store server reference for cleanup
  return server;
}

// Global server reference for cleanup
let globalServer: { stop: () => void } | null = null;

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('\nShutting down server...');
  debugMain('SIGINT received, initiating graceful shutdown');
  if (globalServer) {
    debugMain('Stopping server...');
    globalServer.stop();
  }
  debugMain('Closing log files...');
  closeFileLogging();
  debugMain('Shutdown complete');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\nShutting down server...');
  debugMain('SIGTERM received, initiating graceful shutdown');
  if (globalServer) {
    debugMain('Stopping server...');
    globalServer.stop();
  }
  debugMain('Closing log files...');
  closeFileLogging();
  debugMain('Shutdown complete');
  process.exit(0);
});

// Log startup environment information
console.error('=== MCP Server Startup Debug Info ===');
console.error(`Node Version: ${process.version}`);
console.error(`Platform: ${process.platform} ${process.arch}`);
console.error(`CWD: ${process.cwd()}`);
console.error(`Script: ${process.argv[1]}`);
console.error(`Port: ${process.argv[2] || process.env.PORT || '3000'}`);
console.error(`ENV USE_TEST_FIXTURES: ${process.env.USE_TEST_FIXTURES}`);
console.error(`ENV DEBUG_MCHMCP: ${process.env.DEBUG_MCHMCP}`);
console.error(`ENV DEBUG: ${process.env.DEBUG}`);
console.error('=====================================');

// Start the server
debugMain('MeteoSwiss MCP server starting...');
debugMain('Process info: PID=%d, UID=%d, GID=%d', process.pid, process.getuid?.() || -1, process.getgid?.() || -1);
debugMain('Memory usage at startup: %O', process.memoryUsage());

main().then((server) => {
  globalServer = server;
  debugMain('Server started successfully');
  debugMain('Memory usage after startup: %O', process.memoryUsage());
}).catch((error) => {
  console.error('Unhandled error:', error);
  debugMain('Unhandled error in main: %O', error);
  process.exit(1);
});