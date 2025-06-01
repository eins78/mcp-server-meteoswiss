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

  // Session management
  const sessions = new Map<string, SSEServerTransport>();

  // Initialize or handle session
  app.post('/sse', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string || generateSessionId();
    
    let transport = sessions.get(sessionId);
    if (!transport) {
      transport = new SSEServerTransport('/sse', res);
      await mcpServer.connect(transport);
      sessions.set(sessionId, transport);
    }

    res.json({ 
      url: `/sse?sessionId=${sessionId}`,
      sessionId
    });
  });

  // SSE endpoint for receiving events
  app.get('/sse', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    });

    // Send initial connection event
    res.write(':ok\n\n');

    // Create new transport for this connection
    const transport = new SSEServerTransport('/sse', res);
    await mcpServer.connect(transport);
    sessions.set(sessionId, transport);

    // Handle client disconnect
    req.on('close', () => {
      console.error(`Client disconnected from session ${sessionId}`);
      transport.close();
      sessions.delete(sessionId);
    });
  });

  // Clean up session
  app.delete('/sse', (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const transport = sessions.get(sessionId);
    if (transport) {
      transport.close();
      sessions.delete(sessionId);
    }

    res.status(200).json({ message: 'Session closed' });
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', sessions: sessions.size });
  });

  const start = async (): Promise<void> => {
    return new Promise((resolve) => {
      app.listen(port, host, () => {
        console.error(`MCP server listening on http://${host}:${port}`);
        console.error(`SSE endpoint: http://${host}:${port}/sse`);
        resolve();
      });
    });
  };

  return { app, start };
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}