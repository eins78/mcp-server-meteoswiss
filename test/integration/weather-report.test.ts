import { MCPClient } from './mcp-client';
import fs from 'fs/promises';
import path from 'path';

/**
 * Integration tests for the getWeatherReport tool
 *
 * These tests start an actual MCP server process and communicate with it
 * via stdio, mimicking how a real client like Claude Desktop would interact
 * with the server.
 */
describe('getWeatherReport Tool Integration Tests', () => {
  let client: MCPClient;

  // Set up test fixtures
  const testReportHtml = `
    <html>
      <body>
        <h3>Weather Report for Test Region</h3>
        <p>Updated at 2025-04-26 15:08</p>
        <div class="textFCK">
          <h4>Monday</h4>
          <p>Sunny weather</p>
          <p>20-25°C</p>
          <h4>Tuesday</h4>
          <p>Partly cloudy</p>
          <p>18-23°C</p>
        </div>
      </body>
    </html>
  `;

  // Set up the MCP client before each test
  beforeEach(async () => {
    // Create test fixtures for all regions and languages
    const fixturesDir = path.join(process.cwd(), 'test/__fixtures__/weather-report');

    // Define regions and languages to test
    const regions = ['north', 'south', 'west'];
    const languages = ['en', 'de', 'fr', 'it'];

    // Create fixtures for each combination
    for (const region of regions) {
      for (const language of languages) {
        // Determine the language directory (en is in the de directory with _en suffix)
        const languageDir = language === 'en' ? 'de' : language;

        const langRegionDir = path.join(fixturesDir, languageDir, region);
        const versionDir = path.join(langRegionDir, 'version__20250426_1508');

        // Create directories if they don't exist
        await fs.mkdir(versionDir, { recursive: true });

        // Create versions.json
        await fs.writeFile(
          path.join(langRegionDir, 'versions.json'),
          JSON.stringify({ currentVersionDirectory: 'version__20250426_1508' })
        );

        // Create HTML file with the correct file name pattern
        // English files are in the German directory with _en suffix
        const fileSuffix = language === 'en' ? '_en' : `_${language}`;

        await fs.writeFile(
          path.join(versionDir, `textproduct${fileSuffix}.xhtml`),
          testReportHtml.replace(
            'Test Region',
            `${region.charAt(0).toUpperCase() + region.slice(1)} Region`
          )
        );
      }
    }

    // Start the MCP client in test mode
    client = new MCPClient({
      env: {
        NODE_ENV: 'test',
        // Force using local fixtures
        USE_TEST_FIXTURES: 'true',
      },
    });
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
    expect(northReportData.forecast.length).toBe(2);
    expect(northReportData.forecast[0].day).toBe('Monday');
    expect(northReportData.forecast[1].day).toBe('Tuesday');

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
    expect(germanReportData.forecast.length).toBe(2);

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
    expect(frenchReportData.forecast.length).toBe(2);

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
    expect(italianReportData.forecast.length).toBe(2);
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
