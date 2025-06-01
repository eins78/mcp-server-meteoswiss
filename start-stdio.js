#!/usr/bin/env node

/**
 * Standalone starter for Claude Desktop
 * This file runs the compiled JavaScript directly without any dependencies
 */

// Add startup debug info
console.error('=== MCP Server Launcher Debug Info ===');
console.error(`Launcher Node Version: ${process.version}`);
console.error(`Launcher Platform: ${process.platform} ${process.arch}`);
console.error(`Launcher CWD: ${process.cwd()}`);
console.error(`Launcher Script: ${__filename}`);
console.error('======================================');

// Set stdio argument
process.argv = [process.argv[0], process.argv[1], 'stdio'];

// Import and run the compiled server
import('./dist/index.js').catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});