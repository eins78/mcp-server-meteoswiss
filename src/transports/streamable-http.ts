/**
 * Streamable HTTP transport for MCP server
 * Implements Server-Sent Events (SSE) for real-time communication
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

interface StreamableHttpOptions {
  port?: number;
  host?: string;
}

/**
 * Create HTTP server with SSE transport
 */
export async function createHttpServer(
  mcpServer: McpServer,
  options: StreamableHttpOptions = {}
): Promise<{ app: express.Application; start: () => Promise<void> }> {
  const { port = 3000, host = 'localhost' } = options;

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Store active transports by session ID
  const transports: Record<string, SSEServerTransport> = {};

  // Root endpoint - serves information page
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'MeteoSwiss MCP Server',
      version: '1.0.0',
      description: 'Model Context Protocol server for MeteoSwiss weather data',
      mcp_endpoint: `http://${host}:${port}/mcp`,
      usage: `npx mcp-remote http://${host}:${port}/mcp`,
      health: `/health`
    });
  });

  // MCP SSE endpoint - establishes the event stream
  app.get('/mcp', async (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

    // Create transport with the POST endpoint URL
    const transport = new SSEServerTransport('/messages', res);
    
    // Store transport by session ID
    transports[transport.sessionId] = transport;
    console.error(`New SSE connection established: ${transport.sessionId}`);
    
    // Set up cleanup on close
    transport.onclose = () => {
      console.error(`SSE connection closed: ${transport.sessionId}`);
      delete transports[transport.sessionId];
    };
    
    // Handle errors
    req.on('close', () => {
      transport.close();
    });
    
    req.on('error', (error: any) => {
      // Log error safely - strip all newlines and just log the error type
      const errorType = error?.code || error?.name || 'Unknown';
      console.error(`SSE connection error: ${errorType}`);
      transport.close();
    });
    
    // Connect transport to MCP server
    // Note: connect() automatically calls start() on the transport
    await mcpServer.connect(transport);
  });

  // Message endpoint - receives client messages
  app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }
    
    const transport = transports[sessionId];
    if (!transport) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    try {
      // Let the transport handle the message
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('Error handling message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ 
      status: 'ok', 
      sessions: Object.keys(transports).length,
      endpoint: `http://${host}:${port}/mcp`
    });
  });

  const start = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Listen on localhost only for better compatibility
      const server = app.listen(port, () => {
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        const actualHost = typeof address === 'object' && address ? address.address : 'unknown';
        console.error(`MCP server listening on http://localhost:${actualPort}`);
        console.error(`MCP endpoint: http://localhost:${actualPort}/mcp`);
        console.error(`Message endpoint: http://localhost:${actualPort}/messages`);
        console.error(`Server bound to: ${actualHost}:${actualPort}`);
        resolve();
      });
      
      server.on('error', (err) => {
        console.error('Server error:', err);
        reject(err);
      });
      
      // Keep reference to prevent GC
      (app as any).__server = server;
    });
  };

  return { app, start };
}