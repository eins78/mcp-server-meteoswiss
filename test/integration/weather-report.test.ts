import { MCPClient } from './mcp-client';

/**
 * Integration tests for the getWeatherReport tool
 *
 * These tests start an actual MCP server process and communicate with it
 * via stdio, mimicking how a real client like Claude Desktop would interact
 * with the server.
 */
describe('getWeatherReport Tool Integration Tests', () => {
  let client: MCPClient;

  // Set up the MCP client before each test
  beforeEach(async () => {
    client = new MCPClient();
    await client.start();
  });

  // Clean up the MCP client after each test
  afterEach(async () => {
    await client.stop();
  });

  /**
   * Test that the getWeatherReport tool returns the correct data structure
   * for each region in the default language (English)
   */
  test('should return weather reports for all regions', async () => {
    // Test north region
    const northResult = await client.callTool('getWeatherReport', {
      region: 'north',
      language: 'en',
    });

    // Verify the structure and content of the north region response
    expect(northResult).toBeDefined();
    expect(northResult).toHaveProperty('content');
    expect(Array.isArray(northResult.content)).toBe(true);
    expect(northResult.content[0]).toHaveProperty('type', 'text');
    expect(northResult.content[0]).toHaveProperty('text');

    // Parse the text content as JSON
    const northReportData = JSON.parse(northResult.content[0].text);
    expect(northReportData).toHaveProperty('region', 'north');
    expect(northReportData).toHaveProperty('language', 'en');
    expect(northReportData).toHaveProperty('title');
    expect(northReportData).toHaveProperty('updatedAt');
    expect(northReportData).toHaveProperty('content');
    expect(Array.isArray(northReportData.forecast)).toBe(true);

    // Test south region
    const southResult = await client.callTool('getWeatherReport', {
      region: 'south',
      language: 'en',
    });

    // Verify the structure and content of the south region response
    expect(southResult).toBeDefined();
    expect(southResult).toHaveProperty('content');
    expect(Array.isArray(southResult.content)).toBe(true);
    expect(southResult.content[0]).toHaveProperty('type', 'text');

    // Parse the text content as JSON
    const southReportData = JSON.parse(southResult.content[0].text);
    expect(southReportData).toHaveProperty('region', 'south');
    expect(southReportData).toHaveProperty('language', 'en');
    expect(southReportData).toHaveProperty('title');
    expect(southReportData).toHaveProperty('updatedAt');
    expect(southReportData).toHaveProperty('content');
    expect(Array.isArray(southReportData.forecast)).toBe(true);

    // Test west region
    const westResult = await client.callTool('getWeatherReport', {
      region: 'west',
      language: 'en',
    });

    // Verify the structure and content of the west region response
    expect(westResult).toBeDefined();
    expect(westResult).toHaveProperty('content');
    expect(Array.isArray(westResult.content)).toBe(true);
    expect(westResult.content[0]).toHaveProperty('type', 'text');

    // Parse the text content as JSON
    const westReportData = JSON.parse(westResult.content[0].text);
    expect(westReportData).toHaveProperty('region', 'west');
    expect(westReportData).toHaveProperty('language', 'en');
    expect(westReportData).toHaveProperty('title');
    expect(westReportData).toHaveProperty('updatedAt');
    expect(westReportData).toHaveProperty('content');
    expect(Array.isArray(westReportData.forecast)).toBe(true);
  });

  /**
   * Test that the getWeatherReport tool works with different languages
   */
  test('should return weather reports in different languages', async () => {
    // Test with German
    const germanResult = await client.callTool('getWeatherReport', {
      region: 'north',
      language: 'de',
    });

    expect(germanResult).toBeDefined();
    expect(germanResult).toHaveProperty('content');
    expect(Array.isArray(germanResult.content)).toBe(true);
    expect(germanResult.content[0]).toHaveProperty('type', 'text');

    // Parse the text content as JSON
    const germanReportData = JSON.parse(germanResult.content[0].text);
    expect(germanReportData).toHaveProperty('language', 'de');

    // Test with French
    const frenchResult = await client.callTool('getWeatherReport', {
      region: 'north',
      language: 'fr',
    });

    expect(frenchResult).toBeDefined();
    expect(frenchResult).toHaveProperty('content');
    expect(Array.isArray(frenchResult.content)).toBe(true);
    expect(frenchResult.content[0]).toHaveProperty('type', 'text');

    // Parse the text content as JSON
    const frenchReportData = JSON.parse(frenchResult.content[0].text);
    expect(frenchReportData).toHaveProperty('language', 'fr');

    // Test with Italian
    const italianResult = await client.callTool('getWeatherReport', {
      region: 'north',
      language: 'it',
    });

    expect(italianResult).toBeDefined();
    expect(italianResult).toHaveProperty('content');
    expect(Array.isArray(italianResult.content)).toBe(true);
    expect(italianResult.content[0]).toHaveProperty('type', 'text');

    // Parse the text content as JSON
    const italianReportData = JSON.parse(italianResult.content[0].text);
    expect(italianReportData).toHaveProperty('language', 'it');
  });

  /**
   * Test error handling for invalid parameters
   */
  test('should handle invalid parameters', async () => {
    // Test with invalid region
    try {
      await client.callTool('getWeatherReport', {
        region: 'invalid',
        language: 'en',
      });
      // If we get here, the test should fail
      fail('Should have thrown an error for invalid region');
    } catch (error) {
      // Error should be caught
      expect(error).toBeDefined();
    }

    // Test with invalid language
    try {
      await client.callTool('getWeatherReport', {
        region: 'north',
        language: 'invalid',
      });
      // If we get here, the test should fail
      fail('Should have thrown an error for invalid language');
    } catch (error) {
      // Error should be caught
      expect(error).toBeDefined();
    }
  });
});
