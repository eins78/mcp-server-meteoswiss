import { describe, expect, it, jest } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('MeteoSwiss Search Tool', () => {
  let client: MCPClient;

  beforeEach(async () => {
    // Set environment variable to use test fixtures
    process.env.USE_TEST_FIXTURES = 'true';
    
    client = new MCPClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
    jest.restoreAllMocks();
  });

  describe('searchMeteoSwissContent tool', () => {
    it('should be registered with the name "search" for ChatGPT compatibility', async () => {
      const tools = await client.listTools();
      const searchTool = tools.find((tool) => tool.name === 'search');
      
      expect(searchTool).toBeDefined();
      expect(searchTool?.description).toContain('Search MeteoSwiss');
    });

    it('should accept required and optional parameters', async () => {
      const tools = await client.listTools();
      const searchTool = tools.find((tool) => tool.name === 'search');
      
      expect(searchTool?.inputSchema).toMatchObject({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: expect.stringContaining('search query')
          },
          language: {
            type: 'string',
            enum: ['de', 'fr', 'it', 'en'],
            description: expect.stringContaining('language')
          },
          contentType: {
            type: 'string',
            description: expect.stringContaining('content type')
          },
          page: {
            type: 'integer',
            description: expect.stringContaining('Page number')
          },
          pageSize: {
            type: 'integer',
            description: expect.stringContaining('results per page')
          },
          sort: {
            type: 'string',
            enum: ['relevance', 'date-desc', 'date-asc'],
            description: expect.stringContaining('Sort order')
          }
        },
        required: ['query']
      });
    });

    it('should search for content in German', async () => {
      const response = await client.callTool('search', {
        query: 'wetter',
        language: 'de'
      });

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');
      
      const result = JSON.parse(response.content[0].text);
      
      expect(result).toMatchObject({
        totalResults: expect.any(Number),
        page: 1,
        pageSize: expect.any(Number),
        results: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            title: expect.any(String),
            url: expect.any(String),
            description: expect.any(String),
            contentType: expect.any(String),
            lastModified: expect.any(String)
          })
        ])
      });
    });

    it('should search for content in French', async () => {
      const response = await client.callTool('search', {
        query: 'météo',
        language: 'fr'
      });

      const result = JSON.parse(response.content[0].text);
      
      expect(result).toMatchObject({
        totalResults: expect.any(Number),
        results: expect.arrayContaining([
          expect.objectContaining({
            title: expect.any(String),
            url: expect.any(String)
          })
        ])
      });
    });

    it('should support pagination', async () => {
      const firstPageResponse = await client.callTool('search', {
        query: 'wetter',
        language: 'de',
        page: 1,
        pageSize: 5
      });

      const secondPageResponse = await client.callTool('search', {
        query: 'wetter',
        language: 'de',
        page: 2,
        pageSize: 5
      });

      const firstPage = JSON.parse(firstPageResponse.content[0].text);
      const secondPage = JSON.parse(secondPageResponse.content[0].text);
      
      expect(firstPage.results.length).toBeLessThanOrEqual(5);
      expect(secondPage.results.length).toBeLessThanOrEqual(5);
      
      // Only check if both pages have results
      if (firstPage.results.length > 0 && secondPage.results.length > 0) {
        expect(firstPage.results[0]?.id).not.toBe(secondPage.results[0]?.id);
      }
    });

    it('should support sorting by date', async () => {
      const response = await client.callTool('search', {
        query: 'wetter',
        language: 'de',
        sort: 'date-desc'
      });

      const result = JSON.parse(response.content[0].text);
      
      expect(result.results.length).toBeGreaterThan(0);
      
      // Check that results are sorted by date if we have multiple results
      if (result.results.length > 1) {
        for (let i = 1; i < result.results.length; i++) {
          const prevDate = new Date(result.results[i - 1].lastModified);
          const currDate = new Date(result.results[i].lastModified);
          expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
        }
      }
    });

    it('should handle empty search results', async () => {
      const response = await client.callTool('search', {
        query: 'xyznonexistentquery123',
        language: 'de'
      });

      const result = JSON.parse(response.content[0].text);
      
      expect(result).toMatchObject({
        totalResults: 0,
        results: []
      });
    });

    it('should handle invalid language gracefully', async () => {
      await expect(
        client.callTool('search', {
          query: 'weather',
          language: 'invalid'
        })
      ).rejects.toThrow();
    });
  });
});