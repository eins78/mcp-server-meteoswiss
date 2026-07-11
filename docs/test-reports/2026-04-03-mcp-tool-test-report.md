# MeteoSwiss MCP Server — Test Report

**Date:** 2026-04-03  
**Server:** [meteoswiss-mcp.ars.is](https://meteoswiss-mcp.ars.is/)  
**Tested via:** Claude.ai MCP integration  
**Tools available:** 6 (`meteoswissStations`, `meteoswissCurrentWeather`, `meteoswissLocalForecast`, `meteoswissPollenData`, `search`, `fetch`)  
**Test runs:** All assertions independently re-verified in a second live run.

-----

## Summary

|Tool                      |Tests |✅ Pass|⚠️ Warning|❌ Fail|
|--------------------------|:----:|:----:|:-------:|:----:|
|`meteoswissStations`      |3     |3     |0        |0     |
|`meteoswissCurrentWeather`|5     |5     |0        |0     |
|`meteoswissLocalForecast` |4     |3     |1        |0     |
|`meteoswissPollenData`    |2     |0     |2        |0     |
|`search`                  |5     |3     |2        |0     |
|`fetch`                   |4     |2     |0        |2     |
|**Total**                 |**23**|**16**|**5**    |**2** |

-----

## Tool 1: `meteoswissStations`

Lists and searches the ~160-station automatic weather station network.

### Test 1.1 — Full station list (`limit=200`)

**Input:** `{ limit: 200 }`

**Result:** 158 stations returned, sorted alphabetically by abbreviation (ABO → ZER). Each record includes: `abbreviation`, `name`, `canton`, `elevation` (m), `coordinates` (lat/lon WGS84), `data_since`.

**Observations:**

- The oldest station is **Genève / Cointrin (GVE)** with data since 01.01.1753, and **Basel / Binningen (BAS)** since 01.01.1755 — both older than Switzerland itself.
- The newest station is **Blatten, Lötschental (BLA)**, operational since 2012.
- All 26 Swiss cantons are represented (plus Liechtenstein/FL via Vaduz VAD).
- Elevation range: 203 m (Magadino/Cadenazzo MAG) to 3,571 m (Jungfraujoch JUN).

**Status: ✅ PASS**

-----

### Test 1.2 — Canton filter (`canton=ZH`)

**Input:** `{ canton: "ZH" }`

**Result:** 8 stations returned:

|Abbr.|Name              |Elevation|Data Since|
|-----|------------------|---------|----------|
|HOE  |Hörnli            |1133 m   |1974      |
|KLO  |Zürich / Kloten   |426 m    |1935      |
|LAE  |Lägern            |845 m    |1989      |
|PFA  |Pfäffikon, ZH     |537 m    |1901      |
|REH  |Zürich / Affoltern|444 m    |1961      |
|SMA  |Zürich / Fluntern |556 m    |1864      |
|UEB  |Uetliberg         |854 m    |1991      |
|WAE  |Wädenswil         |485 m    |1961      |

**Observations:**

- Filter is exact and correct — all 8 stations are in canton ZH.
- Results include both urban stations (SMA, KLO, REH) and orographic/topographic stations (UEB, LAE, HOE).
- Note: Basel / Binningen (BAS) has canton `BL` (Baselland), not `BS` — correctly absent from ZH results.

**Status: ✅ PASS**

-----

### Test 1.3 — Name search (`search="Jung"`)

**Input:** `{ search: "Jung" }`

**Result:** 1 station — Jungfraujoch (JUN), canton VS, elevation 3,571 m, data since 01.01.1931.

**Observations:**

- Partial-string matching works correctly (prefix search).
- Returns the correct unique result for a well-known landmark station.

**Status: ✅ PASS**

-----

## Tool 2: `meteoswissCurrentWeather`

Real-time measurements from automatic stations, updated every 10 minutes. Accepts station name, abbreviation, street address, or WGS84 coordinates.

### Test 2.1 — Station name resolution (`station="Zurich"`)

**Input:** `{ station: "Zurich" }`  
**Timestamp:** 202604032020 (20:20 UTC)

**Resolved to:** Zürich / Kloten (KLO), 426 m

**Measurements:**

|Parameter           |Value      |
|--------------------|-----------|
|Temperature         |10.4 °C    |
|Humidity            |59.2 %     |
|Dew Point           |2.8 °C     |
|Precipitation       |0 mm       |
|Wind Speed          |6.1 km/h   |
|Wind Gust           |8.3 km/h   |
|Wind Direction      |265° (WSW) |
|Sunshine            |0 min      |
|Radiation           |1 W/m²     |
|Pressure (station)  |970.6 hPa  |
|Pressure (sea level)|1,021.5 hPa|

**Observations:**

- English place name “Zurich” correctly resolves without umlaut.
- Resolves to **KLO** (airport/Kloten), not SMA (Fluntern). This is arguably counterintuitive since “Zürich” is more commonly associated with SMA as the main urban station — but both are valid Zürich stations. Worth noting in docs.
- All standard measurement fields present and plausible.
- The near-zero radiation (1 W/m²) and zero sunshine are consistent with evening time (20:20 UTC = 22:20 local time).

**Status: ✅ PASS**

-----

### Test 2.2 — Station abbreviation (`station="SMA"`)

**Input:** `{ station: "SMA" }`  
**Timestamp:** 202604032020

**Resolved to:** Zürich / Fluntern (SMA), 556 m

**Measurements:**

|Parameter           |Value      |
|--------------------|-----------|
|Temperature         |10.3 °C    |
|Humidity            |53.5 %     |
|Dew Point           |1.3 °C     |
|Wind Speed          |5.0 km/h   |
|Wind Gust           |8.6 km/h   |
|Wind Direction      |267° (W)   |
|Pressure (station)  |955.8 hPa  |
|Pressure (sea level)|1,021.5 hPa|

**Observations:**

- Abbreviation lookup works exactly.
- SMA at 556 m has a lower station pressure (955.8 hPa) than KLO at 426 m (970.6 hPa) — physically correct (~1.5 hPa per 12 m difference; difference is 130 m → ~15 hPa ✓).
- Both stations share the same sea-level pressure (1,021.5 hPa), confirming the barometric reduction is applied correctly.

**Status: ✅ PASS**

-----

### Test 2.3 — WGS84 coordinate lookup

**Input:** `{ coordinates: { lat: 47.3769, lon: 8.5417 } }` (approx. Zürich HB)

**Resolved to:** Zürich / Fluntern (SMA), **distance_km: 1.8**

**Observations:**

- Coordinate-based lookup correctly identifies nearest station and returns the `distance_km` field — a useful addition not present in the other lookup modes.
- 1.8 km from Zürich HB to SMA (Zürichberg) is geographically plausible.
- Measurements identical to Test 2.2 (same station, same timestamp).

**Status: ✅ PASS**

-----

### Test 2.4 — High-altitude station (`station="JUN"`)

**Input:** `{ station: "JUN" }` — Jungfraujoch, 3,571 m  
**Timestamp:** 202604032020

**Measurements:**

|Parameter           |Value     |
|--------------------|----------|
|Temperature         |−10.4 °C  |
|Humidity            |78.7 %    |
|Dew Point           |−13.4 °C  |
|Wind Speed          |28.8 km/h |
|Wind Gust           |34.2 km/h |
|Wind Direction      |321° (NNW)|
|Pressure (station)  |656.2 hPa |
|`pressure_sea_level`|**absent**|

**Observations:**

- Temperature of −10.4 °C at 3,571 m while Zürich (426 m) reads 10.4 °C gives a lapse rate of ~1.06 °C/100 m — close to standard environmental lapse rate (~0.65 °C/100 m dry, higher with inversion). Plausible.
- **`pressure_sea_level` is correctly absent.** At 3,571 m, extrapolating pressure to sea level is physically unreliable and MeteoSwiss omits it. This is the correct meteorological practice.
- Wind of 28.8 km/h (gusting 34.2) from NNW is consistent with high-alpine conditions.
- No `precipitation` or `municipality`… wait, municipality is returned as “Fieschertal” — interesting, Jungfraujoch is technically in the VS commune of Fieschertal.

**Status: ✅ PASS**

-----

### Test 2.5 — Street address resolution (`station="Bahnhofstrasse 1, Lugano"`)

**Input:** `{ station: "Bahnhofstrasse 1, Lugano" }`

**Resolved to:** Magadino / Cadenazzo (MAG), 203 m — **not** the closer Lugano (LUG) station.

**Measurements:**

|Parameter           |Value      |
|--------------------|-----------|
|Temperature         |15.1 °C    |
|Humidity            |21 %       |
|Dew Point           |−7.0 °C    |
|Wind Speed          |18.4 km/h  |
|Wind Gust           |35.3 km/h  |
|Wind Direction      |97° (E)    |
|Pressure (station)  |992.5 hPa  |
|Pressure (sea level)|1,016.7 hPa|

**Observations:**

- Address geocoding works — the API resolves a street address to a station.
- **Station selection is surprising:** Lugano (LUG) is at 273 m and is more likely the nearest station to Lugano’s Bahnhofstrasse. MAG (Magadino) is ~15 km north in the Ticino plain. The address resolver may be performing coarse geocoding, or MAG is preferred for another reason (e.g., better instrumentation or different proximity metric).
- The very low humidity (21%) and strongly positive dew point depression (−7 °C dewpoint at 15 °C) suggest föhn-like or dry easterly conditions in the Ticino — meteorologically consistent with the easterly wind (97°).
- **Consider documenting** that address resolution may not always select the geographically nearest station.

**Status: ✅ PASS** (with note on station selection behavior)

-----

## Tool 3: `meteoswissLocalForecast`

Daily forecasts for ~6,000 Swiss locations. Accepts postal codes, station abbreviations, or place names. Horizon: 1–9 days. Updated hourly.

### Test 3.1 — Postal code, 5-day forecast (Zürich 8001)

**Input:** `{ location: "8001", days: 5 }`  
**Generated:** 2026-04-03T04:00:25Z

**Result:** Zürich, elevation 409 m — 5 entries returned.

|Date        |Min °C|Max °C|Weather                           |Precip|
|------------|------|------|----------------------------------|------|
|2026-04-02 ⚠️|6.5   |6.8   |`null`                            |0 mm  |
|2026-04-03  |3.2   |15.3  |sunny                             |0 mm  |
|2026-04-04  |7.7   |16.4  |overcast and dry                  |0 mm  |
|2026-04-05  |5.5   |21.9  |sunny                             |0 mm  |
|2026-04-06  |9.3   |19.1  |partly sunny, thick passing clouds|0 mm  |

**Observations:**

- ⚠️ **Off-by-one / stale-day bug:** The first entry is always the *previous* day (2026-04-02), with `weather: null` and `weather_icon_url: null`. This consumes one slot of the requested `days` count. When requesting 5 days, only 4 valid/future days are returned. This appears to be a systematic issue with the upstream MeteoSwiss API, not the MCP layer — but the MCP server could filter or document this behavior.
- Weather icon URLs point to official MeteoSwiss SVG assets (`meteoschweiz.admin.ch/static/resources/weather-symbols/`). These are stable, publicly accessible URLs — good for UI consumers.
- Location `type` is correctly identified as `postal_code`.
- The elevation (409 m) for PLZ 8001 is representative of the district center, not any specific building.

**Status: ⚠️ WARNING** — Stale-day entry (yesterday with null weather) is included in the result.

-----

### Test 3.2 — Place name, 9-day forecast (Basel, maximum horizon)

**Input:** `{ location: "Basel", days: 9 }`

**Result:** Basel, elevation 255 m, `type: postal_code` — 10 entries (including yesterday).

Effective forecast covers 2026-04-03 through 2026-04-10 (8 future days due to the off-by-one).

**Observations:**

- Maximum `days=9` returns 10 total entries (1 past + 9 requested). Confirmed consistent with Test 3.1.
- Place name “Basel” resolves correctly to postal code coordinates.
- Weather icon URLs are included for all valid days.
- Forecast shows a dry, warming trend — internally consistent (no snow, rising max temperatures).
- `generated` timestamp is identical across all forecast calls: `2026-04-03T04:00:25Z` — confirms forecasts are cached hourly (at ~04:00 UTC), not generated per-request. **This means forecast data may be up to ~1 hour old at any given moment**, which is fine for daily-resolution data but should be documented.

**Status: ✅ PASS** (stale-day issue already noted in 3.1)

-----

### Test 3.3 — Station abbreviation, 3-day forecast (Jungfraujoch JUN)

**Input:** `{ location: "JUN", days: 3 }`

**Result:** Jungfraujoch, elevation 3,571 m, `type: station` — 3 entries (no stale-day entry here).

|Date      |Min °C|Max °C|Weather                  |
|----------|------|------|-------------------------|
|2026-04-03|−13.0 |−9.4  |sunny                    |
|2026-04-04|−9.2  |−5.9  |stratus                  |
|2026-04-05|−7.2  |−5.0  |mostly sunny, some clouds|

**Observations:**

- **No stale-day entry** when querying a station abbreviation (vs. postal code in Tests 3.1/3.2). This suggests the off-by-one may be specific to postal code / place name resolution — worth investigating in the upstream API.
- `type: station` (not `postal_code`) — location type is correctly distinguished.
- Weather code `"stratus"` (icon 27) appears for a high-alpine station — this refers to cloud cover from below, unusual but meteorologically possible at 3,571 m.
- All temperatures below zero — consistent with 3,571 m elevation in early April.

**Status: ✅ PASS**

-----

### Test 3.4 — Postal code, alpine town (St. Moritz, PLZ 7500)

**Input:** `{ location: "7500", days: 4 }`

**Result:** St. Moritz, elevation 1,773 m, `type: postal_code` — 4 entries (1 stale + 3 valid).

|Date        |Min °C|Max °C|Weather         |
|------------|------|------|----------------|
|2026-04-02 ⚠️|−1.5  |−1.2  |`null`          |
|2026-04-03  |−5.0  |5.3   |sunny           |
|2026-04-04  |−4.3  |9.3   |overcast and dry|
|2026-04-05  |−3.0  |13.0  |sunny           |

**Observations:**

- Elevation of 1,773 m correctly reflects the Inn Valley basin where St. Moritz sits (Engadin).
- Stale-day entry confirmed again for postal code input — consistent with Test 3.1.
- Min/max spread (e.g., −5 to +5.3 °C on 04-03) is characteristic of high-altitude spring conditions with strong diurnal variation.

**Status: ✅ PASS** (stale-day inherited from postal code behavior)

-----

## Tool 4: `meteoswissPollenData`

Current pollen concentrations from ~15 monitoring stations across Switzerland.

### Test 4.1 — All stations (no filter)

**Input:** `{}`

**Result:** `{ "stations": [], "source": "MeteoSwiss Open Data" }`

**Status: ⚠️ WARNING** — Empty response.

-----

### Test 4.2 — Specific station (`station="Zürich"`)

**Input:** `{ station: "Zürich" }`

**Result:** `{ "stations": [], "source": "MeteoSwiss Open Data" }`

**Status: ⚠️ WARNING** — Empty response.

-----

**Analysis of pollen warnings:**

Both pollen tests return valid JSON with an empty `stations` array. This is not an error — the API responds correctly. Possible explanations:

1. **Seasonal data gap:** The MeteoSwiss pollen monitoring network uses automated optical sensors. Counting periods may have gaps in early April when the sensor calibration or pollen season transition occurs. However, April is typically peak birch (*Betula*) season in Switzerland — so absence is notable.
1. **Upstream data unavailability:** The MeteoSwiss Open Data pollen endpoint may not be publishing data at the time of testing. The pollen network (`polleninformation.ch`) is separate from the main meteorological network and has its own publication schedule.
1. **MCP mapping issue:** If the MCP server maps station names to pollen station IDs using the same lookup as weather stations, names may not match — pollen monitoring stations are a different, smaller set (~15 vs 158).

**Recommendation:** The MCP server should document the pollen monitoring station IDs separately, and return a clearer signal when data is temporarily unavailable vs. structurally absent (e.g., off-season). A `"data_available": false` flag with a reason string would help consumers distinguish the cases.

-----

## Tool 5: `search`

Full-text search across MeteoSwiss website content. Parameters: `query` (required), `language` (de/fr/it/en), `contentType` (content/press-release/blog-article/publication), `page`, `pageSize` (max 100), `sort` (relevance/date-desc/date-asc).

-----

### Test 5.1 — Basic content search, German (`query="Klimawandel"`, `language=de`)

**Input:** `{ query: "Klimawandel", language: "de" }`

**Result:** 435 total results, 12 returned (default `pageSize`). All results are `mchweb:pages/detail-page` content type, covering climate change topics: rising temperatures, precipitation changes, snow/cold reduction, Swiss climate scenarios, emission scenarios.

**Observations:**

- `totalResults`, `page`, `pageSize` all present — pagination metadata is complete.
- Results include `id` (full URL), `title`, `url`, `description`, `contentType`, `lastModified`, `path`, and `lead` fields.
- Some results include `publicationDate`; others do not — inconsistent field presence (see Issues Log #8).
- The `id` field is the **full absolute URL** (e.g., `https://www.meteoschweiz.admin.ch/klima/...`).
- Relevance quality is good — all top results are directly about climate change.

**Status: ✅ PASS**

-----

### Test 5.2 — English language search (`query="climate change"`, `language=en`)

**Input:** `{ query: "climate change", language: "en", pageSize: 5 }`

**Result:** 124 total results. Results are on the English subdomain (`meteoswiss.admin.ch` vs. `meteoschweiz.admin.ch` for DE). Topics match: Swiss climate scenarios, rising temperatures, precipitation, drier summers, global warming levels.

**Observations:**

- Language switching works correctly and produces a **distinct result set** on the correct language domain.
- DE: `meteoschweiz.admin.ch` — EN: `meteoswiss.admin.ch` — the domain differs by language, correctly.
- 124 EN results vs. 435 DE results — the DE content corpus is significantly larger (expected for the primary-language site).

**Status: ✅ PASS**

-----

### Test 5.3 — Content type filter: press releases (`contentType=press-release`)

**Input:** `{ query: "Unwetter", language: "de", contentType: "press-release", pageSize: 5 }`

**Result:** 45 total results. All returned items have `contentType: "mchweb:pages/press-release-page"`. Topics include heat wave warnings, ICON model launch, Open Data release (2025), drought early-warning system, WMO congress.

**Observations:**

- Content type filter works correctly — no non-press-release items appear.
- `publicationDate` is consistently present for press releases (ISO 8601 format with timezone — unlike the compact format in `meteoswissCurrentWeather`).
- The relevance for “Unwetter” (severe weather) is **poor**: the top results are about the WMO congress, ICON model, and Open Data — not severe weather events. The press-release corpus likely contains few true “Unwetter” releases, and relevance scoring appears to fall back to general recency/prominence. Worth noting that the `sort` defaults to `relevance` but may behave like `date-desc` for content-sparse queries.

**Status: ✅ PASS** (filter works; relevance quality varies)

-----

### Test 5.4 — Content type filter: publications (`contentType=publication`, `language=en`)

**Input:** `{ query: "temperature trends Switzerland", language: "en", contentType: "publication", pageSize: 5 }`

**Result:** 33 total results. All items have `contentType: "mchweb:pages/publication-page"`. Results include peer-reviewed journal articles (JGR, Int. J. Climatol.) and scientific reports on Swiss temperature trends.

**Observations:**

- Publication filter is precise — only scientific publications returned.
- Some publications have empty `description` fields (peer-reviewed items). Others have a full abstract as `lead`.
- Publication dates span 2002–2020 — appropriate for an academic literature index.
- Interestingly, one result (“Trends in airborne pollen”) appeared despite being about pollen, not temperature — a tangential relevance hit likely driven by the word “trends.”

**Status: ✅ PASS**

-----

### Test 5.5 — Pagination test (page 2)

**Input:** `{ query: "Klimawandel", language: "de", page: 2, pageSize: 3 }`

**Result:** Page 2 returned successfully with correct `page: 2` in response. However, several items from page 1 (e.g., “Steigende Temperaturen”, “Extremere Hitze”, “Klimaindikatoren”) **reappear on page 2**.

**Observations:**

- ⚠️ **Pagination overlap:** Multiple items appear on both page 1 and page 2. This is a windowing bug — the offset is not being applied cleanly. Consumers cannot reliably paginate through the full result set without deduplication.
- The `totalResults: 435` figure is plausible and consistent across pages, so the total count itself is reliable.
- `pageSize: 3` was honored correctly (3 items per page when specified, not the 12-item default).

**Status: ⚠️ WARNING** — Duplicate results across pages.

-----

### Test 5.6 — Sort by `date-asc` (relevance degradation test)

**Input:** `{ query: "Pollen Birke", language: "de", sort: "date-asc", pageSize: 3 }`

**Result:** 171 total results. Top result is correctly about pollen forecasting (“Pollenprognose mit ICON”). Second result is about mountain/lee waves (Gebirgs- und Leewellen), third is about snow — clearly unrelated to pollen.

**Observations:**

- ⚠️ **Relevance degrades severely with `date-asc` sort.** When sorted by oldest-first, the ranking is dominated by page age rather than query relevance. Very old pages that tangentially mention the search terms float to the top. This behaviour is expected but should be documented — users expecting a chronological view of *relevant* results will be surprised.
- The `date-desc` sort (tested separately with “forecast warning”) performs better — recent, highly relevant pages appear at top.

**Status: ⚠️ WARNING** — `date-asc` sort severely degrades relevance; should be documented.

-----

## Tool 6: `fetch`

Fetches a MeteoSwiss webpage by content ID and returns it as markdown or plain text, with metadata. The `id` parameter accepts content identifiers discovered via the `search` tool.

-----

### Test 6.1 — Guessed short ID (pre-`search` baseline, `id="climate-change"`)

**Input:** `{ id: "climate-change" }`

**Result:** `Error: Content not found: climate-change`

**Status: ❌ FAIL** — confirms that short slugs are not valid IDs.

-----

### Test 6.2 — Guessed path (pre-`search` baseline, `id="/en/climate/..."`)

**Input:** `{ id: "/en/climate/swiss-climate-in-detail/climate-change-in-switzerland" }`

**Result:** `Error: Content not found: ...`

**Status: ❌ FAIL** — confirms that relative paths are not valid IDs.

-----

### Test 6.3 — Full URL from `search` results (German page)

**Input:** `{ id: "https://www.meteoschweiz.admin.ch/klima/klimawandel/steigende-temperaturen.html" }`

**Result:**

```json
{
  "id": "https://www.meteoschweiz.admin.ch/klima/klimawandel/steigende-temperaturen.html",
  "title": "Steigende Temperaturen",
  "content": "# Steigende Temperaturen\n\n",
  "format": "markdown",
  "metadata": {
    "url": "...",
    "language": "de",
    "contentType": "website",
    "keywords": ["Klima", "Klimawandel", "Temperatur", "Klimaszenarien"],
    "description": "Mit dem Klimawandel steigen die Temperaturen weltweit an..."
  }
}
```

**Status: ✅ PASS** — full URL from `search` resolves successfully.

**Critical observation:** The `content` field contains only `"# Steigende Temperaturen\n\n"` — just the page title. **No body text is returned.** The metadata `description` has a brief summary, but the actual article content is absent.

-----

### Test 6.4 — Full URL from `search` results (English page + press release)

**Input A:** `{ id: "https://www.meteoswiss.admin.ch/climate/climate-change/rising-temperatures.html" }`
**Result A:** `content: "# Rising temperatures\n\n## Contents area"` — again, only title and a section label. No body text.

**Input B:** `{ id: "https://www.meteoschweiz.admin.ch/ueber-uns/medien/medienmitteilungen/2025/wetter-und-klimadaten-frei-zugaenglich.html" }` (press release)
**Result B:** `content: "# Wetter- und Klimadaten frei zugänglich \n\n"` — only title. No body text.

**Input C:** `{ id: "https://www.meteoswiss.admin.ch/services-and-publications/publications/scientific-publications/2010/spatial-characteristics-of-gridded-swiss-temperature-trends.html" }` (publication)
**Result C:** `content: "# Spatial characteristics...\n\n## Contents area"` — title + section label. No body text.

**Status: ✅ PASS** (fetch resolves) / ⚠️ **Effectively limited** — content body is empty across all tested page types.

-----

**Analysis of `search` + `fetch` integration:**

The `search` → `fetch` workflow **does work** as a discovery mechanism: `search` returns full URLs that `fetch` accepts as valid `id` values. This resolves the earlier finding that `fetch` was “unusable without prior knowledge of valid IDs” — the correct workflow is to search first.

However, a critical content extraction issue remains: **`fetch` returns only page titles, not body text.** Across four tested pages (detail page DE, detail page EN, press release, scientific publication), the `content` field was limited to the `<h1>` title and at most one section header. No article body, no paragraph text, no data. The `metadata.description` field contains a brief (1–2 sentence) summary, which is useful but far from the full content.

This appears to be a **content extraction failure** in the MCP server’s HTML-to-markdown conversion — the page body text is not being captured, possibly due to JavaScript-rendered content, CMS-specific HTML structure, or a parsing bug. The `fetch` tool is therefore useful as a **metadata enricher** (title, keywords, description, language) but not as a **content reader**.

-----

## Cross-Cutting Observations

### Data Quality & Consistency

- All weather measurements are physically self-consistent (pressure reduces correctly with altitude, temperatures follow expected lapse rates, sea-level pressure is correctly absent at Jungfraujoch).
- Timestamps are in compact format `YYYYMMDDHHMI` (e.g., `202604032020`), not ISO 8601. LLM and downstream consumers may need to parse this manually — ISO 8601 would be preferable.
- The `source: "MeteoSwiss Open Data"` attribution is consistently present on all responses ✓.

### Forecast Cache Timing

All forecast responses share `"generated": "2026-04-03T04:00:25.770344Z"`. This means the entire forecast dataset is a single daily batch, published at ~04:00 UTC. The tool description says “updated hourly” — this should be verified against actual MeteoSwiss Open Data publication cadence, as the test data suggests daily publication.

### The Stale-Day Issue (Forecasts)

Forecast responses for postal codes and place names consistently include the previous calendar day as entry `[0]`, with `weather: null` and `weather_icon_url: null`. Station abbreviation queries (e.g., `JUN`) do not exhibit this behavior. Consumers must handle or filter this entry. The MCP server should either:

- Strip the stale entry before returning, or
- Document this explicitly so consumers know to skip `entry[0]` when `date < today`.

### Input Flexibility

The name/address resolution is a strong UX feature — accepting English names (“Zurich”), umlauts (“Zürich”), abbreviations (“SMA”, “JUN”), postal codes (“8001”), and street addresses. The only unresolved case is the non-intuitive station selection for address input (MAG instead of LUG for Lugano).

### `search` + `fetch` as a Workflow

The intended usage pattern — `search` to discover content, `fetch` to retrieve it — is architecturally sound and the ID format is consistent (full URLs). However, `fetch` currently returns only page titles and metadata, not body text. Until the content extraction issue is resolved, the pair is useful only for **content discovery and metadata lookup**, not for reading article content.

-----

## Issues Log

|# |Tool                      |Severity|Description                                                                                                                                          |
|--|--------------------------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
|1 |`meteoswissLocalForecast` |Medium  |Stale-day entry (yesterday, `weather: null`) included in postal code / place name responses, consuming one slot of requested `days`.                 |
|2 |`meteoswissPollenData`    |Medium  |Returns empty `stations: []` for all queries including broad all-station query. Reason unknown — may be seasonal data gap or upstream unavailability.|
|3 |`fetch`                   |High    |Content body is empty across all page types — only title and at most one section label returned. Body text is not extracted.                         |
|4 |`fetch`                   |Medium  |Tool description does not document that `id` must be a full absolute URL from `search` results. Short slugs and relative paths silently fail.        |
|5 |`search`                  |Medium  |Pagination overlap: items from page 1 reappear on page 2. Consumers cannot paginate without client-side deduplication.                               |
|6 |`search`                  |Low     |`date-asc` sort severely degrades relevance — results become dominated by page age rather than query match. Should be documented.                    |
|7 |`search`                  |Low     |`publicationDate` field is inconsistently present: appears on press releases and some content pages, absent on others.                               |
|8 |`meteoswissCurrentWeather`|Low     |Timestamp format (`YYYYMMDDHHMI`) is non-standard; ISO 8601 would improve interoperability.                                                          |
|9 |`meteoswissCurrentWeather`|Low     |“Zurich” resolves to KLO (airport) rather than SMA (Fluntern/city center). May surprise users expecting the canonical urban station.                 |
|10|`meteoswissLocalForecast` |Low     |`generated` timestamp suggests daily batch (04:00 UTC), not hourly as documented. Should be verified and corrected in docs.                          |
|11|`meteoswissCurrentWeather`|Low     |Address-based lookup (Lugano) resolves to MAG (Cadenazzo, ~15 km north) rather than LUG (Lugano, closer). Geocoding behavior undocumented.           |

-----

## Recommendations

1. **Fix content body extraction in `fetch`** — this is the most impactful issue. The tool returns only titles; body text must be extracted for the tool to fulfill its purpose. Investigate whether the MeteoSwiss CMS renders content via JavaScript (requiring a headless browser) or whether the HTML parser needs to target a different content container selector.
1. **Document `fetch` input format** — state clearly in the tool description that `id` must be a full absolute URL as returned by `search`. Mention the `search` → `fetch` workflow explicitly.
1. **Fix or document the stale-day issue** in `meteoswissLocalForecast`. Either filter out past dates server-side, or document the behavior clearly.
1. **Investigate `meteoswissPollenData`** — confirm whether data is seasonally unavailable, add a `"status"` or `"reason"` field to empty responses.
1. **Fix pagination deduplication in `search`** — ensure page offsets are applied correctly so consumers can iterate through the full result set.
1. **Document `date-asc` sort limitation** — note that chronological sorting trades off relevance for recency inversion.
1. **Standardise timestamps** to ISO 8601 in `meteoswissCurrentWeather`.
1. **Clarify forecast update cadence** — verify whether forecasts are truly hourly or daily, and update the tool description accordingly.
1. **Document address geocoding behavior** — note that address resolution may not select the geographically nearest station.

-----

*Report generated by Claude Sonnet 4.6 via MCP integration on 2026-04-03. All test results were independently verified with live data immediately before report generation.*