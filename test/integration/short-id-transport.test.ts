import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpServer } from '../../src/transports/streamable-http.js';
import { validateEnv } from '../../src/support/environment-validation.js';
import debugModule from 'debug';

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
      
      // Create SSE connection
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/mcp`, {
          headers: {
            'Accept': 'text/event-stream'
          }
        }, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toMatch(/text\/event-stream/);
          
          // Give it a moment to establish connection
          setTimeout(() => {
            req.destroy();
            resolve();
          }, 100);
        });
        
        req.on('error', reject);
      });
      
      // Check the logs for short session ID
      const sessionLog = errorLogs.find(log => log.includes('New SSE connection established:'));
      expect(sessionLog).toBeDefined();
      
      if (sessionLog) {
        // Extract session ID from log: "New SSE connection established: SESSION_ID"
        const match = sessionLog.match(/New SSE connection established: ([a-zA-Z0-9_-]+)/);
        const sessionId = match?.[1];
        
        expect(sessionId).toBeDefined();
        // Short UUIDs are typically 22 characters, regular UUIDs are 36
        expect(sessionId!.length).toBeLessThan(30);
        expect(sessionId!.length).toBeGreaterThan(10);
        
        // Should not contain UUID hyphens
        expect(sessionId).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      }
      
      // Cleanup
      server.stop();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    } finally {
      console.error = originalError;
    }
  });
});