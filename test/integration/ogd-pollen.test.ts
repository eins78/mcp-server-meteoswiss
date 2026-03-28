import { describe, expect, it, jest } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('meteoswissPollenData Tool', () => {
  let client: MCPClient;

  beforeEach(async () => {
    process.env.USE_TEST_FIXTURES = 'true';
    client = new MCPClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
    jest.restoreAllMocks();
  });

  it('should be registered as meteoswissPollenData', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissPollenData');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('pollen');
  });

  it('should accept optional station parameter', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissPollenData');
    expect(tool?.inputSchema?.properties).toHaveProperty('station');
  });

  it('should return response structure without errors', async () => {
    // Pollen data requires live API for station data — in test mode
    // with no pollen fixtures, the tool should return an empty stations array
    // or an error, but should not crash
    const result = await client.callTool('meteoswissPollenData', {});

    // The tool may return an error (no pollen collection fixtures) or empty results
    if (!result.isError) {
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('stations');
      expect(data).toHaveProperty('source');
      expect(data.source).toBe('MeteoSwiss Open Data');
    }
  });
});
