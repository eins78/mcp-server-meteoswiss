import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

describe('meteoswissPollenData Tool', () => {
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

  it('should be registered as meteoswissPollenData', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissPollenData');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('pollen');
  });

  it('should accept optional station parameter', async () => {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === 'meteoswissPollenData');
    expect(tool!.inputSchema?.properties).toHaveProperty('station');
  });

  it('should return pollen data for all stations', async () => {
    const result = await client.callTool('meteoswissPollenData', {});
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('stations');
    expect(data).toHaveProperty('source');
    expect(data.source).toBe('MeteoSwiss Open Data');
    expect(data.stations.length).toBeGreaterThan(0);

    // Assert content on first station
    const station = data.stations[0];
    expect(station.station.abbreviation).toEqual(expect.any(String));
    expect(station.station.name).toEqual(expect.any(String));
    expect(station.station.coordinates.lat).toEqual(expect.any(Number));
    expect(station.station.coordinates.lon).toEqual(expect.any(Number));
    expect(station.timestamp).toEqual(expect.any(String));
    expect(station.pollen.length).toBeGreaterThan(0);

    // Assert pollen types are short species names, not verbose descriptions or French
    const types = station.pollen.map((p: { type: string }) => p.type);
    expect(types).toContain('Birch (Betula)');
    expect(types).toContain('Oak (Quercus)');
    for (const t of types) {
      expect(t).not.toContain('concentration pollinique');
      expect(t).not.toContain('daily average pollen concentration');
    }

    // Assert measurements have correct structure
    const measurement = station.pollen[0];
    expect(measurement.type).toEqual(expect.any(String));
    expect(measurement.value).toEqual(expect.any(Number));
    expect(measurement.unit).toBe('particles/m\u00B3');
  });

  it('should not produce duplicate entries for d0 and d1', async () => {
    const result = await client.callTool('meteoswissPollenData', {});
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text);
    for (const station of data.stations) {
      const types = station.pollen.map((p: { type: string }) => p.type);
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(types.length);
    }
  });

  it('should prefer d1 (calendar day) values over d0', async () => {
    // Fixture has d0 birch=1326 and d1 birch=1124 for the latest row
    const result = await client.callTool('meteoswissPollenData', { station: 'PZH' });
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text);
    const station = data.stations[0];
    const birch = station.pollen.find((p: { type: string }) => p.type === 'Birch (Betula)');
    expect(birch).toBeDefined();
    expect(birch!.value).toBe(1124); // d1 value, not d0=1326
  });

  it('should return pollen data for a specific station', async () => {
    const result = await client.callTool('meteoswissPollenData', { station: 'PZH' });
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text);
    expect(data.stations.length).toBe(1);
    expect(data.stations[0].station.abbreviation).toBe('PZH');
  });

  it('should find station by name', async () => {
    const result = await client.callTool('meteoswissPollenData', { station: 'Zürich' });
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text);
    expect(data.stations.length).toBe(1);
    expect(data.stations[0].station.abbreviation).toBe('PZH');
  });

  it('should return error for unknown station', async () => {
    const result = await client.callTool('meteoswissPollenData', { station: 'XXXXXX' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No pollen station found');
  });
});
