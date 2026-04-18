import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import { MCPClient } from './mcp-client.js';

/**
 * Codification of the external v2.3.0 QA report (2026-04-18, Functional GmbH).
 *
 * Every test here maps to one case in the report, keyed by the report's ID
 * (LF-01..06, CW-01..07, ST-01..04, PO-01..02, CD-01..10, SR-01..06, FE-01..04).
 * A handful of derived tests (marked "-derived") codify report "Notes" that did
 * not get a row in the report's tables.
 *
 * Three kinds of inactive tests, each signalled by the test name's prefix:
 *
 *   KNOWN-FAIL (REC-NN): — behaviour the report observed as ❌ Fail.
 *     The external system is broken; this test documents what "fixed" means.
 *     Flip `it.skip` → `it` when REC-NN ships.
 *
 *   KNOWN-WARN (REC-NN): — behaviour the report observed as ⚠️ Warning.
 *     Not broken, but surprising or inconsistent. Same flip rule.
 *
 *   SKIP-FIXTURE: — needs a station-specific fixture that this repo does not
 *     have (e.g. NBCN yearly data, Davos daily NBCN, Jungfraujoch VQHA80).
 *     Adding fixtures is out of scope for this PR — see the companion
 *     plot-idea plan at docs/plans/2026-04-18-v230-improvement-plan.md.
 *
 * Fixture note: the test harness routes all NBCN monthly/daily URLs to the
 * Basel (BAS) fixture regardless of station requested. Tests here use BAS
 * as a surrogate for other stations where the shape of the response is what
 * matters. When content must be station-specific, the test is SKIP-FIXTURE.
 *
 * External report: /tmp/meteo-v230-external-test-report.md (local copy)
 * Artifact URL:    https://claude.ai/public/artifacts/fe91e313-04a2-4fd1-b2f1-b6aa3da9a4d0
 * Companion plan:  docs/plans/2026-04-18-v230-improvement-plan.md
 */

