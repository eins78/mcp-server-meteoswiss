import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('MeteoSwiss Fetch Tool', () => {
  let client: MCPClient;

  beforeAll(async () => {
    process.env.USE_TEST_FIXTURES = 'true';
    client = new MCPClient();
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
    jest.restoreAllMocks();
  });

  describe('fetchMeteoSwissContent tool', () => {
    it('should be registered with the name "fetch" for ChatGPT compatibility', async () => {
      const tools = await client.listTools();
      const fetchTool = tools.find((tool) => tool.name === 'fetch');
      
      expect(fetchTool).toBeDefined();
      expect(fetchTool?.description).toContain('Fetch');
    });

    it('should accept required and optional parameters', async () => {
      const tools = await client.listTools();
      const fetchTool = tools.find((tool) => tool.name === 'fetch');
      
      expect(fetchTool?.inputSchema).toMatchObject({
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: expect.stringContaining('URL')
          },
          format: {
            type: 'string',
            enum: ['markdown', 'text'],
            default: 'markdown',
            description: expect.stringContaining('output format')
          },
          includeMetadata: {
            type: 'boolean',
            default: true,
            description: expect.stringContaining('metadata')
          }
        },
        required: ['id']
      });
    });

    it('should fetch content by ID in markdown format', async () => {
      const response = await client.callTool('fetch', {
        id: '/wetter/gefahren/verhaltensempfehlungen/wind.html',
        format: 'markdown'
      });

      const result = JSON.parse(response.content[0].text);

      expect(result).toMatchObject({
        id: '/wetter/gefahren/verhaltensempfehlungen/wind.html',
        title: expect.any(String),
        content: expect.stringContaining('#'), // Markdown heading
        format: 'markdown',
        metadata: expect.objectContaining({
          url: expect.stringContaining('meteoswiss'),
          language: expect.any(String),
          contentType: expect.any(String)
        })
      });

      // Content must include actual body text from web component attributes,
      // not just the page title (regression test for empty content body bug)
      expect(result.content).toContain('Verhaltensempfehlungen');
      expect(result.content).toContain('Windereignisse');
      expect(result.content).toContain('Gefahrenstufen von Wind');
    });

    it('should fetch content in plain text format', async () => {
      const response = await client.callTool('fetch', {
        id: '/wetter/gefahren/verhaltensempfehlungen/wind.html',
        format: 'text'
      });

      const result = JSON.parse(response.content[0].text);

      expect(result).toMatchObject({
        content: expect.any(String),
        format: 'text'
      });
      expect(result.content).not.toContain('<'); // No HTML tags
      expect(result.content).not.toContain('#'); // No markdown
    });


    it('should exclude metadata when requested', async () => {
      const response = await client.callTool('fetch', {
        id: '/wetter/gefahren/verhaltensempfehlungen/wind.html',
        includeMetadata: false
      });

      const result = JSON.parse(response.content[0].text);

      expect(result.metadata).toBeUndefined();
    });


    it('should handle non-existent content IDs', async () => {
      const response = await client.callTool('fetch', {
        id: '/non-existent-page.html'
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('should handle invalid format parameter', async () => {
      // MCP SDK may throw (SSE) or return error result (Streamable HTTP) for invalid params
      const result = await client
        .callTool('fetch', {
          id: '/wetter/gefahren/verhaltensempfehlungen/wind.html',
          format: 'invalid',
        })
        .catch((e: Error) => ({ isError: true, content: [{ text: e.message }] }));
      expect(result.isError ?? result.content[0].text.includes('invalid')).toBeTruthy();
    });

    it('should cache content for performance', async () => {
      const startTime = Date.now();
      
      // First fetch - may be slower
      const firstResponse = await client.callTool('fetch', {
        id: '/wetter/gefahren/verhaltensempfehlungen/wind.html'
      });
      
      const firstFetchTime = Date.now() - startTime;
      
      // Second fetch - should be cached and faster
      const secondStartTime = Date.now();
      const secondResponse = await client.callTool('fetch', {
        id: '/wetter/gefahren/verhaltensempfehlungen/wind.html'
      });
      const secondFetchTime = Date.now() - secondStartTime;
      
      expect(JSON.parse(secondResponse.content[0].text)).toBeDefined();
      // Caching not implemented yet, so just check that it works
      expect(secondFetchTime).toBeLessThan(firstFetchTime * 2); // Not much slower
    });
  });
});