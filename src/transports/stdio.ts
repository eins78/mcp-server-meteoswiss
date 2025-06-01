/**
 * Standard I/O transport for MCP server
 * For use with Claude Desktop and other stdio-based clients
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { debugTransport } from '../utils/logger.js';

/**
 * Create and start stdio transport
 * @param mcpServer - The MCP server instance
 */
export async function createStdioTransport(mcpServer: McpServer): Promise<void> {
  debugTransport('Creating stdio transport');
  const transport = new StdioServerTransport();
  
  debugTransport('Connecting stdio transport to MCP server');
  await mcpServer.connect(transport);
  debugTransport('Stdio transport connected successfully');
  
  // Log to stderr to avoid interfering with protocol messages
  console.error('MeteoSwiss MCP server started on stdio transport');
}