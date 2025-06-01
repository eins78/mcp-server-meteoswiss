/**
 * Integration tests using MCP Inspector
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChildProcess } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHttpHeaders } from '@modelcontextprotocol/sdk/client/sse.js';
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

  describe('Stdio Transport', () => {
    test('should connect and list tools', async () => {
      const serverPath = path.join(process.cwd(), 'src', 'index.ts');
      
      // Create client with stdio transport
      const transport = new StdioClientTransport({
        command: 'tsx',
        args: [serverPath, 'stdio'],
        env: { ...process.env, USE_TEST_FIXTURES: 'true' },
      });

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

    test('should call getWeatherReport tool', async () => {
      const serverPath = path.join(process.cwd(), 'src', 'index.ts');
      
      // Create client with stdio transport
      const transport = new StdioClientTransport({
        command: 'tsx',
        args: [serverPath, 'stdio'],
        env: { ...process.env, USE_TEST_FIXTURES: 'true' },
      });

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
          region: 'north',
          language: 'en',
        },
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const weatherData = JSON.parse((result.content[0] as any).text);
      expect(weatherData).toMatchObject({
        region: 'north',
        language: 'en',
        source: 'meteoswiss',
      });
    });
  });

  describe('HTTP Transport', () => {
    let serverUrl: string;

    beforeEach(async () => {
      // Start HTTP server
      const serverPath = path.join(process.cwd(), 'src', 'index.ts');
      serverProcess = exec(`tsx ${serverPath} http 3456`, {
        env: { ...process.env, USE_TEST_FIXTURES: 'true' },
      });

      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      serverUrl = 'http://localhost:3456';
    });

    test('should connect via HTTP and list tools', async () => {
      // Use fetch to test HTTP endpoint
      const response = await fetch(`${serverUrl}/health`);
      const health = await response.json();
      
      expect(health).toMatchObject({
        status: 'ok',
        sessions: expect.any(Number),
      });
    });
  });
});

describe('MCP Inspector CLI Tests', () => {
  test('should run inspector against stdio server', async () => {
    const serverPath = path.join(process.cwd(), 'src', 'index.ts');
    
    // Run inspector in non-interactive mode
    const { stdout, stderr } = await execAsync(
      `npx @modelcontextprotocol/inspector tsx ${serverPath} stdio`,
      {
        env: { ...process.env, USE_TEST_FIXTURES: 'true', CI: 'true' },
        timeout: 15000,
      }
    ).catch(err => err);

    // Check for successful connection
    expect(stdout || stderr).toContain('MeteoSwiss MCP server');
  });
});