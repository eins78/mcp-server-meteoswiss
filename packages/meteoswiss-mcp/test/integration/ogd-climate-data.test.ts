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

  it('should hint at monthly resolution when a daily out-of-range date filter yields no data (issue #110, BUG-5)', async () => {
    // The daily fixture only covers 2026-04-05..2026-04-07; a pre-1900 range
    // filters out every row.
    const result = await client.callTool('meteoswissClimateData', {
      station: 'BAS',
      resolution: 'daily',
      start_date: '1901-01-01',
      end_date: '1901-01-03',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.data).toEqual([]);
    expect(data.note).toBeDefined();
    expect(data.note).toContain('monthly');
    expect(data.note).toContain('2026-04-05');
  });

  it('should not include a note when daily data for the range exists', async () => {
    const result = await client.callTool('meteoswissClimateData', {
      station: 'BAS',
      resolution: 'daily',
      limit: 3,
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.note).toBeUndefined();
  });

  it('should return error when neither station nor coordinates provided', async () => {
    const result = await client.callTool('meteoswissClimateData', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('station');
  });

  // --- B2 regression tests (rc.2 failing cases) ---

  it('rejects gibberish station "INVALID_STATION_XYZ" with a helpful error', async () => {
    const result = await client.callTool('meteoswissClimateData', {
      station: 'INVALID_STATION_XYZ',
      resolution: 'monthly',
      limit: 1,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"INVALID_STATION_XYZ"');
    expect(result.content[0].text).toMatch(/climate station found for/);
    expect(result.content[0].text).toContain('meteoswissStations');
  });
});
