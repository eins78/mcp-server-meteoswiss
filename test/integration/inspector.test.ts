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
      serverProcess.kill();
      serverProcess = null;
    }
  });

  describe('HTTP Transport', () => {
    let serverUrl: string;

    beforeEach(async () => {
      // Start HTTP server
      const serverPath = path.join(process.cwd(), 'src', 'index.ts');
      serverProcess = spawn('tsx', [serverPath, '3456'], {
        env: { ...process.env, USE_TEST_FIXTURES: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Wait for server to start by checking logs
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server failed to start in time'));
        }, 5000);

        serverProcess!.stderr!.on('data', (data) => {
          const output = data.toString();
          console.log('Server output:', output);
          if (output.includes('MCP server listening')) {
            clearTimeout(timeout);
            resolve();
          }
        });

        serverProcess!.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      serverUrl = 'http://localhost:3456';
    });

    test('should connect via HTTP and list tools', async () => {
      // First check health endpoint
      const healthResponse = await fetch(`${serverUrl}/health`);
      const health = await healthResponse.json();
      
      expect(health).toMatchObject({
        status: 'ok',
        sessions: expect.any(Number),
        endpoint: 'http://localhost:3456/mcp',
      });

      // Now test actual MCP connection
      const transport = new SSEClientTransport(new URL(`${serverUrl}/mcp`));
      
      client = new Client({
        name: 'test-client',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      await client.connect(transport);

      // List tools
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0]).toMatchObject({
        name: 'getWeatherReport',
        description: expect.stringContaining('MeteoSwiss weather report'),
      });
    });

    test('should call getWeatherReport tool via HTTP', async () => {
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
        name: 'getWeatherReport',
        arguments: {
          region: 'south',
          language: 'de',
        },
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
      
      const weatherData = JSON.parse((result.content[0] as any).text);
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
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
      serverProcess = null;
    }
  });

  test('should call tool via inspector CLI against HTTP server', async () => {
    // Start HTTP server
    const serverPath = path.join(process.cwd(), 'src', 'index.ts');
    serverProcess = spawn('tsx', [serverPath, '3457'], {
      env: { ...process.env, USE_TEST_FIXTURES: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for server to start
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      serverProcess!.stderr!.on('data', (data) => {
        if (data.toString().includes('MCP server listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // Run inspector CLI command
    const { stdout, stderr } = await execAsync(
      `npx @modelcontextprotocol/inspector --cli http://localhost:3457/mcp --method tools/call --tool-name getWeatherReport --tool-arg region=north --tool-arg language=de`,
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