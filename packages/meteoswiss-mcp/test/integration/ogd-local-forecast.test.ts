import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('meteoswissLocalForecast Tool', () => {
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
    expect(day.weather_icon_url).toMatch(/^https:\/\/www\.meteoschweiz\.admin\.ch\/static\/resources\/weather-symbols\/\d+\.svg$/);
  });

  it('should return forecast with weather_icon_url for a station', async () => {
    const result = await client.callTool('meteoswissLocalForecast', {
      location: 'Napf',
      days: 2,
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.location.type).toBe('station');
    const day = data.forecast[0];
    expect(day.weather).toEqual(expect.any(String));
    expect(day.weather_icon_url).toMatch(
      /^https:\/\/www\.meteoschweiz\.admin\.ch\/static\/resources\/weather-symbols\/\d+\.svg$/
    );
  });

  it('should return error for empty location', async () => {
    const result = await client
      .callTool('meteoswissLocalForecast', { location: '' })
      .catch((e: Error) => ({ isError: true, content: [{ text: e.message }] }));
    expect(result.isError).toBeTruthy();
  });

  it('should return error for whitespace-only location', async () => {
    const result = await client.callTool('meteoswissLocalForecast', {
      location: '   ',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty');
  });

  it('should resolve "Bern" to a Bern-area point, not Passo del Bernina', async () => {
    // Intent of this test (from rc.2): name-matching must prefer word-boundary
    // matches over substring matches, so "Bern" does NOT match "Bernina".
    // The winning point may be the BER station OR a Bern postal code — both
    // are in the Bern area (lat ~46.95) and both are correct for this query.
    const result = await client.callTool('meteoswissLocalForecast', {
      location: 'Bern',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.location.name.toLowerCase()).toContain('bern');
    expect(data.location.name).not.toContain('Bernina');
    expect(data.location.coordinates.lat).toBeGreaterThan(46.8);
    expect(data.location.coordinates.lat).toBeLessThan(47.1);
  });

  // --- B2 regression tests (rc.2 failing cases) ---

  it('rejects non-Swiss city "Paris" with a helpful error', async () => {
    const result = await client.callTool('meteoswissLocalForecast', {
      location: 'Paris',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"Paris"');
    expect(result.content[0].text).toContain('international city');
  });

  // --- rc.4 regression tests — international city blocklist ---

  it('rejects "London" as a forecast location (international city)', async () => {
    const result = await client.callTool('meteoswissLocalForecast', {
      location: 'London',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"London"');
    expect(result.content[0].text).toContain('international city');
  });

  it('rejects "Berlin" as a forecast location (international city)', async () => {
    const result = await client.callTool('meteoswissLocalForecast', {
      location: 'Berlin',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"Berlin"');
    expect(result.content[0].text).toContain('international city');
  });

  it('rejects invalid 5-digit postal code "99999" with a helpful error', async () => {
    const result = await client.callTool('meteoswissLocalForecast', {
      location: '99999',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"99999"');
    expect(result.content[0].text).toMatch(/forecast location found for/);
  });

  it('rejects gibberish location "ABCDE" with a helpful error', async () => {
    const result = await client.callTool('meteoswissLocalForecast', {
      location: 'ABCDE',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"ABCDE"');
    expect(result.content[0].text).toMatch(/forecast location found for/);
  });

  it('resolves parent postal code "1200" to a Geneva-area point via prefix fallback', async () => {
    // MeteoSwiss metadata lacks round-number parent codes like 1200 (Geneva).
    // Prefix fallback must pick the numerically closest same-prefix code (1201 Genève in the fixture).
    const result = await client.callTool('meteoswissLocalForecast', {
      location: '1200',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.location).toBeDefined();
    expect(data.location.type).toBe('postal_code');
    // Geneva lies at ~46.2° N; the prefix-fallback neighbour must be in that band.
    expect(data.location.coordinates.lat).toBeGreaterThanOrEqual(46.1);
    expect(data.location.coordinates.lat).toBeLessThanOrEqual(46.3);
  });

  it('resolves parent postal code "3000" to a Bern-area point via prefix fallback', async () => {
    // Bern ~46.94° N; prefix fallback should land in 3001 Bern (fixture).
    const result = await client.callTool('meteoswissLocalForecast', {
      location: '3000',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.location).toBeDefined();
    expect(data.location.type).toBe('postal_code');
    expect(data.location.coordinates.lat).toBeGreaterThanOrEqual(46.8);
    expect(data.location.coordinates.lat).toBeLessThanOrEqual(47.0);
  });
});