describe('External v2.3.0 QA report — regression guards', () => {
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

  // --------------------------------------------------------------------------
  // meteoswissLocalForecast (LF-01..LF-06)
  // --------------------------------------------------------------------------
  describe('meteoswissLocalForecast', () => {
    it('LF-01: location="Zurich", days=3 returns 3-day forecast', async () => {
      const result = await client.callTool('meteoswissLocalForecast', {
        location: 'Zurich',
        days: 3,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.location).toBeDefined();
      expect(Array.isArray(data.forecast)).toBe(true);
      expect(data.forecast.length).toBeLessThanOrEqual(3);
      expect(data.forecast.length).toBeGreaterThan(0);
    });

    it('LF-02: location="8001", days=1 returns 1-day forecast only', async () => {
      const result = await client.callTool('meteoswissLocalForecast', {
        location: '8001',
        days: 1,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.forecast.length).toBeLessThanOrEqual(1);
      expect(data.forecast.length).toBeGreaterThan(0);
    });

    it.skip('LF-03: SKIP-FIXTURE — location="SMA", days=9 needs SMA in forecast metadata + daily station data', async () => {
      // The forecast-points fixture covers ~30 stations (ARO, RAG, HAI, ..., NAP, BER) but not SMA.
      // The daily-params fixture (tre200dx etc.) carries rows only for point_id=48 (Napf).
      // Report: 9-day forecast, elevation 556m.
      const result = await client.callTool('meteoswissLocalForecast', {
        location: 'SMA',
        days: 9,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.forecast.length).toBeLessThanOrEqual(9);
      expect(data.forecast.length).toBeGreaterThan(0);
    });

    it.skip('LF-04: KNOWN-FAIL (REC-05) — location="ZUE" should resolve to SMA forecast, currently rejected', async () => {
      // ZUE is a valid SMN abbreviation (listed by meteoswissStations) but
      // rejected by meteoswissLocalForecast. Fix: accept ZUE as an alias for SMA,
      // or document which abbreviation set is valid for forecast lookups.
      const result = await client.callTool('meteoswissLocalForecast', {
        location: 'ZUE',
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(Array.isArray(data.forecast)).toBe(true);
    });

    it.skip('LF-05: SKIP-FIXTURE — location="Lugano" (LUG/OTL) not in forecast metadata fixture', async () => {
      // Forecast-point metadata fixture does not include Lugano or OTL.
      const result = await client.callTool('meteoswissLocalForecast', {
        location: 'Lugano',
        days: 5,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.forecast.length).toBeGreaterThan(0);
    });

    it.skip('LF-06: SKIP-FIXTURE — location="Jungfraujoch" resolves to JUN but no JUN rows in forecast data fixture', async () => {
      // JUN is in ogd-local-forecasting_meta_point.csv, but tre200dx.csv and
      // siblings only carry rows for point_id=48 (Napf). Forecast response is empty.
      const result = await client.callTool('meteoswissLocalForecast', {
        location: 'Jungfraujoch',
        days: 5,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.forecast.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // meteoswissCurrentWeather (CW-01..CW-07)
  // --------------------------------------------------------------------------
  describe('meteoswissCurrentWeather', () => {
    it.skip('CW-01: KNOWN-WARN (REC-09) — station="Zürich" should prefer SMA (city) over KLO (airport)', async () => {
      // The nearest-neighbour scorer currently returns KLO for "Zürich".
      // Fix: prefer a municipality-match over pure proximity for name lookups.
      const result = await client.callTool('meteoswissCurrentWeather', {
        station: 'Zürich',
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.station.abbreviation).toBe('SMA');
    });

    it.skip('CW-02: SKIP-FIXTURE — station="SMA" needs SMA rows in VQHA80 fixture', async () => {
      // VQHA80 fixture only has {ABO,AIG,ALT,AND,ANT,ARH,ARO,BER,COM,TAE}.
      // Would assert: data.station.abbreviation === "SMA" AND visual_observations present.
      const result = await client.callTool('meteoswissCurrentWeather', {
        station: 'SMA',
      });
      expect(result.isError).toBeFalsy();
    });

    it('CW-03: coordinates={lat:46.9481, lon:7.4474} resolves to nearest SMN station with distance_km', async () => {
      // Report: coordinates → BER, 4.9 km. Fixture's nearest SMN point to these
      // Bern coordinates should also be BER (present in VQHA80 fixture).
      const result = await client.callTool('meteoswissCurrentWeather', {
        coordinates: { lat: 46.9481, lon: 7.4474 },
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.station).toBeDefined();
      expect(data.station.distance_km).toEqual(expect.any(Number));
    });

    it.skip('CW-04: SKIP-FIXTURE — address "Bahnhofstrasse 1 Zürich" resolves via geocoding to Zurich, needs SMA fixture to verify', async () => {
      // Report resolved to SMA. Geocoding works; SMA measurement lookup fails without fixture.
      const result = await client.callTool('meteoswissCurrentWeather', {
        station: 'Bahnhofstrasse 1 Zürich',
      });
      expect(result.isError).toBeFalsy();
    });

    it.skip('CW-05: SKIP-FIXTURE — station="Jungfraujoch" needs JUN rows in VQHA80 fixture', async () => {
      // Would assert: high-altitude values (temperature < 0, humidity ~99%).
      const result = await client.callTool('meteoswissCurrentWeather', {
        station: 'Jungfraujoch',
      });
      expect(result.isError).toBeFalsy();
    });

    it('CW-06: no params returns a clear error mentioning both shapes', async () => {
      const result = await client.callTool('meteoswissCurrentWeather', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('station');
      expect(result.content[0].text.toLowerCase()).toContain('coordinates');
    });

    it('CW-07: station="InvalidStationXYZ" returns a clear error with examples', async () => {
      const result = await client.callTool('meteoswissCurrentWeather', {
        station: 'InvalidStationXYZ',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('"InvalidStationXYZ"');
      expect(result.content[0].text).toContain('meteoswissStations');
    });

    it.skip('CW-derived: KNOWN-WARN (REC-09 note) — coordinate lookup exposes distance_km, name lookup does not', async () => {
      // Report observation: the CW-03 coordinate path returns distance_km,
      // but CW-01/CW-02/CW-05 (name lookups) do not. Inconsistent surface area.
      // Fix: either surface distance_km uniformly or document the difference.
      const byCoords = await client.callTool('meteoswissCurrentWeather', {
        coordinates: { lat: 46.9481, lon: 7.4474 },
      });
      const byName = await client.callTool('meteoswissCurrentWeather', { station: 'BER' });
      const coordData = JSON.parse(byCoords.content[0].text);
      const nameData = JSON.parse(byName.content[0].text);
      expect(coordData.station.distance_km).toEqual(expect.any(Number));
      expect(nameData.station.distance_km).toEqual(expect.any(Number));
    });
  });

  // --------------------------------------------------------------------------
  // meteoswissStations (ST-01..ST-04)
  // --------------------------------------------------------------------------
  describe('meteoswissStations', () => {
    it('ST-01: no params returns first page with sensible total', async () => {
      const result = await client.callTool('meteoswissStations', { limit: 20 });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.total).toBeGreaterThan(0);
      expect(data.stations.length).toBeLessThanOrEqual(20);
      expect(data.stations.length).toBeGreaterThan(0);
    });

    it('ST-02: canton="GR" filters to Graubünden stations only', async () => {
      const result = await client.callTool('meteoswissStations', {
        canton: 'GR',
        limit: 100,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.stations.length).toBeGreaterThan(0);
      for (const s of data.stations) {
        expect(s.canton).toBe('GR');
      }
    });

    it.skip('ST-03: SKIP-FIXTURE — search="jung" needs JUN in SMN metadata fixture (current fixture covers A-B stations only)', async () => {
      // SMN meta_stations fixture contains ~50 stations starting with A or B. JUN would need adding.
      const result = await client.callTool('meteoswissStations', {
        search: 'jung',
        limit: 10,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      const abbrs = data.stations.map((s: { abbreviation: string }) => s.abbreviation);
      expect(abbrs).toContain('JUN');
    });

    it.skip('ST-04: KNOWN-WARN (REC-06) — limit=200 should not cap below total (299 in prod)', async () => {
      // Report: total=299 but limit=200 caps response; ~99 stations unreachable.
      // Fix: raise limit cap to >= total, or add page/offset pagination.
      const result = await client.callTool('meteoswissStations', { limit: 500 });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.stations.length).toBe(data.total);
    });
  });

  // --------------------------------------------------------------------------
  // meteoswissPollenData (PO-01..PO-02)
  // --------------------------------------------------------------------------
  describe('meteoswissPollenData', () => {
    it('PO-01: no params returns stations with human-readable pollen type labels', async () => {
      const result = await client.callTool('meteoswissPollenData', {});
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.stations.length).toBeGreaterThan(0);
      const firstStationTypes = data.stations[0].pollen.map(
        (p: { type: string }) => p.type
      );
      // Report: "Birch (Betula)" / "Alder (Alnus)" — short English species labels, no French descriptions.
      expect(firstStationTypes.some((t: string) => /\((Betula|Alnus|Quercus|Poaceae)\)/.test(t))).toBe(
        true
      );
      for (const t of firstStationTypes) {
        expect(t).not.toContain('concentration pollinique');
      }
    });

    it('PO-02: station="Zürich" returns PZH data', async () => {
      const result = await client.callTool('meteoswissPollenData', { station: 'Zürich' });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.stations.length).toBe(1);
      expect(data.stations[0].station.abbreviation).toBe('PZH');
    });

    it.skip('PO-derived: KNOWN-WARN (REC-04) — pollen response should expose a staleness indicator', async () => {
      // Report: Buchs SG observed 12 days old in a 2026-04-18 query. No
      // data_age_days or is_stale field in the response. Fix: add the field.
      const result = await client.callTool('meteoswissPollenData', {});
      const data = JSON.parse(result.content[0].text);
      const station = data.stations[0];
      expect(
        station.data_age_days !== undefined || station.is_stale !== undefined
      ).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // meteoswissClimateData (CD-01..CD-10)
  // --------------------------------------------------------------------------
  //
  // Fixture routing note: all NBCN monthly URLs → nbcn-bas-m.csv;
  // all NBCN daily-recent URLs → nbcn-bas-d-recent.csv. No yearly fixture.
  // Station resolution metadata covers only {ALT, BAS, BER, SMA}.
  describe('meteoswissClimateData', () => {
    it('CD-01: monthly resolution with year filter returns 12 monthly rows with full fields', async () => {
      // Report used station="Zürich". Using BAS here (fixture surrogate):
      // the report's structural claim — 12 monthly rows with full field set —
      // applies equally on any NBCN station once the shape is fixed.
      const result = await client.callTool('meteoswissClimateData', {
        station: 'BAS',
        resolution: 'monthly',
        limit: 12,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.resolution).toBe('monthly');
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.data.length).toBeLessThanOrEqual(12);
      const row = data.data[0];
      expect(row).toHaveProperty('date');
      expect(row).toHaveProperty('temperature_mean');
      expect(row).toHaveProperty('precipitation');
    });

    it.skip('CD-02: SKIP-FIXTURE — station=Basel yearly 10-year range needs nbcn-bas-y fixture', async () => {
      // No yearly NBCN fixture exists. Would assert 10 annual rows 2015..2024.
      const result = await client.callTool('meteoswissClimateData', {
        station: 'BAS',
        resolution: 'yearly',
        start_date: '2015-01-01',
        end_date: '2024-12-31',
      });
      expect(result.isError).toBeFalsy();
    });

    it('CD-03: daily resolution with no date filter returns recent days (temperature-only schema)', async () => {
      // Report: "reduced schema (temperature-only) not documented" — REC-02 tracks that.
      // Shape: rows have temperature_{mean,max,min}; precipitation may or may not be present
      // depending on upstream. This test asserts temperature fields only (report-consistent).
      const result = await client.callTool('meteoswissClimateData', {
        station: 'BAS',
        resolution: 'daily',
        limit: 10,
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.resolution).toBe('daily');
      expect(data.data.length).toBeGreaterThan(0);
      const row = data.data[0];
      expect(row).toHaveProperty('date');
      expect(row).toHaveProperty('temperature_mean');
      expect(row).toHaveProperty('temperature_max');
      expect(row).toHaveProperty('temperature_min');
    });

    it.skip('CD-04: SKIP-FIXTURE — daily with recent date filter needs date-aware fixture routing', async () => {
      // The fixture returns whatever dates nbcn-bas-d-recent.csv contains, regardless
      // of requested start/end. Date-aware fixture routing is out of scope here.
      const result = await client.callTool('meteoswissClimateData', {
        station: 'BAS',
        resolution: 'daily',
        start_date: '2026-04-07',
        end_date: '2026-04-10',
      });
      expect(result.isError).toBeFalsy();
    });

    it.skip('CD-05: KNOWN-FAIL (REC-01) — daily + historical start_date must error, not return [] silently', async () => {
      // Report: station="Zürich", resolution="daily", 2024-12-01..2024-12-31 → [].
      // Backend rolling window is ~14 days; tool does not surface the out-of-window condition.
      // Fix: return a descriptive error identifying the window bound and suggesting monthly/yearly.
      const result = await client.callTool('meteoswissClimateData', {
        station: 'BAS',
        resolution: 'daily',
        start_date: '2024-12-01',
        end_date: '2024-12-31',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toMatch(/window|range|too old|not available/);
    });

    it.skip('CD-06: KNOWN-FAIL (REC-01) — same as CD-05 for a second station (Davos)', async () => {
      // Separate test to guard against the fix accidentally being station-specific.
      const result = await client.callTool('meteoswissClimateData', {
        station: 'Davos',
        resolution: 'daily',
        start_date: '2024-12-01',
        end_date: '2024-12-31',
      });
      expect(result.isError).toBe(true);
    });

    it.skip('CD-07: SKIP-FIXTURE — coordinates → Davos yearly needs nbcn-dav-y fixture', async () => {
      // Report: coordinates={46.81, 9.84} → DAV, distance_km=0, yearly data.
      const result = await client.callTool('meteoswissClimateData', {
        coordinates: { lat: 46.81, lon: 9.84 },
        resolution: 'yearly',
      });
      expect(result.isError).toBeFalsy();
    });

    it.skip('CD-08: SKIP-FIXTURE — station=Locarno monthly 1970 needs OTL metadata + data fixtures', async () => {
      // Deep-history read. OTL is not in the NBCN metadata fixture (only ALT/BAS/BER/SMA).
      const result = await client.callTool('meteoswissClimateData', {
        station: 'Locarno',
        resolution: 'monthly',
        start_date: '1970-01-01',
        end_date: '1970-12-31',
      });
      expect(result.isError).toBeFalsy();
    });

    it.skip('CD-09: SKIP-FIXTURE — station=SMA yearly (no dates) needs nbcn-sma-y fixture', async () => {
      // Report: returns most recent 5 years (2021..2025).
      const result = await client.callTool('meteoswissClimateData', {
        station: 'SMA',
        resolution: 'yearly',
      });
      expect(result.isError).toBeFalsy();
    });

    it('CD-10: station="NonExistentXYZ" returns clear error with examples', async () => {
      const result = await client.callTool('meteoswissClimateData', {
        station: 'NonExistentXYZ',
        resolution: 'monthly',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('"NonExistentXYZ"');
      expect(result.content[0].text).toContain('meteoswissStations');
    });

    it.skip('CD-derived: KNOWN-WARN (REC-02) — daily schema should document its reduced field set or backfill it', async () => {
      // Monthly/yearly expose temperature + precipitation + sunshine + indicators.
      // Daily exposes temperature only. Fix: document the difference in the tool
      // description, or backfill the missing fields from NBCN daily aggregate.
      const result = await client.callTool('meteoswissClimateData', {
        station: 'BAS',
        resolution: 'daily',
        limit: 1,
      });
      const data = JSON.parse(result.content[0].text);
      const row = data.data[0];
      expect(row).toHaveProperty('precipitation');
      expect(row).toHaveProperty('sunshine_hours');
    });
  });

  // --------------------------------------------------------------------------
  // search (SR-01..SR-06)
  // --------------------------------------------------------------------------
  describe('search', () => {
    it('SR-01: query="Klimawandel Schweiz", language="de" returns relevant DE results', async () => {
      const response = await client.callTool('search', {
        query: 'Klimawandel Schweiz',
        language: 'de',
        page: 1,
      });
      const result = JSON.parse(response.content[0].text);
      expect(result).toMatchObject({
        totalResults: expect.any(Number),
        results: expect.any(Array),
      });
    });

    it('SR-02: query="pollen season forecast", language="en", contentType="press-release" returns a valid shape', async () => {
      const response = await client.callTool('search', {
        query: 'pollen season forecast',
        language: 'en',
        contentType: 'press-release',
      });
      const result = JSON.parse(response.content[0].text);
      expect(result.results).toEqual(expect.any(Array));
      expect(result.totalResults).toEqual(expect.any(Number));
    });

    it.skip('SR-03: KNOWN-WARN (REC-10) — sort=date-desc on publications should surface 2025/2026 bulletins before 2024', async () => {
      // Report: sorting appears to be by lastModified, not publicationDate.
      // Fix: investigate upstream sort field; expose a dedicated publicationDate sort if needed.
      const response = await client.callTool('search', {
        query: 'Klimabulletin',
        contentType: 'publication',
        language: 'de',
        sort: 'date-desc',
      });
      const result = JSON.parse(response.content[0].text);
      const topYear = new Date(result.results[0].publicationDate).getFullYear();
      expect(topYear).toBeGreaterThanOrEqual(2025);
    });

    it('SR-04: query="weather extremes", language="en", contentType="blog-article" accepts zero results', async () => {
      // Report: 0 results. Zero is a valid response, not an error.
      const response = await client.callTool('search', {
        query: 'weather extremes',
        language: 'en',
        contentType: 'blog-article',
      });
      const result = JSON.parse(response.content[0].text);
      expect(result.totalResults).toEqual(expect.any(Number));
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('SR-05: query="Unwetter Sommer", language="de", contentType="blog-article" returns relevant results', async () => {
      const response = await client.callTool('search', {
        query: 'Unwetter Sommer',
        language: 'de',
        contentType: 'blog-article',
      });
      const result = JSON.parse(response.content[0].text);
      expect(result.results).toEqual(expect.any(Array));
      expect(result.totalResults).toEqual(expect.any(Number));
    });

    it.skip('SR-06: KNOWN-FAIL (REC-03) — page 2 of the same query should not duplicate page 1 results', async () => {
      // Report: 5 of 10 page-2 results overlapped page 1. Upstream behaviour;
      // fix candidate: server-side dedup by result id, or document the limitation.
      const page1 = await client.callTool('search', {
        query: 'Klimawandel Schweiz',
        language: 'de',
        page: 1,
        pageSize: 10,
      });
      const page2 = await client.callTool('search', {
        query: 'Klimawandel Schweiz',
        language: 'de',
        page: 2,
        pageSize: 10,
      });
      const p1 = JSON.parse(page1.content[0].text);
      const p2 = JSON.parse(page2.content[0].text);
      const p1Ids = new Set(p1.results.map((r: { id: string }) => r.id));
      const dupes = p2.results.filter((r: { id: string }) => p1Ids.has(r.id));
      expect(dupes.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // fetch (FE-01..FE-04)
  // --------------------------------------------------------------------------
  describe('fetch', () => {
    it('FE-01: detail page URL with markdown + includeMetadata=true returns body AND metadata', async () => {
      // Report used a production detail URL. Local fixture detail page is /wetter/gefahren/verhaltensempfehlungen/wind.html.
      const response = await client.callTool('fetch', {
        url: '/wetter/gefahren/verhaltensempfehlungen/wind.html',
        format: 'markdown',
        includeMetadata: true,
      });
      const result = JSON.parse(response.content[0].text);
      expect(result.content).toEqual(expect.any(String));
      expect(result.content.length).toBeGreaterThan(100);
      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('url');
    });

    it.skip('FE-02: KNOWN-WARN (REC-07 + REC-08) — press release, format=text, should return full body without title duplication', async () => {
      // Two distinct bugs in one case: (a) lead-paragraph-only extraction for
      // press releases (REC-08), (b) title echoed at start of content body (REC-07).
      const response = await client.callTool('fetch', {
        url: '/home.subpage.html/de/home/news/medienmitteilungen/meteoschweiz.html',
        format: 'text',
        includeMetadata: false,
      });
      const result = JSON.parse(response.content[0].text);
      expect(result.content.length).toBeGreaterThan(500);
      expect(result.content.trimStart().startsWith(result.title)).toBe(false);
    });

    it.skip('FE-03: KNOWN-WARN (REC-08) — blog article should return full body, not lead paragraph only', async () => {
      const response = await client.callTool('fetch', {
        url: '/home.subpage.html/en/home/weather-and-climate-blog.html',
        format: 'markdown',
        includeMetadata: false,
      });
      const result = JSON.parse(response.content[0].text);
      expect(result.content.length).toBeGreaterThan(500);
    });

    it('FE-04: invalid URL returns "Content not found" error with search suggestion', async () => {
      const response = await client.callTool('fetch', {
        url: '/this-does-not-exist-xyz.html',
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });
  });
});
