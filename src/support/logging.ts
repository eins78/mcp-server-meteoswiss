/**
 * Debug logging utility for MCP server
 * Logs to stderr (captured by Claude Desktop) and optionally to files
 */

import debugModule from 'debug';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create debug namespaces for different components
export const debugMain = debugModule('mcp:main');
export const debugServer = debugModule('mcp:server');
export const debugTransport = debugModule('mcp:transport');
export const debugTools = debugModule('mcp:tools');
export const debugData = debugModule('mcp:data');
export const debugHttp = debugModule('mcp:http');
export const debugSession = debugModule('mcp:session');
export const debugEnv = debugModule('mcp:env');

// Enable debug output based on environment variables
// Priority: DEBUG env var takes precedence, then DEBUG_MCHMCP for backward compatibility
if (process.env.DEBUG) {
  // Use the standard debug module pattern
  debugModule.enable(process.env.DEBUG);
} else if (process.env.DEBUG_MCHMCP === 'true') {
  // Legacy compatibility - enable all mcp namespaces
  debugModule.enable('mcp:*');
}

// File logging setup
// Use __dirname to get a path relative to the source file location
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(PROJECT_ROOT, '.debug', 'logs');
let logStream: fs.WriteStream | null = null;

/**
 * Initialize file logging if DEBUG_MCHMCP is enabled
 */
export function initFileLogging(clientName?: string): void {
  if (process.env.DEBUG_MCHMCP !== 'true') {
    return;
  }

  try {
    // Create log directory if it doesn't exist (with parent directories)
    fs.mkdirSync(LOG_DIR, { recursive: true });

    // Generate log filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const clientPart = clientName ? `_${clientName.replace(/[^a-zA-Z0-9]/g, '-')}` : '';
    const logFile = path.join(LOG_DIR, `mcp-server${clientPart}_${timestamp}.log`);

    // Create write stream
    logStream = fs.createWriteStream(logFile, { flags: 'a' });

    // Override debug output to write to both stderr and file
    const originalLog = debugModule.log;
    debugModule.log = function(...args: any[]) {
      // Write to stderr (default behavior)
      originalLog.apply(debugModule, args);
      
      // Also write to file
      if (logStream && logStream.writable) {
        const message = args.join(' ');
        logStream.write(`${message}\n`);
      }
    };

    debugMain(`Logging initialized to file: ${logFile}`);
  } catch (error) {
    console.error('Failed to initialize file logging:', error);
  }
}

/**
 * Close log file stream
 */
export function closeFileLogging(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

// Ensure logs are flushed on exit
process.on('exit', () => {
  closeFileLogging();
});