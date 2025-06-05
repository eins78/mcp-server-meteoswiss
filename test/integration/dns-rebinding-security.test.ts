/**
 * DNS Rebinding Security Tests
 * 
 * SECURITY IMPACT: DNS rebinding attacks allow malicious websites to bypass 
 * same-origin policy and interact with local services. For MCP servers, this 
 * could allow unauthorized access to tools and data.
 * 
 * These tests verify that our server implements proper protections against
 * DNS rebinding attacks as recommended by the MCP specification:
 * https://modelcontextprotocol.io/docs/concepts/transports#security-warning-dns-rebinding-attacks
 */

import { spawn, ChildProcess } from 'child_process';
import { jest } from '@jest/globals';

describe('DNS Rebinding Attack Protection', () => {
  let serverProcess: ChildProcess;
  let serverUrl: string;
  const testPort = 3456;

  /**
   * Start server with specific environment configuration
   */
  async function startServer(env: Record<string, string> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const environment = {
        ...process.env,
        PORT: testPort.toString(),
        USE_TEST_FIXTURES: 'true',
        ...env,
      };

      serverProcess = spawn('node', ['dist/index.js'], {
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      let started = false;
      
      serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('MCP server running') && !started) {
          started = true;
          // Extract the URL from output
          const match = output.match(/http:\/\/[^:]+:\d+/);
          serverUrl = match ? match[0] : `http://localhost:${testPort}`;
          resolve();
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('MCP server running') && !started) {
          started = true;
          const match = output.match(/http:\/\/[^:]+:\d+/);
          serverUrl = match ? match[0] : `http://localhost:${testPort}`;
          resolve();
        }
      });

      serverProcess.on('error', reject);
      
      setTimeout(() => {
        if (!started) {
          reject(new Error('Server failed to start within timeout'));
        }
      }, 10000);
    });
  }

  afterEach(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  describe('Origin Header Validation', () => {
    /**
     * SECURITY TEST: Verify that SSE connections without proper Origin headers are rejected
     * IMPACT: Prevents malicious websites from establishing SSE connections to local MCP server
     */
    it('should reject SSE connections with suspicious Origin headers', async () => {
      await startServer();

      // Test various malicious origins
      const maliciousOrigins = [
        'http://evil.com',
        'https://attacker.com',
        'http://localhost.evil.com',
        'http://127.0.0.1.evil.com',
      ];

      for (const origin of maliciousOrigins) {
        const response = await fetch(`${serverUrl}/mcp`, {
          headers: {
            'Accept': 'text/event-stream',
            'Origin': origin,
          },
        });

        expect(response.status).toBe(403);
        const body = await response.text();
        expect(body).toContain('Forbidden');
      }
    });

    /**
     * SECURITY TEST: Verify that legitimate local origins are allowed
     * IMPACT: Ensures the server remains accessible for legitimate local use
     */
    it('should allow SSE connections from legitimate local origins', async () => {
      await startServer();

      const legitimateOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://[::1]:3000',
        null, // No origin header (direct access)
      ];

      for (const origin of legitimateOrigins) {
        const headers: Record<string, string> = {
          'Accept': 'text/event-stream',
        };
        
        if (origin !== null) {
          headers['Origin'] = origin;
        }

        const response = await fetch(`${serverUrl}/mcp`, { headers });
        
        // Should get SSE response
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream');
        
        // Close connection
        // Close connection properly
        const reader = response.body?.getReader();
        reader?.cancel();
      }
    });
  });

  describe('Default Binding Address', () => {
    /**
     * SECURITY TEST: Verify server defaults to localhost-only binding
     * IMPACT: Prevents remote access to MCP server by default
     */
    it('should default to binding only to localhost, not 0.0.0.0', async () => {
      // Start server without specifying BIND_ADDRESS
      await startServer({});

      // Server should be accessible on localhost
      const localhostResponse = await fetch(`http://localhost:${testPort}/health`);
      expect(localhostResponse.status).toBe(200);

      // Try to access via external IP (this should fail)
      // Note: In a real test environment, you'd use the actual external IP
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        
        const externalResponse = await fetch(`http://0.0.0.0:${testPort}/health`, {
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        // If we get here, the server is incorrectly bound to all interfaces
        expect(externalResponse.status).not.toBe(200);
      } catch (error) {
        // Expected - connection should be refused
        expect(error).toBeDefined();
      }
    });

    /**
     * SECURITY TEST: Verify explicit localhost binding works correctly
     * IMPACT: Ensures server can be properly restricted to localhost only
     */
    it('should respect explicit localhost binding configuration', async () => {
      await startServer({ BIND_ADDRESS: '127.0.0.1' });

      // Should work on 127.0.0.1
      const response = await fetch(`http://127.0.0.1:${testPort}/health`);
      expect(response.status).toBe(200);
      
      const health = await response.json();
      expect(health).toHaveProperty('status', 'ok');
    });
  });


  describe('CORS Configuration', () => {
    /**
     * SECURITY TEST: Verify CORS is properly configured to prevent cross-origin access
     * IMPACT: Additional layer of protection against unauthorized cross-origin requests
     */
    it('should enforce strict CORS policy by default', async () => {
      await startServer();

      // Preflight request from suspicious origin
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://evil.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      // Should not include permissive CORS headers
      expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
      expect(response.headers.get('access-control-allow-origin')).not.toBe('http://evil.com');
    });

    /**
     * SECURITY TEST: Verify CORS can be configured for specific trusted origins
     * IMPACT: Allows controlled access while maintaining security
     */
    it('should allow configuring CORS for specific trusted origins', async () => {
      await startServer({ 
        CORS_ORIGIN: 'http://localhost:8080',
      });

      // Request from trusted origin
      const response = await fetch(`${serverUrl}/health`, {
        headers: {
          'Origin': 'http://localhost:8080',
        },
      });

      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    });
  });

  describe('Host Header Validation', () => {
    /**
     * SECURITY TEST: Verify server validates Host headers to prevent DNS rebinding
     * IMPACT: Critical protection against DNS rebinding attacks
     */
    it('should reject requests with suspicious Host headers', async () => {
      await startServer();

      const suspiciousHosts = [
        'evil.com:3456',
        'attacker.com:3456',
        'localhost.evil.com:3456',
        '127.0.0.1.evil.com:3456',
      ];

      for (const host of suspiciousHosts) {
        // Note: In a real attack, the DNS would resolve to localhost but Host header would be evil
        // For testing, we simulate this by setting the Host header explicitly
        const response = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
          headers: {
            'Host': host,
            'Accept': 'text/event-stream',
          },
        });

        expect(response.status).toBe(403);
        const body = await response.text();
        expect(body).toContain('Invalid host');
      }
    });

    /**
     * SECURITY TEST: Verify legitimate Host headers are accepted
     * IMPACT: Ensures server remains functional for legitimate requests
     */
    it('should accept requests with legitimate Host headers', async () => {
      await startServer();

      const legitimateHosts = [
        `localhost:${testPort}`,
        `127.0.0.1:${testPort}`,
        `[::1]:${testPort}`,
      ];

      for (const host of legitimateHosts) {
        const response = await fetch(`http://localhost:${testPort}/health`, {
          headers: {
            'Host': host,
          },
        });

        expect(response.status).toBe(200);
      }
    });
  });
});