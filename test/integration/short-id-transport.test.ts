import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpServer } from '../../src/transports/streamable-http.js';
import { validateEnv } from '../../src/support/environment-validation.js';
import debugModule from 'debug';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Enable debug for test
debugModule.enable('mcp:transport');

describe('Short ID Transport', () => {
  it('should generate short session IDs for SSE connections', async () => {
    // Capture console.error output
    const errorLogs: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => {
      errorLogs.push(args.join(' '));
      originalError(...args);
    };
    
    let client: Client | null = null;
    
    try {
      const mcpServer = new McpServer({
        name: 'test-server',
        version: '1.0.0'
      });
      
      const server = await createHttpServer(mcpServer, {
        port: 0, // Use random port
        config: validateEnv()
      });
      
      await server.start();
      const httpServer = (server.app as any).__server as http.Server;
      const address = httpServer.address() as { port: number };
      const port = address.port;
      
      // Create MCP client with StreamableHTTP transport
      const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
      client = new Client({
        name: 'test-client',
        version: '1.0.0'
      });
      
      // Connect - this will handle initialization and session creation
      await client.connect(transport);
      
      // Check the logs for short session ID
      const sessionLog = errorLogs.find(log => log.includes('New session initialized:'));
      expect(sessionLog).toBeDefined();
      
      if (sessionLog) {
        // Extract session ID from log: "New session initialized: SESSION_ID"
        const match = sessionLog.match(/New session initialized: ([a-zA-Z0-9_-]+)/);
        const sessionId = match?.[1];
        
        expect(sessionId).toBeDefined();
        // Short UUIDs are typically 22 characters, regular UUIDs are 36
        expect(sessionId!.length).toBeLessThan(30);
        expect(sessionId!.length).toBeGreaterThan(10);
        
        // Should not contain UUID hyphens
        expect(sessionId).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      }
      
      // Clean up client
      if (client) {
        await client.close();
      }
      
      // Clean up server
      await server.stop();
    } finally {
      console.error = originalError;
    }
  });
});