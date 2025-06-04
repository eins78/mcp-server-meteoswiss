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
import { renderHomepage } from '../support/markdown-rendering.js';

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
  
  // Configure CORS for Claude integration compatibility
  app.use(cors({
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
    exposedHeaders: ['X-Session-Id', 'X-Server-Version'],
    maxAge: 86400 // 24 hours
  }));
  
  // Add security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Server-Version', '1.0.0');
    next();
  });
  
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

  // Root endpoint - serves HTML documentation and discovery metadata
  app.get('/', asyncHandler(async (req: Request, res: Response) => {
    // Check if client wants JSON (API clients)
    if (req.accepts('json') && !req.accepts('html')) {
      res.json({
        name: 'MeteoSwiss MCP Server',
        version: '1.0.0',
        description: 'Model Context Protocol server for MeteoSwiss weather data',
        mcp: {
          endpoint: `http://${host}:${port}/mcp`,
          transport: 'sse',
          messageEndpoint: `http://${host}:${port}/messages`,
          protocol_version: '2024-11-05'
        },
        usage: `npx mcp-remote http://${host}:${port}/mcp`,
        health: `/health`,
        authentication: 'none'
      });
      return;
    }
    
    // Serve HTML homepage
    try {
      const html = await renderHomepage();
      res.type('html').send(html);
    } catch (error) {
      console.error('Failed to render homepage:', error);
      // Fallback to JSON
      res.json({
        name: 'MeteoSwiss MCP Server',
        version: '1.0.0',
        description: 'Model Context Protocol server for MeteoSwiss weather data',
        mcp_endpoint: `http://${host}:${port}/mcp`,
        usage: `npx mcp-remote http://${host}:${port}/mcp`,
        health: `/health`
      });
    }
  }));

  // MCP SSE endpoint - establishes the event stream
  app.get('/mcp', asyncHandler(async (req: Request, res: Response) => {
    // Create transport with the POST endpoint URL
    // The SSEServerTransport will set its own headers when start() is called
    const transport = new SSEServerTransport('/messages', res);
    
    // Keep-alive will be set up after connection
    let keepAliveInterval: NodeJS.Timeout | null = null;
    
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
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
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
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      transport.close();
    });
    
    req.on('error', (error: any) => {
      // Log error safely - strip all newlines and just log the error type
      const errorType = error?.code || error?.name || 'Unknown';
      console.error(`SSE connection error: ${errorType}`);
      
      // Send error event to client before closing
      try {
        res.write(`event: error\ndata: {"error": "${errorType}"}\n\n`);
      } catch (e) {
        // Ignore write errors on closed connection
      }
      
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
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
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      throw error;
    }
  }));

  // Message endpoint - receives client messages
  app.post('/messages', asyncHandler(async (req: Request, res: Response) => {
    // Check for session ID in query params or headers
    const sessionId = (req.query.sessionId as string) || req.headers['mcp-session-id'] as string;
    
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Valid sessionId required in query parameter or Mcp-Session-Id header' });
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