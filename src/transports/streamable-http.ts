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
import { debugTransport } from '../support/logging.js';
import { getMcpEndpointUrl } from '../support/url-generation.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

interface StreamableHttpOptions {
  port?: number;
  host?: string;
  config: EnvConfig;
}

// Type for the HTTP server interface returned by createHttpServer
export interface HttpServerInterface {
  app: express.Application;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Create HTTP server with SSE transport
 */
export async function createHttpServer(
  mcpServer: McpServer,
  options: StreamableHttpOptions
): Promise<HttpServerInterface> {
  const { port = 3000, host = 'localhost', config } = options;
  debugTransport('Creating HTTP server on port %d, host %s', port, host);
  debugTransport('Configuration: %O', config);

  const app = express();

  // Configure CORS for production
  app.use(
    cors({
      origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
      credentials: true,
    })
  );

  // Configure request size limit
  app.use(express.json({ limit: config.REQUEST_SIZE_LIMIT }));

  // Configure rate limiting
  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      debugTransport('Rate limit exceeded for IP: %s', req.ip);
      res.status(429).json({ error: 'Too many requests, please try again later.' });
    },
  });

  // Apply rate limiting to all routes
  app.use(limiter);

  // Global error handler for async routes
  const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // Session manager for transport cleanup
  const sessionManager = new SessionManager(config.MAX_SESSIONS, config.SESSION_TIMEOUT_MS);
  debugTransport(
    'Session manager created with max sessions: %d, timeout: %dms',
    config.MAX_SESSIONS,
    config.SESSION_TIMEOUT_MS
  );

  // Root endpoint - serves HTML documentation
  app.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      debugTransport('Root endpoint accessed, Accept: %s', req.get('Accept'));
      // Check if client wants JSON (API clients)
      if (req.accepts('json') && !req.accepts('html')) {
        res.json({
          name: 'MeteoSwiss MCP Server',
          version: '1.0.0',
          description: 'Model Context Protocol server for MeteoSwiss weather data',
          mcp_endpoint: getMcpEndpointUrl(config),
          usage: `npx mcp-remote ${getMcpEndpointUrl(config)}`,
          health: `/health`,
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
          mcp_endpoint: getMcpEndpointUrl(config),
          usage: `npx mcp-remote ${getMcpEndpointUrl(config)}`,
          health: `/health`,
        });
      }
    })
  );

  // MCP SSE endpoint - establishes the event stream
  app.get(
    '/mcp',
    asyncHandler(async (req: Request, res: Response) => {
      debugTransport(
        'SSE connection requested from %s, User-Agent: %s',
        req.ip,
        req.get('User-Agent')
      );

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

      // Create transport with the POST endpoint URL
      const transport = new SSEServerTransport('/messages', res);
      debugTransport('Created SSE transport with session ID: %s', transport.sessionId);

      // Store transport in session manager
      try {
        sessionManager.add(transport.sessionId, transport);
        console.error(`New SSE connection established: ${transport.sessionId}`);
        debugTransport('Session added successfully, current sessions: %d', sessionManager.size);
      } catch (error) {
        console.error(`Failed to add session: ${error}`);
        debugTransport('Failed to add session: %O', error);
        res.status(503).end('Server capacity reached');
        return;
      }

      // Set up cleanup on close
      transport.onclose = () => {
        console.error(`SSE connection closed: ${transport.sessionId}`);
        debugTransport('Transport closed, removing session: %s', transport.sessionId);
        sessionManager.remove(transport.sessionId);
        debugTransport('Active sessions after removal: %d', sessionManager.size);
      };

      // Set connection timeout
      const timeout = setTimeout(() => {
        console.error(`SSE connection timeout: ${transport.sessionId}`);
        debugTransport('Session timeout triggered for: %s', transport.sessionId);
        transport.close();
      }, config.SESSION_TIMEOUT_MS);

      // Clear timeout on activity
      const originalSend = transport.send.bind(transport);
      transport.send = (message: JSONRPCMessage) => {
        clearTimeout(timeout);
        debugTransport('Activity detected on session %s, timeout cleared', transport.sessionId);
        return originalSend(message);
      };

      // Handle errors
      req.on('close', () => {
        debugTransport('Client disconnected for session: %s', transport.sessionId);
        transport.close();
      });

      req.on('error', (error: unknown) => {
        // Log error safely - strip all newlines and just log the error type
        const errorType =
          (error &&
            typeof error === 'object' &&
            ('code' in error
              ? error.code
              : typeof error === 'object' && 'name' in error
                ? error.name
                : 0)) ||
          'Unknown';
        console.error(`SSE connection error: ${errorType}`);
        debugTransport('SSE connection error for session %s: %O', transport.sessionId, error);
        transport.close();
      });

      // Connect transport to MCP server
      // Note: connect() automatically calls start() on the transport
      try {
        debugTransport('Connecting transport to MCP server for session: %s', transport.sessionId);
        await mcpServer.connect(transport);
        debugTransport('Transport connected successfully for session: %s', transport.sessionId);
      } catch (error) {
        console.error(`Failed to connect transport: ${error}`);
        debugTransport(
          'Failed to connect transport for session %s: %O',
          transport.sessionId,
          error
        );
        sessionManager.remove(transport.sessionId);
        clearTimeout(timeout);
        throw error;
      }
    })
  );

  // Message endpoint - receives client messages
  app.post(
    '/messages',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      debugTransport('Message received for session: %s', sessionId);

      if (!sessionId || typeof sessionId !== 'string') {
        debugTransport('Invalid session ID in message request');
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
        debugTransport('Session not found: %s', sessionId);
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      try {
        // Let the transport handle the message
        debugTransport('Processing message for session %s: %O', sessionId, req.body);
        await transport.handlePostMessage(req, res, req.body);
        debugTransport('Message processed successfully for session: %s', sessionId);
      } catch (error) {
        console.error('Error handling message:', error);
        debugTransport('Error handling message for session %s: %O', sessionId, error);
        res.status(500).json({ error: 'Internal server error' });
      }
    })
  );

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    const health = {
      status: 'ok',
      sessions: sessionManager.size,
      endpoint: getMcpEndpointUrl(config),
    };
    debugTransport('Health check requested, response: %O', health);
    res.json(health);
  });

  const start = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      debugTransport('Starting HTTP server on %s:%d', config.BIND_ADDRESS, port);
      // Listen on configured interface
      const server = app.listen(port, config.BIND_ADDRESS, () => {
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        const actualHost = typeof address === 'object' && address ? address.address : 'unknown';
        // Log server startup info to debug namespace only
        debugTransport('MCP server listening on %s:%d', actualHost, actualPort);
        debugTransport('Endpoints: /mcp (SSE), /messages (POST), /health (GET)');
        debugTransport('Server started successfully on %s:%d', actualHost, actualPort);
        resolve();
      });

      server.on('error', (err: unknown) => {
        console.error('Server error:', err);
        debugTransport('Server startup error: %O', err);
        reject(err);
      });

      // Store server reference in closure to keep it from being GC'd
      // The server is kept alive by the Express app's internal reference
    });
  };

  // Global error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    debugTransport('Unhandled error on %s %s: %O', req.method, req.path, err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const stop = (): void => {
    debugTransport('Stopping HTTP server, cleaning up %d sessions', sessionManager.size);
    sessionManager.stop();
    // Note: Express app handles server cleanup internally
    debugTransport('Server stopped');
  };

  return { app, start, stop };
}
