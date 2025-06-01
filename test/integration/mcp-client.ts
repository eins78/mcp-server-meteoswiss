import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, '../../src/index.ts');

/**
 * Options for configuring the MCP client
 */
export type MCPClientOptions = {
  /**
   * Environment variables to pass to the server process
   */
  env?: Record<string, string>;
};

/**
 * A simple MCP client for testing purposes.
 * This client communicates with the MCP server via stdio.
 */
export class MCPClient {
  private serverProcess: ChildProcess | null = null;
  private initialized = false;
  private requestId = 0;
  private responseHandlers: Map<number, (response: any) => void> = new Map();
  private options: MCPClientOptions;

  constructor(options: MCPClientOptions = {}) {
    this.options = options;
  }

  /**
   * Start the MCP server process
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Start the server process with merged environment variables
        this.serverProcess = spawn('node', [SERVER_PATH], {
          env: { ...process.env, NODE_ENV: 'test', ...this.options.env },
        });

        // Set up error handling
        this.serverProcess.on('error', (error) => {
          console.error('MCP server process error:', error);
          reject(error);
        });

        // Handle server process output (for debugging)
        this.serverProcess.stderr?.on('data', (data) => {
          // Don't output during tests unless debugging
          if (process.env.DEBUG) {
            console.error(`MCP Server (stderr): ${data}`);
          }
        });

        // Process responses from the server
        this.serverProcess.stdout?.on('data', (data) => {
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
              console.error('Error parsing MCP server response:', error);
            }
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
        protocolVersion: '0.1.0',
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
      method: 'initialized',
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
    if (this.serverProcess) {
      // Try to cleanly shutdown via exit notification
      try {
        await this.sendNotification({
          jsonrpc: '2.0',
          method: 'exit',
          params: {},
        });
      } catch (error) {
        console.error('Error sending exit notification:', error);
      }

      // Kill the process
      this.serverProcess.kill();
      this.serverProcess = null;
      this.initialized = false;
    }
  }

  /**
   * Send a request to the MCP server
   *
   * @param request The request to send
   * @returns The response from the server
   */
  private async sendRequest(request: any): Promise<any> {
    if (!this.serverProcess) {
      throw new Error('MCP server process not started');
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

        this.serverProcess?.stdin?.write(requestStr);
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
    if (!this.serverProcess) {
      throw new Error('MCP server process not started');
    }

    const notificationStr = JSON.stringify(notification) + '\n';
    this.serverProcess.stdin?.write(notificationStr);
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
