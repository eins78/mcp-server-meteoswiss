# meteoswiss-mcp

## 2.3.0-rc.3

### Patch Changes

- 5d21a9d: Complete B2 location-resolver fix. Non-Swiss inputs ("Paris"), invalid abbreviations ("NOTASTATION", "INVALID_STATION_XYZ"), invalid postal codes ("99999"), and gibberish ("ABCDE") now return helpful errors with examples and a pointer to `meteoswissStations`, matching the `meteoswissPollenData` reference pattern. Round-number parent postal codes ("1200" → Geneva, "3000" → Bern) resolve via a postal-code prefix fallback before geocoding. The geocoder's swisstopo query is now restricted to `zipcode`, `gg25`, `district`, and `kantone` origins for plain place-name / postal-code queries, so non-Swiss city names can no longer match arbitrary Swiss street labels.

## 2.3.0-rc.2

### Patch Changes

- Fix location resolver returning wrong data for ambiguous/invalid inputs, and normalize OBS visual observation boolean fields.
  - **Location resolver**: Scored name matching prevents "Bern" resolving to Bernina; Swiss bounding box and distance threshold reject non-Swiss queries; empty/whitespace input validation added
  - **OBS visual observations**: Boolean fields (has_rain, has_snowfall, etc.) now always present as true/false instead of being stripped when MeteoSwiss reports "-" (not observed)
  - **CI stability**: Integration tests share one MCP server per test file via beforeAll/afterAll, eliminating flaky startup timeouts

## 2.2.0

### Minor Changes

- 615eb7a: Add Tier 1 OGD features: SMN-precip stations, climate data tool, visual observations.
  - **SMN-precip**: Merge ~248 precipitation-only stations into meteoswissCurrentWeather (per-station CSV fallback)
  - **meteoswissClimateData**: New tool for NBCN homogeneous climate series (29 climate + 46 precip stations, daily/monthly/yearly)
  - **Visual observations**: Enrich currentWeather with cloud cover, fog, rain, snowfall, hail, snow coverage for 8 OBS stations
  - **CSV parser**: Replace custom parser with csv-parse/sync library

### Patch Changes

- 32373ae: Fix fetch tool returning empty content bodies, pollen data empty results, and forecast stale-day entries.
  - **fetch:** Extract content from MeteoSwiss web component attributes (`<mch-text html="...">`) that JSDOM cannot render via shadow DOM
  - **fetch:** Clarify that `id` parameter must be a full URL from search results
  - **pollen:** Update data URL from `_d_now.csv` to `_d_recent.csv` after MeteoSwiss OGD rename
  - **forecast:** Filter out past dates before slicing to requested days count
  - **search:** Document upstream pagination overlap and date-asc sort behavior

## 2.1.0

### Minor Changes

- 0ba372a: Add weather icon SVG URLs to forecast responses. Each daily forecast now includes a `weather_icon_url` field linking to the official MeteoSwiss SVG pictogram. The skill documentation is updated with the URL pattern.
