/**
 * Integration tests using MCP Inspector
 */

import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChildProcess } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as path from 'node:path';

const execAsync = promisify(exec);

describe('MCP Server Integration Tests', () => {
  let serverProcess: ChildProcess | null = null;
  let client: Client | null = null;

  afterEach(async () => {
    // Clean up
    if (client) {
      await client.close();
      client = null;
    }
    if (serverProcess) {
      // Remove all listeners before killing
      serverProcess.removeAllListeners();
      if (serverProcess.stderr) {
        serverProcess.stderr.removeAllListeners();
      }
      if (serverProcess.stdout) {
        serverProcess.stdout.removeAllListeners();
      }
      serverProcess.kill();
      // Wait a bit for process to die
      await new Promise(resolve => setTimeout(resolve, 100));
      serverProcess = null;
    }
  });

  describe('HTTP Transport', () => {
    let serverUrl: string;

    beforeEach(async () => {
      // Start HTTP server using built JS
      const serverPath = path.join(process.cwd(), 'dist', 'index.js');
      serverProcess = spawn('node', [serverPath, '3456'], {
        env: { ...process.env, USE_TEST_FIXTURES: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: false
      });

      // Wait for server to start by checking logs
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server failed to start in time'));
        }, 10000);

        let buffer = '';
        const dataHandler = (data: Buffer) => {
          const output = data.toString();
          buffer += output;
          console.log('Server output:', output);
          if (buffer.includes('MCP server running at')) {
            clearTimeout(timeout);
            // Clean up listeners
            serverProcess!.stdout!.removeListener('data', dataHandler);
            serverProcess!.stderr!.removeListener('data', stderrHandler);
            serverProcess!.removeListener('error', errorHandler);
            // Give the server a moment to fully initialize
            setTimeout(resolve, 2000);
          }
        };
        
        // Monitor stderr for errors
        const stderrHandler = (data: Buffer) => {
          console.log('Server stderr:', data.toString());
        };

        const errorHandler = (err: Error) => {
          clearTimeout(timeout);
          serverProcess!.stdout!.removeListener('data', dataHandler);
          serverProcess!.stderr!.removeListener('data', stderrHandler);
          reject(err);
        };

        serverProcess!.stdout!.on('data', dataHandler);
        serverProcess!.stderr!.on('data', stderrHandler);
        serverProcess!.on('error', errorHandler);
      });

      serverUrl = 'http://localhost:3456';
    });

    test('should connect via HTTP and list tools', async () => {
      
      console.log('Testing server health endpoint...');
      
      // Check if server process is still running
      if (serverProcess?.killed || serverProcess?.exitCode !== null) {
        throw new Error(`Server process exited with code ${serverProcess?.exitCode}`);
      }
      
      // Add retry logic for health check
      let healthResponse;
      let retries = 5;
      while (retries > 0) {
        try {
          healthResponse = await fetch(`${serverUrl}/health`);
          break;
        } catch (err) {
          console.log(`Health check failed, retries left: ${retries - 1}`, err);
          if (retries === 1) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000));
          retries--;
        }
      }
      
      const health = await healthResponse!.json();
      console.log('Health check passed:', health);
      
      expect(health).toMatchObject({
        status: 'ok',
        sessions: expect.any(Number),
        endpoint: expect.stringMatching(/^http:\/\/(localhost|0\.0\.0\.0):3456\/mcp$/),
      });

      // Now test actual MCP connection
      console.log('Creating SSE transport...');
      const transport = new SSEClientTransport(new URL(`${serverUrl}/mcp`));
      
      console.log('Creating MCP client...');
      client = new Client({
        name: 'test-client',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      console.log('Connecting client to transport...');
      await client.connect(transport);
      console.log('Client connected successfully');

      // List tools
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0]).toMatchObject({
        name: 'meteoswissWeatherReport',
        description: expect.stringContaining('MeteoSwiss weather report'),
      });
    });

    test('should call meteoswissWeatherReport tool via HTTP', async () => {
      
      const transport = new SSEClientTransport(new URL(`${serverUrl}/mcp`));
      
      client = new Client({
        name: 'test-client',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      await client.connect(transport);

      // Call the tool
      const result = await client.callTool({
        name: 'meteoswissWeatherReport',
        arguments: {
          region: 'south',
          language: 'de',
        },
      });

      expect(result.content).toHaveLength(1);
      expect((result as any).content[0]!.type).toBe('text');
      
      const weatherData = JSON.parse((result as any).content[0].text);
      expect(weatherData).toMatchObject({
        region: 'south',
        language: 'de',
        source: 'meteoswiss',
      });
    });
  });
});

describe('MCP Inspector CLI Tests', () => {
  let serverProcess: ChildProcess | null = null;

  afterEach(async () => {
    if (serverProcess) {
      // Remove all listeners before killing
      serverProcess.removeAllListeners();
      if (serverProcess.stderr) {
        serverProcess.stderr.removeAllListeners();
      }
      if (serverProcess.stdout) {
        serverProcess.stdout.removeAllListeners();
      }
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 100));
      serverProcess = null;
    }
  });

  test.skip('should call tool via inspector CLI against HTTP server', async () => {
    // Start HTTP server using built JS
    const serverPath = path.join(process.cwd(), 'dist', 'index.js');
    serverProcess = spawn('node', [serverPath, '3457'], {
      env: { ...process.env, USE_TEST_FIXTURES: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: false
    });

    // Wait for server to start
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      let buffer = '';
      serverProcess!.stderr!.on('data', (data) => {
        buffer += data.toString();
        if (buffer.includes('MCP server listening')) {
          clearTimeout(timeout);
          // Give the server a moment to fully initialize
          setTimeout(resolve, 500);
        }
      });
    });

    // Run inspector CLI command
    const { stdout, stderr } = await execAsync(
      `npx @modelcontextprotocol/inspector --cli http://localhost:3457/mcp --method tools/call --tool-name meteoswissWeatherReport --tool-arg region=north --tool-arg language=de`,
      {
        env: { ...process.env },
        timeout: 10000,
      }
    ).catch(err => ({ 
      stdout: err.stdout || '', 
      stderr: err.stderr || err.message 
    }));

    // Check for successful response
    const output = stdout || stderr;
    expect(output).toContain('north'); // Should contain the region
    expect(output).toContain('de'); // Should contain the language
  });
});