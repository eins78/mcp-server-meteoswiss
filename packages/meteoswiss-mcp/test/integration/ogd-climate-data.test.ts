import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('meteoswissClimateData Tool', () => {
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

  it('should be registered as meteoswissClimateData', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissClimateData');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('climate');
  });

  it('should return monthly climate data for a station name', async () => {
    const result = await client.callTool('meteoswissClimateData', {
      station: 'BAS',
      resolution: 'monthly',
      limit: 5,
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.station).toBeDefined();
    expect(data.station.abbreviation).toBe('BAS');
    expect(data.station.network).toBe('nbcn');
    expect(data.resolution).toBe('monthly');
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data.length).toBeLessThanOrEqual(5);

    // Monthly data should have temperature and precipitation
    const row = data.data[0];
    expect(row).toHaveProperty('date');
    expect(row).toHaveProperty('temperature_mean');
    expect(typeof row.temperature_mean).toBe('number');
    expect(row).toHaveProperty('precipitation');
    expect(data.source).toBe('MeteoSwiss Open Data');
  });

  it('should return daily climate data', async () => {
    const result = await client.callTool('meteoswissClimateData', {
      station: 'BAS',
      resolution: 'daily',
      limit: 3,
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.resolution).toBe('daily');
    expect(data.data.length).toBeGreaterThan(0);

    // Daily data should have temperature min/max/mean
    const row = data.data[0];
    expect(row).toHaveProperty('temperature_mean');
    expect(row).toHaveProperty('temperature_max');
    expect(row).toHaveProperty('temperature_min');
  });

  it('should return error when neither station nor coordinates provided', async () => {
    const result = await client.callTool('meteoswissClimateData', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('station');
  });
});
