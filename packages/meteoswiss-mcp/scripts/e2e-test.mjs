/**
 * End-to-end test script for all MCP tools against the deployed test instance.
 * Usage: node scripts/e2e-test.mjs [base-url]
 */

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const BASE = process.argv[2] ?? 'https://meteoswiss-mcp-demo-test.cloud.kiste.li';
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// --- Main ---
const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`));
const client = new Client({ name: 'e2e', version: '1.0' });
await client.connect(transport);

console.log(`\nTesting against ${BASE}\n`);

// Health check
const health = await fetch(`${BASE}/health`).then(r => r.json());
console.log(`Health: ${health.status} (v${health.version})\n`);

// Tool listing
const tools = await client.listTools();
console.log(`Tools: ${tools.tools.map(t => t.name).join(', ')}\n`);

await test('Tool count is 6', () => {
  assert(tools.tools.length === 6, `Expected 6 tools, got ${tools.tools.length}`);
});

// --- OGD Tools ---

await test('meteoswissLocalForecast: city name "Zurich"', async () => {
  const r = await client.callTool({ name: 'meteoswissLocalForecast', arguments: { location: 'Zurich', days: 2 } });
  const data = JSON.parse(r.content[0].text);
  assert(data.location.name.includes('rich'), `Expected Zurich, got ${data.location.name}`);
  assert(data.forecast.length > 0, 'Expected forecast data');
  assert(data.source === 'MeteoSwiss Open Data', `Wrong source: ${data.source}`);
});

await test('meteoswissLocalForecast: postal code "8001"', async () => {
  const r = await client.callTool({ name: 'meteoswissLocalForecast', arguments: { location: '8001', days: 3 } });
  const data = JSON.parse(r.content[0].text);
  assert(data.location.name.includes('rich'), `Expected Zurich, got ${data.location.name}`);
  assert(data.forecast.length > 0, 'Expected forecast data');
  // Postal code forecasts must have precipitation and weather (skip past dates where weather may be null)
  const day = data.forecast.find(d => d.weather !== null);
  assert(day, 'Expected at least one forecast day with weather data');
  assert(typeof day.weather === 'string', `weather should be a string, got ${typeof day.weather}`);
  assert(day.precipitation.total !== null && day.precipitation.total !== undefined, 'Expected precipitation data');
});

await test('meteoswissLocalForecast: station "BER"', async () => {
  const r = await client.callTool({ name: 'meteoswissLocalForecast', arguments: { location: 'BER', days: 2 } });
  const data = JSON.parse(r.content[0].text);
  assert(data.location.name.includes('Bern'), `Expected Bern, got ${data.location.name}`);
  assert(data.location.type === 'station', `Expected station, got ${data.location.type}`);
  // Station forecasts must have weather and precipitation
  const futureDay = data.forecast.find(d => d.weather !== null);
  assert(futureDay, 'Expected at least one forecast day with weather');
  assert(typeof futureDay.weather === 'string', 'weather should be a string description');
  assert(futureDay.precipitation.total !== null, 'Expected precipitation data');
});

await test('meteoswissLocalForecast: geocoding "Matterhorn"', async () => {
  const r = await client.callTool({ name: 'meteoswissLocalForecast', arguments: { location: 'Matterhorn', days: 1 } });
  const data = JSON.parse(r.content[0].text);
  assert(data.forecast.length > 0, 'Expected forecast data');
});

await test('meteoswissCurrentWeather: station "SMA"', async () => {
  const r = await client.callTool({ name: 'meteoswissCurrentWeather', arguments: { station: 'SMA' } });
  const data = JSON.parse(r.content[0].text);
  assert(data.station.abbreviation === 'SMA', `Expected SMA, got ${data.station.abbreviation}`);
  assert(data.measurements.temperature?.value !== undefined, 'Expected temperature');
  assert(data.station.municipality, 'Expected municipality from reverse geocoding');
});

await test('meteoswissCurrentWeather: coordinates near Bern', async () => {
  const r = await client.callTool({ name: 'meteoswissCurrentWeather', arguments: { coordinates: { lat: 46.95, lon: 7.45 } } });
  const data = JSON.parse(r.content[0].text);
  assert(data.station.distance_km !== undefined, 'Expected distance_km');
  assert(data.station.distance_km < 20, `Station too far: ${data.station.distance_km} km`);
});

await test('meteoswissCurrentWeather: geocoding "Bahnhofplatz 1 Bern"', async () => {
  const r = await client.callTool({ name: 'meteoswissCurrentWeather', arguments: { station: 'Bahnhofplatz 1 Bern' } });
  const data = JSON.parse(r.content[0].text);
  assert(data.station.name.includes('Bern'), `Expected Bern, got ${data.station.name}`);
});

await test('meteoswissStations: canton ZH', async () => {
  const r = await client.callTool({ name: 'meteoswissStations', arguments: { canton: 'ZH', limit: 5 } });
  const data = JSON.parse(r.content[0].text);
  assert(data.total > 0, 'Expected stations');
  assert(data.stations.every(s => s.canton === 'ZH'), 'All stations should be in ZH');
});

await test('meteoswissStations: search "Lugano"', async () => {
  const r = await client.callTool({ name: 'meteoswissStations', arguments: { search: 'Lugano', limit: 5 } });
  const data = JSON.parse(r.content[0].text);
  assert(data.total > 0, 'Expected Lugano stations');
});


await test('meteoswissPollenData: all stations', async () => {
  const r = await client.callTool({ name: 'meteoswissPollenData', arguments: {} });
  const data = JSON.parse(r.content[0].text);
  assert(data.source === 'MeteoSwiss Open Data', `Wrong source: ${data.source}`);
  assert(Array.isArray(data.stations), 'Expected stations array');
  // Pollen data may be empty outside season, but structure must be valid
});

// --- Original Tools ---

await test('search: query "Klimawandel"', async () => {
  const r = await client.callTool({ name: 'search', arguments: { query: 'Klimawandel', language: 'de', pageSize: 3 } });
  const data = JSON.parse(r.content[0].text);
  assert(data.totalResults > 0, 'Expected search results');
});

await test('fetch: MeteoSwiss page', async () => {
  const r = await client.callTool({ name: 'fetch', arguments: { id: '/wetter/gefahren/verhaltensempfehlungen/wind.html' } });
  assert(r.content[0].text.length > 0, 'Expected response text');
  // Page may 404 — just verify the tool doesn't crash
});

// --- Error Handling ---

await test('meteoswissCurrentWeather: error without station or coordinates', async () => {
  const r = await client.callTool({ name: 'meteoswissCurrentWeather', arguments: {} });
  assert(r.isError === true, 'Expected error');
});

await client.close();

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
