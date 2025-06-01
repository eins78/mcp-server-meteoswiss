import { MCPClient } from './mcp-client';
import fs from 'fs/promises';
import path from 'path';

/**
 * Integration tests for the getWeatherReport tool with HTTP data fetch
 *
 * These tests ensure that the tool correctly processes weather report data.
 */
describe('getWeatherReport Tool Tests', () => {
  let client: MCPClient;

  // Set up test fixtures
  const testReportHtml = `
    <html>
      <body>
        <h3>Weather Report for North Region</h3>
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
    // Create test fixtures
    const fixturesDir = path.join(process.cwd(), 'test/__fixtures__/weather-report');

    // Create a test fixture for the north region in German
    const deNorthDir = path.join(fixturesDir, 'de', 'north');
    const versionDir = path.join(deNorthDir, 'version__20250426_1508');

    // Create directories if they don't exist
    await fs.mkdir(versionDir, { recursive: true });

    // Create versions.json
    await fs.writeFile(
      path.join(deNorthDir, 'versions.json'),
      JSON.stringify({ currentVersionDirectory: 'version__20250426_1508' })
    );

    // Create HTML file
    await fs.writeFile(path.join(versionDir, 'textproduct_de.xhtml'), testReportHtml);

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

  // Clean up after each test
  afterEach(async () => {
    await client.stop();
  });

  /**
   * Test that the getWeatherReport tool works correctly
   */
  test('should return weather report data', async () => {
    // Call the tool
    const result = await client.callTool('getWeatherReport', {
      region: 'north',
      language: 'de',
    });

    // Verify the result
    expect(result).toBeDefined();
    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('type', 'text');

    // Parse the text content as JSON
    const reportData = JSON.parse(result.content[0].text);
    expect(reportData).toHaveProperty('region', 'north');
    expect(reportData).toHaveProperty('language', 'de');
    expect(reportData.forecast.length).toBe(2);
    expect(reportData.forecast[0].day).toBe('Monday');
    expect(reportData.forecast[1].day).toBe('Tuesday');
  });
});
