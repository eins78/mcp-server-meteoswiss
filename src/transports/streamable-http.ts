/**
 * Streamable HTTP transport for MCP server
 * Implements Server-Sent Events (SSE) for real-time communication
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import rateLimit from 'express-rate-limit';
import { SessionManager } from '../support/session-management.js';
import type { EnvConfig } from '../support/environment-validation.js';

interface StreamableHttpOptions {
  port?: number;
  host?: string;
  config: EnvConfig;
}

/**
 * Create HTTP server with SSE transport
 */
export async function createHttpServer(
  mcpServer: McpServer,
  options: StreamableHttpOptions
): Promise<{ app: express.Application; start: () => Promise<void>; stop: () => void }> {
  const { port = 3000, host = 'localhost', config } = options;

  const app = express();
  
  // Configure CORS for production
  app.use(cors({
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
    credentials: true
  }));
  
  // Configure request size limit
  app.use(express.json({ limit: config.REQUEST_SIZE_LIMIT }));
  
  // Configure rate limiting
  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  // Apply rate limiting to all routes
  app.use(limiter);
  
  // Global error handler for async routes
  const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  
  // Session manager for transport cleanup
  const sessionManager = new SessionManager(config.MAX_SESSIONS, config.SESSION_TIMEOUT_MS);

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
  app.get('/mcp', asyncHandler(async (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

    // Create transport with the POST endpoint URL
    const transport = new SSEServerTransport('/messages', res);
    
    // Store transport in session manager
    try {
      sessionManager.add(transport.sessionId, transport);
      console.error(`New SSE connection established: ${transport.sessionId}`);
    } catch (error) {
      console.error(`Failed to add session: ${error}`);
      res.status(503).end('Server capacity reached');
      return;
    }
    
    // Set up cleanup on close
    transport.onclose = () => {
      console.error(`SSE connection closed: ${transport.sessionId}`);
      sessionManager.remove(transport.sessionId);
    };
    
    // Set connection timeout
    const timeout = setTimeout(() => {
      console.error(`SSE connection timeout: ${transport.sessionId}`);
      transport.close();
    }, config.SESSION_TIMEOUT_MS);
    
    // Clear timeout on activity
    const originalSend = transport.send.bind(transport);
    transport.send = (message: any) => {
      clearTimeout(timeout);
      return originalSend(message);
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
    try {
      await mcpServer.connect(transport);
    } catch (error) {
      console.error(`Failed to connect transport: ${error}`);
      sessionManager.remove(transport.sessionId);
      clearTimeout(timeout);
      throw error;
    }
  }));

  // Message endpoint - receives client messages
  app.post('/messages', asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Valid sessionId required' });
      return;
    }
    
    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }
    
    const transport = sessionManager.get(sessionId) as SSEServerTransport;
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
  }));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ 
      status: 'ok', 
      sessions: sessionManager.size,
      endpoint: `http://${host}:${port}/mcp`
    });
  });

  const start = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Listen on configured interface
      const server = app.listen(port, config.BIND_ADDRESS, () => {
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

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  
  const stop = () => {
    sessionManager.stop();
  };
  
  return { app, start, stop };
}