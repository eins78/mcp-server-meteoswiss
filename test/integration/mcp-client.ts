import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import net from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');

/**
 * Options for configuring the MCP client
 */
export type MCPClientOptions = {
  /**
   * Environment variables to pass to the server process
   */
  env?: Record<string, string>;
  /**
   * Port to run the HTTP server on (default: random)
   */
  port?: number;
};

/**
 * A simple MCP client for testing purposes.
 * This client starts an HTTP server and uses mcp-remote to connect to it.
 */
export class MCPClient {
  private serverProcess: ChildProcess | null = null;
  private mcpRemoteProcess: ChildProcess | null = null;
  private initialized = false;
  private requestId = 0;
  private responseHandlers: Map<number, (response: any) => void> = new Map();
  private options: MCPClientOptions;
  private port: number;

  constructor(options: MCPClientOptions = {}) {
    this.options = options;
    this.port = options.port || this.getRandomPort();
  }

  /**
   * Get a random port number for testing
   */
  private getRandomPort(): number {
    return Math.floor(Math.random() * 10000) + 30000;
  }

  /**
   * Wait for the HTTP server to be ready
   */
  private async waitForServer(maxAttempts = 50): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise((resolve, reject) => {
          const socket = net.connect(this.port, 'localhost', () => {
            socket.end();
            resolve(true);
          });
          socket.on('error', reject);
        });
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    throw new Error('Server failed to start in time');
  }

  /**
   * Start the MCP server process
   */
  async start(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Start the HTTP server process using built JS
        this.serverProcess = spawn('node', [SERVER_PATH, String(this.port)], {
          env: { ...process.env, NODE_ENV: 'test', ...this.options.env },
        });

        // Set up error handling
        this.serverProcess.on('error', (error) => {
          console.error('MCP server process error:', error);
          reject(error);
        });

        // Handle server process output (for debugging)
        let serverBuffer = '';
        this.serverProcess.stderr?.on('data', (data) => {
          const output = data.toString();
          serverBuffer += output;
          // Don't output during tests unless debugging
          if (process.env.DEBUG) {
            console.error(`MCP Server (stderr): ${output}`);
          }
        });

        this.serverProcess.stdout?.on('data', (data) => {
          if (process.env.DEBUG) {
            console.error(`MCP Server (stdout): ${data}`);
          }
        });

        // Wait for the HTTP server to be ready
        await this.waitForServer();

        // Start mcp-remote to connect to the HTTP server
        this.mcpRemoteProcess = spawn('npx', ['mcp-remote', `http://localhost:${this.port}/mcp`], {
          env: { ...process.env },
        });

        // Set up error handling for mcp-remote
        this.mcpRemoteProcess.on('error', (error) => {
          console.error('mcp-remote process error:', error);
          reject(error);
        });

        // Process responses from mcp-remote
        this.mcpRemoteProcess.stdout?.on('data', (data) => {
          const responses = data.toString().split('\n').filter(Boolean);
          for (const response of responses) {
            try {
              const parsed = JSON.parse(response);
              if (parsed.id !== undefined && this.responseHandlers.has(parsed.id)) {
                const handler = this.responseHandlers.get(parsed.id);
                if (handler) {
                  handler(parsed);
                  this.responseHandlers.delete(parsed.id);
                }
              }
            } catch (error) {
              // Ignore non-JSON output
              if (process.env.DEBUG) {
                console.error('Non-JSON output from mcp-remote:', response);
              }
            }
          }
        });

        this.mcpRemoteProcess.stderr?.on('data', (data) => {
          if (process.env.DEBUG) {
            console.error(`mcp-remote (stderr): ${data}`);
          }
        });

        // Initialize the connection
        this.initialize().then(resolve).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initialize the MCP connection
   * This is called internally by start()
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    const initializeResult = await this.sendRequest({
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: {
          name: 'mcp-integration-tests',
          version: '1.0.0',
        },
        capabilities: {},
      },
    });

    // Send initialized notification
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });

    this.initialized = true;
  }

  /**
   * Call an MCP tool
   *
   * @param name The name of the tool to call
   * @param parameters The parameters for the tool
   * @returns The result of the tool call
   */
  async callTool(name: string, parameters: Record<string, any>): Promise<any> {
    // Format the request according to MCP protocol specification
    const request = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'tools/call',
      params: {
        name,
        arguments: parameters || {}, // The SDK expects 'arguments' not 'parameters'
      },
    };

    // Debug log only if DEBUG env var is set
    if (process.env.DEBUG) {
      console.error('Sending tool call request:', JSON.stringify(request, null, 2));
    }

    try {
      const result = await this.sendRequest(request);

      // Debug response only if DEBUG env var is set
      if (process.env.DEBUG) {
        console.error('Tool call response:', JSON.stringify(result, null, 2));
      }

      if (!result.result) {
        throw new Error(`No result returned from tool call ${name}`);
      }

      return result.result;
    } catch (error) {
      if (process.env.DEBUG) {
        console.error(`Error calling tool ${name}:`, error);
      }
      throw error;
    }
  }

  /**
   * Stop the MCP server process
   */
  async stop(): Promise<void> {
    // Try to cleanly shutdown via exit notification
    if (this.mcpRemoteProcess) {
      try {
        await this.sendNotification({
          jsonrpc: '2.0',
          method: 'exit',
          params: {},
        });
      } catch (error) {
        console.error('Error sending exit notification:', error);
      }

      // Kill the mcp-remote process
      this.mcpRemoteProcess.kill();
      this.mcpRemoteProcess = null;
    }

    // Kill the server process
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    this.initialized = false;
  }

  /**
   * Send a request to the MCP server
   *
   * @param request The request to send
   * @returns The response from the server
   */
  private async sendRequest(request: any): Promise<any> {
    if (!this.mcpRemoteProcess) {
      throw new Error('mcp-remote process not started');
    }

    return new Promise((resolve, reject) => {
      try {
        // Register response handler
        this.responseHandlers.set(request.id, (response) => {
          if (response.error) {
            if (process.env.DEBUG) {
              console.error('Error response received:', JSON.stringify(response.error, null, 2));
            }
            reject(new Error(JSON.stringify(response.error)));
          } else {
            resolve(response);
          }
        });

        // Ensure proper JSON-RPC format
        const jsonRpcRequest = {
          jsonrpc: '2.0',
          id: request.id,
          method: request.method,
          params: request.params,
        };

        // Send the request with a newline terminator
        const requestStr = JSON.stringify(jsonRpcRequest) + '\n';

        // Debug output for request
        if (process.env.DEBUG) {
          console.error('Sending request:', requestStr);
        }

        this.mcpRemoteProcess?.stdin?.write(requestStr);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send a notification to the MCP server (no response expected)
   *
   * @param notification The notification to send
   */
  private sendNotification(notification: any): void {
    if (!this.mcpRemoteProcess) {
      throw new Error('mcp-remote process not started');
    }

    const notificationStr = JSON.stringify(notification) + '\n';
    this.mcpRemoteProcess.stdin?.write(notificationStr);
  }

  /**
   * Get the next request ID
   *
   * @returns A unique request ID
   */
  private getNextId(): number {
    return this.requestId++;
  }
}