import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('Search tool - Multi-word queries', () => {
  let client: MCPClient;

  beforeEach(async () => {
    // Use test fixtures to test the query handling logic
    process.env.USE_TEST_FIXTURES = 'true';
    
    client = new MCPClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
    jest.restoreAllMocks();
  });

  describe('Multi-word query handling', () => {
    it('should handle two-word queries without errors', async () => {
      const result = await client.callTool('search', {
        query: 'forecast accuracy',
        language: 'en',
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      // Parse the actual search results from the MCP response
      const content = result.content[0];
      expect(content.type).toBe('text');
      
      const searchResults = JSON.parse(content.text);
      expect(searchResults.totalResults).toBeGreaterThanOrEqual(0);
      expect(searchResults.results).toBeDefined();
      expect(Array.isArray(searchResults.results)).toBe(true);
    });

    it('should handle three-word queries without errors', async () => {
      const result = await client.callTool('search', {
        query: 'weather forecast snow',
        language: 'en',
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      const content = result.content[0];
      expect(content.type).toBe('text');
      
      const searchResults = JSON.parse(content.text);
      expect(searchResults.totalResults).toBeGreaterThanOrEqual(0);
      expect(searchResults.results).toBeDefined();
      expect(Array.isArray(searchResults.results)).toBe(true);
    });

    it('should handle four-word queries without errors', async () => {
      const result = await client.callTool('search', {
        query: 'snow forecast models prediction',
        language: 'en',
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      const content = result.content[0];
      expect(content.type).toBe('text');
      
      const searchResults = JSON.parse(content.text);
      expect(searchResults.totalResults).toBeGreaterThanOrEqual(0);
      expect(searchResults.results).toBeDefined();
      expect(Array.isArray(searchResults.results)).toBe(true);
    });

    it('should handle queries with special characters', async () => {
      const result = await client.callTool('search', {
        query: 'weather & climate',
        language: 'en',
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      const content = result.content[0];
      expect(content.type).toBe('text');
      
      const searchResults = JSON.parse(content.text);
      expect(searchResults.totalResults).toBeGreaterThanOrEqual(0);
      expect(searchResults.results).toBeDefined();
      expect(Array.isArray(searchResults.results)).toBe(true);
    });
  });
});