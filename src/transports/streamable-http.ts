/**
 * Streamable HTTP transport for MCP server
 * Implements the MCP Streamable HTTP transport protocol with:
 * - HTTP POST for client-to-server messages
 * - Optional Server-Sent Events (SSE) for server-to-client streaming
 * - Session management with short UUIDs
 * - Rate limiting and security features
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import rateLimit from 'express-rate-limit';
import short from 'short-uuid';
import { randomUUID } from 'node:crypto';
import { SessionManager } from '../support/session-management.js';
import type { EnvConfig } from '../support/environment-validation.js';
import { renderHomepage } from '../support/markdown-rendering.js';
import { debugTransport, runWithSession } from '../support/logging.js';
import { getMcpEndpointUrl } from '../support/url-generation.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

interface StreamableHttpOptions {
  port?: number;
  host?: string;
  config: EnvConfig;
}

// Type for the HTTP server interface returned by createHttpServer
export interface HttpServerInterface {
  app: express.Application;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Create HTTP server with Streamable HTTP transport
 * 
 * Endpoints:
 * - GET /mcp - SSE streaming for server-to-client messages (requires session ID)
 * - POST /mcp - Initialize sessions and handle client-to-server messages
 * - DELETE /mcp - Terminate sessions
 * - GET /health - Health check endpoint
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

  // Create a short UUID translator
  const translator = short();

  // Map to store transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

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
          capabilities: {
            tools: ['meteoswissWeatherReport', 'search', 'fetch'],
            prompts: ['wetterNordschweiz', 'wetterSchweiz', 'meteoSuisseRomande', 'meteoTicino'],
            regions: ['north', 'south', 'west'],
            languages: ['de', 'fr', 'it'],
          },
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
          capabilities: {
            tools: ['meteoswissWeatherReport', 'search', 'fetch'],
            prompts: ['wetterNordschweiz', 'wetterSchweiz', 'meteoSuisseRomande', 'meteoTicino'],
            regions: ['north', 'south', 'west'],
            languages: ['de', 'fr', 'it'],
          },
        });
      }
    })
  );

  // MCP GET endpoint - handles SSE streaming for server-to-client messages
  app.get(
    '/mcp',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !transports.has(sessionId)) {
        debugTransport('GET /mcp request without valid session ID');
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = transports.get(sessionId)!;
      debugTransport('SSE streaming connection requested for session: %s', sessionId);

      // Let the transport handle the SSE streaming connection
      await transport.handleRequest(req, res);
    })
  );

  // MCP POST endpoint - handles initialization and regular messages
  app.post(
    '/mcp',
    asyncHandler(async (req: Request, res: Response) => {
      debugTransport('Received MCP request: %O', req.body);

      try {
        // Check for existing session ID
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports.has(sessionId)) {
          // Reuse existing transport
          transport = transports.get(sessionId)!;
          debugTransport('Using existing transport for session: %s', sessionId);
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request - create transport with short session ID
          const shortId = translator.fromUUID(randomUUID());

          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => shortId,
            onsessioninitialized: (sessionId) => {
              runWithSession(sessionId, () => {
                // Store the transport by session ID
                console.error(`New session initialized: ${sessionId}`);
                debugTransport('Session initialized with ID: %s', sessionId);
                transports.set(sessionId, transport);
                sessionManager.add(sessionId, transport);
                debugTransport(
                  'Session added successfully, current sessions: %d',
                  sessionManager.size
                );
              });
            },
          });

          // Set up cleanup handlers
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) {
              runWithSession(sid, () => {
                console.error(`Session closed: ${sid}`);
                debugTransport(
                  'Transport closed for session %s, removing from transports map',
                  sid
                );
                transports.delete(sid);
                sessionManager.remove(sid);
                debugTransport('Active sessions after removal: %d', sessionManager.size);
              });
            }
          };

          // Set up timeout management
          const timeout = setTimeout(() => {
            const sid = transport.sessionId;
            if (sid) {
              runWithSession(sid, () => {
                console.error(`Session timeout: ${sid}`);
                debugTransport('Session timeout triggered for: %s', sid);
                transport.close();
              });
            }
          }, config.SESSION_TIMEOUT_MS);

          // Clear timeout on activity
          const originalSend = transport.send.bind(transport);
          transport.send = (message: JSONRPCMessage) => {
            clearTimeout(timeout);
            const sid = transport.sessionId;
            if (sid) {
              runWithSession(sid, () => {
                debugTransport('Activity detected on session %s, timeout cleared', sid);
              });
            }
            return originalSend(message);
          };

          // Connect the transport to the MCP server BEFORE handling the request
          debugTransport('Connecting new transport to MCP server');
          await mcpServer.connect(transport);
          debugTransport('Transport connected successfully');
        } else {
          // Invalid request - no session ID or not initialization request
          debugTransport('Invalid request - no session ID and not an initialization request');
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
          return;
        }

        // Handle the request with the transport
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        debugTransport('Error handling MCP request: %O', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    })
  );

  // MCP DELETE endpoint - handles session termination
  app.delete(
    '/mcp',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !transports.has(sessionId)) {
        debugTransport('DELETE /mcp request without valid session ID');
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      debugTransport('Received session termination request for session %s', sessionId);

      try {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('Error handling session termination:', error);
        debugTransport('Error handling session termination: %O', error);
        if (!res.headersSent) {
          res.status(500).send('Error processing session termination');
        }
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
        debugTransport(
          'Endpoints: /mcp (GET for SSE, POST for messages, DELETE for termination), /health (GET)'
        );
        debugTransport('Server started successfully on %s:%d', actualHost, actualPort);
        resolve();
      });

      server.on('error', (err: unknown) => {
        console.error('Server error:', err);
        debugTransport('Server startup error: %O', err);
        reject(err);
      });

      // Store server reference for tests to access
      // This is a workaround for test compatibility
      (app as express.Application & { __server?: unknown }).__server = server;
    });
  };

  // Global error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    debugTransport('Unhandled error on %s %s: %O', req.method, req.path, err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const stop = async (): Promise<void> => {
    debugTransport('Stopping HTTP server, cleaning up %d sessions', sessionManager.size);

    // Close all active transports
    for (const [sessionId, transport] of transports) {
      try {
        debugTransport('Closing transport for session %s', sessionId);
        await transport.close();
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
        debugTransport('Error closing transport for session %s: %O', sessionId, error);
      }
    }
    transports.clear();

    sessionManager.stop();
    // Note: Express app handles server cleanup internally
    debugTransport('Server stopped');
  };

  return { app, start, stop };
}
