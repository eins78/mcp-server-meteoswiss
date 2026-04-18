import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('meteoswissCurrentWeather Tool', () => {
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

  it('should be registered as meteoswissCurrentWeather', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissCurrentWeather');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('real-time');
  });

  it('should accept station and coordinates parameters', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissCurrentWeather');
    expect(tool?.inputSchema?.properties).toHaveProperty('station');
    expect(tool?.inputSchema?.properties).toHaveProperty('coordinates');
  });

  it('should return weather for a station name', async () => {
    // The VQHA80 fixture has station TAE, COM, ABO, AIG
    const result = await client.callTool('meteoswissCurrentWeather', {
      station: 'ABO',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.station).toBeDefined();
    expect(data.station.abbreviation).toBe('ABO');
    expect(data.measurements).toBeDefined();
    expect(data.measurements.temperature).toHaveProperty('value');
    expect(data.measurements.temperature).toHaveProperty('unit');
    expect(data.source).toBe('MeteoSwiss Open Data');
  });

  it('should return weather for coordinates', async () => {
    // Coordinates near Adelboden (ABO station)
    const result = await client.callTool('meteoswissCurrentWeather', {
      coordinates: { lat: 46.49, lon: 7.56 },
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.station).toBeDefined();
    expect(data.station.distance_km).toBeDefined();
    expect(typeof data.station.distance_km).toBe('number');
  });

  it('should return error when neither station nor coordinates provided', async () => {
    const result = await client.callTool('meteoswissCurrentWeather', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('station');
  });

  it('should include visual observations for OBS stations with all boolean fields', async () => {
    // ALT (Altdorf) is one of the 8 OBS stations with visual observations
    const result = await client.callTool('meteoswissCurrentWeather', {
      station: 'ALT',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.station.abbreviation).toBe('ALT');
    expect(data.measurements.temperature).toBeDefined();

    // OBS stations should have visual observations
    expect(data.visual_observations).toBeDefined();
    expect(data.visual_observations).toHaveProperty('date');
    expect(data.visual_observations).toHaveProperty('cloud_cover_percent');
    expect(typeof data.visual_observations.cloud_cover_percent).toBe('number');

    // All boolean fields must be present (not stripped as undefined)
    // MeteoSwiss '-' means "not observed" = false, not missing
    expect(typeof data.visual_observations.is_clear_day).toBe('boolean');
    expect(typeof data.visual_observations.is_overcast_day).toBe('boolean');
    expect(typeof data.visual_observations.has_rain).toBe('boolean');
    expect(typeof data.visual_observations.has_rain_and_snow).toBe('boolean');
    expect(typeof data.visual_observations.has_snowfall).toBe('boolean');
    expect(typeof data.visual_observations.has_hail).toBe('boolean');
    expect(typeof data.visual_observations.has_fog).toBe('boolean');
    expect(typeof data.visual_observations.has_snow_coverage).toBe('boolean');
  });

  it('should NOT include visual observations for non-OBS stations', async () => {
    // ABO (Adelboden) is NOT an OBS station
    const result = await client.callTool('meteoswissCurrentWeather', {
      station: 'ABO',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.station.abbreviation).toBe('ABO');
    expect(data.visual_observations).toBeUndefined();
  });

  it('should resolve "Bern" to BER (Bern / Zollikofen), not BEH (Passo del Bernina)', async () => {
    const result = await client.callTool('meteoswissCurrentWeather', {
      station: 'Bern',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.station.abbreviation).toBe('BER');
    expect(data.station.name).toContain('Bern');
  });

  it('should return error for whitespace-only station query', async () => {
    const result = await client.callTool('meteoswissCurrentWeather', {
      station: '   ',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty');
  });

  it('should return precipitation for a precip-only station', async () => {
    // ABE is a precipitation-only station from the smn-precip network
    const result = await client.callTool('meteoswissCurrentWeather', {
      station: 'ABE',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.station).toBeDefined();
    expect(data.station.abbreviation).toBe('ABE');
    expect(data.station.network).toBe('smn-precip');
    // Precip-only stations have precipitation but not temperature
    expect(data.measurements.precipitation).toBeDefined();
    expect(data.measurements.precipitation.unit).toBe('mm');
    expect(data.measurements.temperature).toBeUndefined();
    expect(data.source).toBe('MeteoSwiss Open Data');
  });

  // --- B2 regression tests (rc.2 failing cases) ---

  it('rejects non-Swiss city "Paris" with a helpful error', async () => {
    const result = await client.callTool('meteoswissCurrentWeather', {
      station: 'Paris',
    });
    expect(result.isError).toBe(true);
    // In fixture mode swisstopo is skipped entirely, so Paris cannot match.
    // The error message must quote the input and hint at alternatives.
    expect(result.content[0].text).toContain('"Paris"');
    expect(result.content[0].text).toMatch(/weather station found for/);
    expect(result.content[0].text).toContain('meteoswissStations');
  });

  it('rejects gibberish station name "NOTASTATION" with a helpful error', async () => {
    const result = await client.callTool('meteoswissCurrentWeather', {
      station: 'NOTASTATION',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"NOTASTATION"');
    expect(result.content[0].text).toMatch(/weather station found for/);
    expect(result.content[0].text).toContain('meteoswissStations');
  });
});
