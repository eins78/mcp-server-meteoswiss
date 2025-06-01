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

  // SSE endpoint - establishes the event stream
  app.get('/sse', async (req: Request, res: Response) => {
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
    
    req.on('error', (error) => {
      console.error('SSE connection error:', error);
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
      endpoint: `http://${host}:${port}/sse`
    });
  });

  const start = async (): Promise<void> => {
    return new Promise((resolve) => {
      app.listen(port, host, () => {
        console.error(`MCP server listening on http://${host}:${port}`);
        console.error(`SSE endpoint: http://${host}:${port}/sse`);
        console.error(`Message endpoint: http://${host}:${port}/messages`);
        resolve();
      });
    });
  };

  return { app, start };
}