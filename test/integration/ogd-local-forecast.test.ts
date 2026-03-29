import { describe, expect, it, jest } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('meteoswissLocalForecast Tool', () => {
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

  it('should be registered as meteoswissLocalForecast', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissLocalForecast');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('forecast');
  });

  it('should accept location and days parameters', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissLocalForecast');
    expect(tool?.inputSchema?.properties).toHaveProperty('location');
    expect(tool?.inputSchema?.properties).toHaveProperty('days');
  });

  it('should return forecast with content for a postal code', async () => {
    const result = await client.callTool('meteoswissLocalForecast', {
      location: '8001',
      days: 2,
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.location).toBeDefined();
    expect(data.location.coordinates).toHaveProperty('lat');
    expect(data.location.coordinates).toHaveProperty('lon');
    expect(data.forecast).toBeDefined();
    expect(Array.isArray(data.forecast)).toBe(true);
    expect(data.source).toBe('MeteoSwiss Open Data');

    // Assert content, not just structure — postal code path must populate all fields
    const day = data.forecast[0];
    expect(day).toHaveProperty('date');
    expect(day.temperature.min).toEqual(expect.any(Number));
    expect(day.temperature.max).toEqual(expect.any(Number));
    expect(day.precipitation.total).toEqual(expect.any(Number));
    expect(day.weather).toEqual(expect.any(String));
  });

  it('should return error for empty location', async () => {
    const result = await client
      .callTool('meteoswissLocalForecast', { location: '' })
      .catch((e: Error) => ({ isError: true, content: [{ text: e.message }] }));
    expect(result.isError).toBeTruthy();
  });
});
